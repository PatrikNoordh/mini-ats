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

export const newAccountSchema = z.object({
  role: z.enum(["admin", "customer"]),
  full_name: requiredText,
  company_name: requiredText,
  email: z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).email(),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .refine((password) => utf8Length(password) <= MAX_PASSWORD_BYTES),
});

export type NewAccount = z.infer<typeof newAccountSchema>;

/** Who is calling, according to `is_admin()` run with the caller's own JWT. */
export type Caller = "admin" | "not_admin" | "invalid_token";

export type CreateResult = { id: string } | { error: "email_exists" };

/** The two Supabase actions, passed in so the flow can be tested without a project. */
export interface Deps {
  checkCaller: (authorization: string) => Promise<Caller>;
  createUser: (account: NewAccount) => Promise<CreateResult>;
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

      const result = await deps.createUser(parsed.data);
      if ("error" in result) return json({ error: result.error }, 409);
      return json({ id: result.id }, 201);
    } catch (error) {
      // Logged for the Supabase function logs. The body never holds the password.
      console.error("admin-create-user failed", error);
      return json({ error: "unknown" }, 500);
    }
  };
}
