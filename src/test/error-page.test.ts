import { describe, expect, it } from "vitest";

import { escapeHtml, renderErrorPage, THEME_TOKENS } from "@/lib/error-page";
import { getI18n } from "@/lib/i18n";

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

  it("escapes every translated string", () => {
    const i18n = getI18n("en");
    const keys = ["title", "description", "retry", "home"] as const;
    const original = new Map(keys.map((key) => [key, i18n.t(`errorPage.${key}`)]));
    for (const key of keys) {
      i18n.addResource("en", "translation", `errorPage.${key}`, `<b>${key}</b> & "more"`);
    }
    try {
      const html = renderErrorPage(
        new Request("https://example.test/", { headers: { cookie: "lang=en" } }),
      );
      for (const key of keys) {
        expect(html).toContain(`&lt;b&gt;${key}&lt;/b&gt; &amp; &quot;more&quot;`);
      }
      expect(html).not.toContain("<b>");
    } finally {
      original.forEach((text, key) =>
        i18n.addResource("en", "translation", `errorPage.${key}`, text),
      );
    }
  });

  it("escapes the HTML special characters", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;",
    );
  });
});
