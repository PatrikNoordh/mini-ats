import { z } from "npm:zod@3.25.76";

import { corsHeaders, json } from "../_shared/cors.ts";
import { utf8Length } from "../_shared/text.ts";
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from "../admin-create-user/handler.ts";

const requiredText = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const id = z.string().uuid();

/** The same rules as admin-create-user, so an edit can never store what creating refuses. */
export const updateSchema = z.object({
  action: z.literal("update"),
  id,
  role: z.enum(["admin", "customer"]),
  full_name: requiredText,
  company_name: requiredText,
  email: z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).email(),
  /** Left out to keep the password. */
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .refine((password) => utf8Length(password) <= MAX_PASSWORD_BYTES)
    .optional(),
});

export const requestSchema = z.discriminatedUnion("action", [
  updateSchema,
  z.object({ action: z.literal("delete"), id }),
  z.object({ action: z.literal("restore"), id }),
  z.object({ action: z.literal("delete_now"), id }),
]);

export type Update = z.infer<typeof updateSchema>;

/** The caller, according to `is_admin()` and Auth, both run with the caller's own JWT. */
export type Caller =
  { kind: "admin"; id: string } | { kind: "not_admin" } | { kind: "invalid_token" };

/** The target account as the calling admin sees it through RLS. */
export interface Account {
  id: string;
  role: "admin" | "customer";
  deleted: boolean;
}

/**
 * Why soft_delete_or_demote_account refused. It checks the account again, under the lock that
 * makes removals of admins wait for each other (ATS-33).
 */
export type RemovalRefusal = "account_not_found" | "account_deleted" | "last_admin";

/**
 * The Supabase actions, passed in so the flow can be tested without a project. Reads use the
 * caller's JWT; only the writes use the service role (CLAUDE.md, security rule 2).
 */
export interface Deps {
  getCaller: (authorization: string) => Promise<Caller>;
  getAccount: (authorization: string, id: string) => Promise<Account | null>;
  /** demote: the account is an admin and becomes a customer, so the last-admin check runs. */
  updateAccount: (
    update: Update,
    demote: boolean,
  ) => Promise<{ error: "email_exists" | RemovalRefusal } | null>;
  softDelete: (id: string) => Promise<RemovalRefusal | null>;
  restore: (id: string) => Promise<void>;
  deleteNow: (id: string) => Promise<void>;
}

type Refusal = "account_deleted" | "account_not_deleted" | "cannot_change_self";

/**
 * Why the action may not run, or null. The only limits are the ones that would leave no admin
 * able to sign in: an admin cannot delete or demote itself, nor the last active admin. The last
 * one is checked by the write itself, in the database, so two admins removing each other at the
 * same moment cannot both pass it.
 */
function refusal(
  callerId: string,
  account: Account,
  request: z.infer<typeof requestSchema>,
  removesAdmin: boolean,
): Refusal | null {
  if (request.action === "update" || request.action === "delete") {
    if (account.deleted) return "account_deleted";
  } else if (!account.deleted) {
    return "account_not_deleted";
  }
  if (account.id === callerId && (removesAdmin || request.action === "delete_now")) {
    return "cannot_change_self";
  }
  return null;
}

const refused = (error: "email_exists" | RemovalRefusal) =>
  json({ error }, error === "account_not_found" ? 404 : 409);

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "not_authenticated" }, 401);

    try {
      // The caller is checked before the body is even read.
      const caller = await deps.getCaller(authorization);
      if (caller.kind === "invalid_token") return json({ error: "not_authenticated" }, 401);
      if (caller.kind !== "admin") return json({ error: "forbidden" }, 403);

      const parsed = requestSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        const fields = [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body")),
        ];
        return json({ error: "invalid_input", fields }, 400);
      }
      const request = parsed.data;

      const account = await deps.getAccount(authorization, request.id);
      if (!account) return json({ error: "account_not_found" }, 404);
      const demote =
        account.role === "admin" && request.action === "update" && request.role !== "admin";
      const removesAdmin = demote || (account.role === "admin" && request.action === "delete");
      const refusedBefore = refusal(caller.id, account, request, removesAdmin);
      if (refusedBefore) return json({ error: refusedBefore }, 409);

      switch (request.action) {
        case "update": {
          const result = await deps.updateAccount(request, demote);
          if (result) return refused(result.error);
          break;
        }
        case "delete": {
          const result = await deps.softDelete(request.id);
          if (result) return refused(result);
          break;
        }
        case "restore":
          await deps.restore(request.id);
          break;
        case "delete_now":
          await deps.deleteNow(request.id);
          break;
      }
      return json({ id: request.id }, 200);
    } catch (error) {
      // Logged for the Supabase function logs. The body never holds the password.
      console.error("admin-manage-account failed", error);
      return json({ error: "unknown" }, 500);
    }
  };
}
