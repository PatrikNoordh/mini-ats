import { z } from "zod";

// The project URL and the anon key are public: RLS decides what the anon key can read.
// The service role key never comes here (CLAUDE.md, security rule 1).
const supabaseConfigSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

export type SupabaseConfig = { url: string; anonKey: string };

/** Reads the Supabase settings from the Vite env, or throws when one is missing. */
export function parseSupabaseConfig(env: Record<string, unknown>): SupabaseConfig {
  const result = supabaseConfigSchema.safeParse(env);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid Supabase config: ${keys}. See .env.example.`);
  }
  return { url: result.data.VITE_SUPABASE_URL, anonKey: result.data.VITE_SUPABASE_ANON_KEY };
}
