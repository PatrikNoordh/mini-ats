/// <reference types="node" />
// The address and keys of the local Supabase stack that `npx supabase start` runs (ATS-36). The
// end-to-end seed and Playwright read them from here, and refuse anything that is not local, so
// the tests can never write to the project.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
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

/** The version of each migration in supabase/migrations: the timestamp its file name starts with. */
export function migrationVersions(dir = "supabase/migrations"): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.split("_")[0] ?? name)
    .sort();
}

/**
 * The migrations the local stack's database has applied, read with psql in its container. The
 * container is named after project_id in supabase/config.toml, as `npx supabase start` names it.
 */
export function appliedMigrations(): string[] {
  const config = readFileSync("supabase/config.toml", "utf8");
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
  if (!projectId) throw new Error("supabase/config.toml has no project_id.");
  let output: string;
  try {
    output = execFileSync(
      "docker",
      [
        "exec",
        `supabase_db_${projectId}`,
        "psql",
        "-U",
        "postgres",
        "-tAc",
        "select version from supabase_migrations.schema_migrations order by version",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    throw new Error(
      "Could not read the local stack's migrations. Start it with: npx supabase start",
    );
  }
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The migrations in the repo that the local database has not applied, oldest first. */
export function missingMigrations(applied: readonly string[], inRepo: readonly string[]): string[] {
  const done = new Set(applied);
  return inRepo.filter((version) => !done.has(version));
}

/**
 * Refuses to run the end-to-end tests against an old schema (ATS-61). `npx supabase start`
 * restores the local database from its last backup and skips the migrations added since, so a
 * new migration would silently not be there.
 */
export function assertMigrationsApplied(applied: readonly string[], inRepo: readonly string[]) {
  const missing = missingMigrations(applied, inRepo);
  if (missing.length === 0) return;
  throw new Error(
    `The local database is missing ${missing.length} migration(s): ${missing.join(", ")}. ` +
      "npx supabase start restored it from its last backup and skipped them. " +
      "Run npx supabase stop --no-backup, then npx supabase start.",
  );
}
