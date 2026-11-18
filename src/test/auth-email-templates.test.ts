import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every email Supabase Auth can send has our own template, in Swedish and English, so no Supabase
// default ever goes out (ATS-49). supabase/config.toml points the local stack at the files, and
// docs/auth-email.md says how they reach the project when email is switched on there.
const CONFIG = readFileSync("supabase/config.toml", "utf8");

/** Each Auth email type, and what its template must carry for the email to work. */
const TEMPLATES = {
  // The app's own pages, which verify the token only when the user submits them (ATS-50, ATS-51).
  invite: "/accept-invite?token_hash={{ .TokenHash }}&amp;type=invite",
  recovery: "/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery",
  magic_link: "{{ .ConfirmationURL }}",
  confirmation: "{{ .ConfirmationURL }}",
  email_change: "{{ .ConfirmationURL }}",
  reauthentication: "{{ .Token }}",
} as const;

/** The key = "value" lines of one [section] in config.toml. */
function section(name: string): Map<string, string> {
  const start = CONFIG.indexOf(`[${name}]\n`);
  if (start === -1) return new Map();
  const body = CONFIG.slice(start + name.length + 3).split(/^\[/m)[0] ?? "";
  return new Map(
    [...body.matchAll(/^(\w+)\s*=\s*"([^"]*)"/gm)].map(([, key = "", value = ""]) => [key, value]),
  );
}

describe("Auth email templates", () => {
  for (const [type, variable] of Object.entries(TEMPLATES)) {
    describe(type, () => {
      const config = section(`auth.email.template.${type}`);
      const path = config.get("content_path")?.replace(/^\.\//, "") ?? "";

      it("has a subject in both languages and a template file", () => {
        expect(config.get("subject")).toMatch(/.+ · .+/);
        expect(path).toBe(`supabase/templates/${type}.html`);
        expect(existsSync(path)).toBe(true);
      });

      it("has a Swedish and an English part and what the email needs", () => {
        const html = existsSync(path) ? readFileSync(path, "utf8") : "";
        expect(html).toContain('<html lang="sv">');
        expect(html).toContain('<div lang="en">');
        expect(html.split(variable).length - 1).toBeGreaterThanOrEqual(2);
        // An action broken across lines is fragile once pasted into the dashboard. The
        // {{/* … */}} comment at the top may span lines.
        expect(html).not.toMatch(/\{\{(?!\/\*)[^}]*\n/);
      });
    });
  }

  it("keeps secure email change on, so both addresses must confirm", () => {
    expect(CONFIG).toMatch(/^double_confirm_changes = true$/m);
  });

  it("has no SMTP settings, so no key or sender can be committed", () => {
    expect(CONFIG).not.toContain("[auth.email.smtp]");
  });
});
