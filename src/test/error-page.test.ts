import { describe, expect, it } from "vitest";

import { renderErrorPage, THEME_TOKENS } from "@/lib/error-page";

describe("server error page", () => {
  it("inlines the colour tokens from styles.css", () => {
    expect(THEME_TOKENS).toMatch(/^:root\s*\{/);
    for (const token of ["--background", "--foreground", "--primary", "--border"]) {
      expect(THEME_TOKENS).toContain(`${token}:`);
    }
  });

  it("uses theme variables, not raw colours", () => {
    const html = renderErrorPage();
    const styles = html.replace(THEME_TOKENS, "");
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|oklch\(/);
    expect(styles).toContain("var(--primary)");
  });

  it("renders in the language from the cookie", () => {
    const request = new Request("https://example.test/", { headers: { cookie: "lang=en" } });
    const html = renderErrorPage(request);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("The page could not be loaded");
    expect(renderErrorPage()).toContain('<html lang="sv">');
  });
});
