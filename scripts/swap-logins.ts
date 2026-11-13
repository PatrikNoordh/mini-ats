/// <reference types="node" />
// Replaces each migrated company's first login with a new account (ATS-58, scripts/login-swap.ts).
// Run it once, from your own terminal, after the app that reads by company is live:
//
//   1. A data dump of the project, saved outside the repo:
//        npx supabase db dump --remote -f ../mini-ats-backup/schema.sql
//        npx supabase db dump --remote --data-only -f ../mini-ats-backup/data.sql
//   2. The dry run, which lists the logins it would replace and changes nothing:
//        npm run swap:logins
//   3. The swap:
//        npm run swap:logins -- --yes --dump ../mini-ats-backup/data.sql
//
// It reads VITE_SUPABASE_URL from .env.local and SUPABASE_SERVICE_ROLE_KEY from the shell or from
// .env.seed.local, like the demo seed (CLAUDE.md, rule 1). It never runs in CI, and Claude never
// runs it. Each new login gets a temporary password, printed once here: hand it to the user
// privately, as when an admin creates an account. Run it again to finish a swap that stopped.
import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { errorText, SwapBlockedError, supabaseSwapDeps, swapLogins } from "./login-swap.ts";

/** Bytes of randomness in a temporary password: 24 characters of base64url. */
const PASSWORD_BYTES = 18;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See the comment at the top of this script.`);
  return value;
}

/** The value after a flag, as in `--dump <file>`. */
function argument(flag: string): string | null {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? (process.argv[at + 1] ?? null) : null;
}

/**
 * Why the dump does not count, or null when it does: a file with content, outside the repo, so a
 * dump of real data is never committed (the repo is public).
 */
export function dumpProblem(path: string | null, repoRoot = REPO_ROOT): string | null {
  if (!path) return "Pass --dump <file>: a data dump of the project, saved outside the repo.";
  const file = resolve(path);
  const inside = relative(repoRoot, file);
  if (!inside.startsWith("..") && !isAbsolute(inside)) {
    return `The dump ${path} is inside the repo. Save it outside, so it is never committed.`;
  }
  try {
    const stat = statSync(file);
    if (!stat.isFile() || stat.size === 0) return `The dump ${path} is empty or not a file.`;
  } catch {
    return `The dump ${path} does not exist.`;
  }
  return null;
}

async function main() {
  const url = requireEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const apply = process.argv.includes("--yes");
  console.log(`Login swap for ${new URL(url).host}${apply ? "" : " (dry run)"}`);
  if (apply) {
    const problem = dumpProblem(argument("--dump"));
    if (problem) {
      console.log(problem);
      process.exitCode = 1;
      return;
    }
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { plan, results } = await swapLogins(supabaseSwapDeps(admin), {
    apply,
    password: () => randomBytes(PASSWORD_BYTES).toString("base64url"),
    log: (line) => console.log(line),
  });

  for (const skipped of plan.skipped) {
    console.log(`  skipped  ${skipped.email} (${skipped.company.name}): ${skipped.reason}`);
  }
  if (plan.swaps.length === 0) {
    console.log("  No login has a company's id. Nothing to swap.");
    return;
  }
  if (!apply) {
    for (const swap of plan.swaps) {
      console.log(`  ${swap.step.padEnd(8)} ${swap.email} (${swap.company.name})`);
    }
    console.log(
      "Nothing changed. Save a data dump outside the repo, then run with --yes --dump <file>.",
    );
    return;
  }
  for (const result of results) {
    if (result.error) {
      console.log(`  failed   ${result.email} (${result.company.name}): ${result.error}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`  swapped  ${result.email} (${result.company.name})`);
    // Printed once, here only. Hand it to the user privately.
    if (result.password) console.log(`           temporary password: ${result.password}`);
  }
  if (process.exitCode) console.log("Run the swap again to finish the ones that failed.");
}

// Run from the command line (npm run swap:logins), not when a test imports dumpProblem.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    // The error's message only: never the request, which carries the service role key.
    const code = error instanceof SwapBlockedError ? `${error.code}: ` : "";
    console.error(`The swap stopped: ${code}${errorText(error)}`);
    process.exitCode = 1;
  });
}
