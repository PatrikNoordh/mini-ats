/// <reference types="node" />
// The address and keys of the local Supabase stack that `npx supabase start` runs (ATS-36). The
// end-to-end seed and Playwright read them from here, and refuse anything that is not local, so
// the tests can never write to the project.
import { execFileSync } from "node:child_process";
import { z } from "zod";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

// The names `npx supabase status -o json` prints. The keys are the CLI's fixed local defaults.
const statusSchema = z.object({
  API_URL: z.string().url(),
  ANON_KEY: z.string().min(1),
  SERVICE_ROLE_KEY: z.string().min(1),
});

export interface LocalStack {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

/** Reads the local stack from E2E_* variables (CI sets them) or from `npx supabase status`. */
function readStatus(): z.infer<typeof statusSchema> {
  const { E2E_SUPABASE_URL, E2E_ANON_KEY, E2E_SERVICE_ROLE_KEY } = process.env;
  if (E2E_SUPABASE_URL && E2E_ANON_KEY && E2E_SERVICE_ROLE_KEY) {
    return statusSchema.parse({
      API_URL: E2E_SUPABASE_URL,
      ANON_KEY: E2E_ANON_KEY,
      SERVICE_ROLE_KEY: E2E_SERVICE_ROLE_KEY,
    });
  }
  let output: string;
  try {
    output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("The local Supabase stack is not running. Start it with: npx supabase start");
  }
  return statusSchema.parse(JSON.parse(output));
}

export function localStack(): LocalStack {
  const status = readStatus();
  const host = new URL(status.API_URL).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing ${host}: the end-to-end tests only run against the local stack.`);
  }
  return {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  };
}
