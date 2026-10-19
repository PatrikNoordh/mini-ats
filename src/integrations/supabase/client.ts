import { createClient } from "@supabase/supabase-js";

import { parseSupabaseConfig } from "./config";
import type { Database } from "./types";

const config = parseSupabaseConfig(import.meta.env);

/** The one Supabase client. Only `src/lib/api/` uses it (CLAUDE.md, how data access works). */
export const supabase = createClient<Database>(config.url, config.anonKey);
