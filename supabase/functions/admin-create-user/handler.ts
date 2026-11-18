import { z } from "npm:zod@3.25.76";

import { corsHeaders, json } from "../_shared/cors.ts";
import { utf8Length } from "../_shared/text.ts";

/** Same minimum as MIN_PASSWORD_LENGTH in src/lib/constants.ts, which the form checks first. */
export const MIN_PASSWORD_LENGTH = 8;
/** Supabase Auth hashes passwords with bcrypt, which only reads the first 72 bytes of UTF-8. */
export const MAX_PASSWORD_BYTES = 72;
/** The longest address SMTP allows. */
export const MAX_EMAIL_LENGTH = 254;
export const MAX_NAME_LENGTH = 200;

const requiredText = z.string().trim().min(1).max(MAX_NAME_LENGTH);

export const newAccountSchema = z
  .object({
    role: z.enum(["admin", "customer"]),
    full_name: requiredText,
    email: z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).email(),
    /** A temporary password the admin hands over. Left out when the account is invited. */
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH)
      .refine((password) => utf8Length(password) <= MAX_PASSWORD_BYTES)
      .optional(),
    /** Or an invite by email: the user chooses their own password (ATS-50). */
    invite: z.literal(true).optional(),
    /** A customer joins this existing company (ATS-46). */
    company_id: z.string().uuid().optional(),
    /** Or a new company with this name. Ignored for an admin, who belongs to no company. */
    company_name: requiredText.optional(),
  })
  .superRefine((account, ctx) => {
    const issue = (path: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path] });
    // Exactly one way in: a password, or an invite.
    if ((account.invite === true) === (account.password !== undefined)) issue("password");
    // An admin belongs to no company (ATS-44).
    if (account.role === "admin" && account.company_id) issue("company_id");
    if (account.role === "customer" && !account.company_id && !account.company_name) {
      issue("company_id");
    }
    if (account.role === "customer" && account.company_id && account.company_name) {
      issue("company_name");
    }
  });

export type NewAccount = z.infer<typeof newAccountSchema>;

/**
 * The account Auth creates. Without a password it is created unconfirmed, so nobody can sign in
 * to it until the invite is accepted (ATS-50).
 */
export interface AuthAccount {
  role: NewAccount["role"];
  full_name: string;
  email: string;
  password?: string;
}

/** Why an invite was not sent: Auth could not send the email, or refused it (a rate limit). */
export type InviteRefusal = "invite_not_sent";

/** Who is calling, according to `is_admin()` run with the caller's own JWT. */
export type Caller = "admin" | "not_admin" | "invalid_token";

export type CreateResult = { id: string } | { error: "email_exists" };

/** A company as the calling admin sees it through RLS. */
export interface Company {
  id: string;
  deleted: boolean;
}

/**
 * The Supabase actions, passed in so the flow can be tested without a project. The company is
 * read with the caller's JWT; the writes use the service role (CLAUDE.md, security rule 2).
 */
export interface Deps {
  checkCaller: (authorization: string) => Promise<Caller>;
  getCompany: (authorization: string, id: string) => Promise<Company | null>;
  /** Creates a company; the database gives it the six default columns. Returns its id. */
  createCompany: (name: string) => Promise<string>;
  deleteCompany: (id: string) => Promise<void>;
  createUser: (account: AuthAccount) => Promise<CreateResult>;
  /** The database refuses a company deleted since it was read, with company_deleted (ATS-61). */
  addMember: (companyId: string, userId: string) => Promise<"company_deleted" | null>;
  deleteUser: (id: string) => Promise<void>;
  /** Emails the invite to the account just created, with the invite template (ATS-50). */
  sendInvite: (email: string) => Promise<InviteRefusal | null>;
}

/** Runs an undo after a failed step, and logs it if the undo fails too. */
async function undo(action: () => Promise<void>, cause: unknown): Promise<void> {
  try {
    await action();
  } catch (undoError) {
    console.error("admin-create-user: the undo failed too", { cause, undoError });
  }
}

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "not_authenticated" }, 401);

    try {
      // The caller is checked before the body is even read.
      const caller = await deps.checkCaller(authorization);
      if (caller === "invalid_token") return json({ error: "not_authenticated" }, 401);
      if (caller !== "admin") return json({ error: "forbidden" }, 403);

      const parsed = newAccountSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        const fields = [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body")),
        ];
        return json({ error: "invalid_input", fields }, 400);
      }
      const account = parsed.data;
      const { role, full_name, email, password } = account;
      const authAccount: AuthAccount = {
        role,
        full_name,
        email,
        ...(password ? { password } : {}),
      };

      /**
       * Sends the invite once the account is complete, and undoes the account and a new company
       * when it is not sent: an invited account nobody can reach would only block its address.
       */
      const invite = async (
        userId: string,
        dropCompany: (cause: unknown) => Promise<void>,
      ): Promise<Response | null> => {
        if (!account.invite) return null;
        let refusal: InviteRefusal | null;
        try {
          refusal = await deps.sendInvite(email);
        } catch (error) {
          await undo(() => deps.deleteUser(userId), error);
          await dropCompany(error);
          throw error;
        }
        if (!refusal) return null;
        await undo(() => deps.deleteUser(userId), refusal);
        await dropCompany(refusal);
        return json({ error: refusal }, 502);
      };

      if (role === "admin") {
        const result = await deps.createUser(authAccount);
        if ("error" in result) return json({ error: result.error }, 409);
        const failed = await invite(result.id, () => Promise.resolve());
        if (failed) return failed;
        return json({ id: result.id, company_id: null }, 201);
      }

      // A customer: their company first, an existing one or a new one, so a failure leaves no
      // account without a company. A new company is removed again if the account is not made.
      let companyId: string;
      let newCompany = false;
      if (account.company_id) {
        const company = await deps.getCompany(authorization, account.company_id);
        if (!company) return json({ error: "company_not_found" }, 404);
        if (company.deleted) return json({ error: "company_deleted" }, 409);
        companyId = company.id;
      } else {
        companyId = await deps.createCompany(account.company_name ?? "");
        newCompany = true;
      }
      const dropNewCompany = (cause: unknown) =>
        newCompany ? undo(() => deps.deleteCompany(companyId), cause) : Promise.resolve();

      let result: CreateResult;
      try {
        result = await deps.createUser(authAccount);
      } catch (error) {
        await dropNewCompany(error);
        throw error;
      }
      if ("error" in result) {
        await dropNewCompany(result.error);
        return json({ error: result.error }, 409);
      }

      // The membership is written with the service role after the account exists. Without it the
      // account could see nothing, so it is deleted again, and a new company with it. A company
      // deleted meanwhile refuses it; one deleted after it bans the new login with its members.
      const userId = result.id;
      let refusal: "company_deleted" | null;
      try {
        refusal = await deps.addMember(companyId, userId);
      } catch (error) {
        await undo(() => deps.deleteUser(userId), error);
        await dropNewCompany(error);
        throw error;
      }
      if (refusal) {
        await undo(() => deps.deleteUser(userId), refusal);
        await dropNewCompany(refusal);
        return json({ error: refusal }, 409);
      }
      const failed = await invite(userId, dropNewCompany);
      if (failed) return failed;
      return json({ id: userId, company_id: companyId }, 201);
    } catch (error) {
      // Logged for the Supabase function logs. The body never holds the password.
      console.error("admin-create-user failed", error);
      return json({ error: "unknown" }, 500);
    }
  };
}
