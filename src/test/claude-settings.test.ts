import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * The deny rules in .claude/settings.json keep Claude Code from running remote Supabase commands
 * and from reading the CLI's access token (ATS-57, ATS-61 AC5). This test feeds every form of
 * those commands to the rules, as Claude Code matches them: `*` matches any text, a trailing
 * `:*` is the older prefix form, and a rule must match the whole command. It models the rule
 * syntax, not Claude Code itself, so a command it cannot see as one string (a variable, a script
 * that reads the file) is out of its reach: docs/data-safety.md § 7 lists those.
 */
const settingsSchema = z.object({
  permissions: z.object({ allow: z.array(z.string()), deny: z.array(z.string()) }),
});
const { permissions } = settingsSchema.parse(
  JSON.parse(readFileSync(".claude/settings.json", "utf8")),
);

function bashPatterns(rules: string[]): RegExp[] {
  return rules
    .map((rule) => /^Bash\((.*)\)$/.exec(rule)?.[1])
    .filter((pattern): pattern is string => pattern !== undefined)
    .map((pattern) => {
      const body = pattern.endsWith(":*") ? `${pattern.slice(0, -2)}*` : pattern;
      const source = body
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*");
      return new RegExp(`^${source}$`, "s");
    });
}

const deny = bashPatterns(permissions.deny);
const allow = bashPatterns(permissions.allow);
const denied = (command: string) => deny.some((rule) => rule.test(command));
const allowed = (command: string) => allow.some((rule) => rule.test(command));

/** Every way to run the CLI that the rules name. */
const FORMS = [
  "npx supabase",
  "npx supabase@3.1.0",
  "npx -y supabase",
  "npx --yes supabase",
  "npm exec supabase --",
  "node_modules/.bin/supabase",
  "./node_modules/.bin/supabase",
  "supabase",
];

/** Commands that reach the project, or log in to it. */
const REMOTE = [
  "db push",
  "db push --remote --dry-run",
  "migration repair --status applied 20261113120000",
  "migration list --remote",
  "migration fetch",
  "link --project-ref abcdefghijklmnop",
  "unlink",
  "login",
  "db reset --remote",
  "db pull",
  "db dump --remote -f dump.sql",
  "functions deploy admin-create-user",
  "functions delete admin-create-user",
  "functions download admin-create-user",
  "functions list",
  "secrets set KEY=value",
  "secrets unset KEY",
  "secrets list",
  "projects list",
  "inspect db locks",
  "storage ls ss:///cvs",
  "config push",
  "branches list",
  "backups list",
  "postgres-config get",
  "pull",
  "bootstrap",
  "orgs list",
  "whoami",
  "domains get",
  "encryption get-root-key",
  "network-bans get",
  "network-restrictions get",
  "ssl-enforcement get",
  "sso list",
  "vanity-subdomains get",
  "notebooks",
  "snippets list",
  "gen types typescript --remote",
  "db diff --linked",
  "status --project-ref abcdefghijklmnop",
  "gen types typescript --project-id abcdefghijklmnop",
  "db push --db-url postgresql://example",
];

/** Reads of the access token, in the file the CLI keeps it in or the macOS keychain. */
const TOKEN_READS = [
  "cat ~/.supabase/access-token",
  "cat $HOME/.supabase/access-token",
  'cat "$HOME/.supabase/access-token"',
  "cat ~/.supa*/access-token",
  "ls -la ~/.supa*",
  "find ~ -name access-token",
  "find $HOME -name access-token",
  'find "$HOME" -name access-token',
  "security find-generic-password -s 'Supabase CLI' -w",
  "security find-internet-password -s supabase.com",
  "security dump-keychain",
];

describe("the Claude Code deny rules for Supabase (.claude/settings.json)", () => {
  it.each(FORMS.flatMap((form) => REMOTE.map((command) => `${form} ${command}`)))(
    "deny %s",
    (command) => {
      expect(denied(command)).toBe(true);
    },
  );

  it.each(TOKEN_READS)("deny reading the token: %s", (command) => {
    expect(denied(command)).toBe(true);
  });

  it("deny the Read tool the token folder", () => {
    expect(permissions.deny).toContain("Read(~/.supabase/**)");
  });

  it.each([
    "npx supabase start",
    "npx supabase stop",
    "npx supabase stop --no-backup",
    "npx supabase status",
    "npx supabase status -o json",
  ])("allow the local stack: %s", (command) => {
    expect(denied(command)).toBe(false);
    expect(allowed(command)).toBe(true);
  });

  it("allow the project's own checks", () => {
    for (const command of ["npm run lint", "npx tsc --noEmit", "npm test", "npm run build"]) {
      expect(denied(command)).toBe(false);
    }
  });
});
