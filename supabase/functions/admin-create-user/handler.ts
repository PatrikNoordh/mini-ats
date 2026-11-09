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
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH)
      .refine((password) => utf8Length(password) <= MAX_PASSWORD_BYTES),
    /** A customer joins this existing company (ATS-46). */
    company_id: z.string().uuid().optional(),
    /**
     * Or a new company with this name. The accounts page on main (ATS-45) sends it for every
     * account, so for an admin it is ignored, and for a customer it creates their company.
     */
    company_name: requiredText.optional(),
  })
  .superRefine((account, ctx) => {
    const issue = (path: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path] });
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

/** The account Auth creates. company_name fills the old profiles column until it is dropped. */
export interface AuthAccount {
  role: NewAccount["role"];
  full_name: string;
  email: string;
  password: string;
  company_name: string | null;
}

/** Who is calling, according to `is_admin()` run with the caller's own JWT. */
export type Caller = "admin" | "not_admin" | "invalid_token";

export type CreateResult = { id: string } | { error: "email_exists" };

/** A company as the calling admin sees it through RLS. */
export interface Company {
  id: string;
  name: string;
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
  addMember: (companyId: string, userId: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
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

      if (role === "admin") {
        const result = await deps.createUser({
          role,
          full_name,
          email,
          password,
          company_name: null,
        });
        if ("error" in result) return json({ error: result.error }, 409);
        return json({ id: result.id, company_id: null }, 201);
      }

      // A customer: their company first, an existing one or a new one, so a failure leaves no
      // account without a company. A new company is removed again if the account is not made.
      let companyId: string;
      let companyName: string;
      let newCompany = false;
      if (account.company_id) {
        const company = await deps.getCompany(authorization, account.company_id);
        if (!company) return json({ error: "company_not_found" }, 404);
        if (company.deleted) return json({ error: "company_deleted" }, 409);
        companyId = company.id;
        companyName = company.name;
      } else {
        companyName = account.company_name ?? "";
        companyId = await deps.createCompany(companyName);
        newCompany = true;
      }
      const dropNewCompany = (cause: unknown) =>
        newCompany ? undo(() => deps.deleteCompany(companyId), cause) : Promise.resolve();

      let result: CreateResult;
      try {
        result = await deps.createUser({
          role,
          full_name,
          email,
          password,
          company_name: companyName,
        });
      } catch (error) {
        await dropNewCompany(error);
        throw error;
      }
      if ("error" in result) {
        await dropNewCompany(result.error);
        return json({ error: result.error }, 409);
      }

      // The membership is written with the service role after the account exists. Without it the
      // account could see nothing, so it is deleted again, and a new company with it.
      const userId = result.id;
      try {
        await deps.addMember(companyId, userId);
      } catch (error) {
        await undo(() => deps.deleteUser(userId), error);
        await dropNewCompany(error);
        throw error;
      }
      return json({ id: userId, company_id: companyId }, 201);
    } catch (error) {
      // Logged for the Supabase function logs. The body never holds the password.
      console.error("admin-create-user failed", error);
      return json({ error: "unknown" }, 500);
    }
  };
}
