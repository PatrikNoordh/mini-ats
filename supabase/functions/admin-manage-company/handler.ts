import { z } from "npm:zod@3.25.76";

import { corsHeaders, json } from "../_shared/cors.ts";
import { MAX_NAME_LENGTH } from "../admin-create-user/handler.ts";

const name = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const id = z.string().uuid();

export const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name }),
  z.object({ action: z.literal("rename"), id, name }),
  z.object({ action: z.literal("delete"), id }),
  z.object({ action: z.literal("restore"), id }),
  z.object({ action: z.literal("delete_now"), id }),
]);

export type CompanyRequest = z.infer<typeof requestSchema>;

/** Who is calling, according to `is_admin()` run with the caller's own JWT. */
export type Caller = "admin" | "not_admin" | "invalid_token";

/** The company as the calling admin sees it through RLS. */
export interface Company {
  id: string;
  deleted: boolean;
}

/**
 * The Supabase actions, passed in so the flow can be tested without a project. Reads use the
 * caller's JWT; only the writes use the service role (CLAUDE.md, security rule 2).
 */
export interface Deps {
  checkCaller: (authorization: string) => Promise<Caller>;
  getCompany: (authorization: string, id: string) => Promise<Company | null>;
  /** Creates the company; the database gives it the six default columns. Returns its id. */
  create: (name: string) => Promise<string>;
  rename: (id: string, name: string) => Promise<void>;
  /** Marks the company deleted and bans its members' logins, or undoes both and throws. */
  softDelete: (id: string) => Promise<void>;
  /** Lifts the bans of its members who are not deleted themselves, then unmarks the company. */
  restore: (id: string) => Promise<void>;
  /** The CV folder, the members' logins, then the company and all its data (company-purge.ts). */
  deleteNow: (id: string) => Promise<void>;
}

type Refusal = "company_deleted" | "company_not_deleted";

/** Rename and delete need an active company; restore and delete for good a deleted one. */
function refusal(company: Company, action: CompanyRequest["action"]): Refusal | null {
  if (action === "rename" || action === "delete") return company.deleted ? "company_deleted" : null;
  return company.deleted ? null : "company_not_deleted";
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

      const parsed = requestSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        const fields = [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body")),
        ];
        return json({ error: "invalid_input", fields }, 400);
      }
      const request = parsed.data;

      if (request.action === "create") return json({ id: await deps.create(request.name) }, 201);

      const company = await deps.getCompany(authorization, request.id);
      if (!company) return json({ error: "company_not_found" }, 404);
      const refused = refusal(company, request.action);
      if (refused) return json({ error: refused }, 409);

      switch (request.action) {
        case "rename":
          await deps.rename(request.id, request.name);
          break;
        case "delete":
          await deps.softDelete(request.id);
          break;
        case "restore":
          await deps.restore(request.id);
          break;
        case "delete_now":
          await deps.deleteNow(request.id);
          break;
      }
      return json({ id: request.id }, 200);
    } catch (error) {
      console.error("admin-manage-company failed", error);
      return json({ error: "unknown" }, 500);
    }
  };
}
