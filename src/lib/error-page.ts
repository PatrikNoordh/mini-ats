import themeCss from "../styles.css?raw";
import { getT } from "./i18n";
import { languageFromCookies } from "./language";

/**
 * The `:root` block of styles.css: the same colour tokens the app uses. This page is
 * served without the app's stylesheet, so it inlines them instead of copying values.
 */
export const THEME_TOKENS = themeCss.match(/:root\s*\{[^}]*\}/)?.[0] ?? "";

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text for use in HTML content and quoted attributes. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

/** Plain HTML error page for server failures, in the language from the request's cookie. */
export function renderErrorPage(request?: Request): string {
  const language = languageFromCookies(request?.headers.get("cookie"));
  const translate = getT(language);
  // Translations are plain text, so every one is escaped before it goes into the HTML.
  const t = (key: "title" | "description" | "retry" | "home") =>
    escapeHtml(translate(`errorPage.${key}`));
  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8" />
    <title>${t("title")}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      ${THEME_TOKENS}
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: var(--background); color: var(--foreground); display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: var(--muted-foreground); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: var(--radius); font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: var(--primary); color: var(--primary-foreground); }
      .secondary { background: var(--card); color: var(--foreground); border-color: var(--border); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${t("title")}</h1>
      <p>${t("description")}</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">${t("retry")}</button>
        <a class="secondary" href="/">${t("home")}</a>
      </div>
    </div>
  </body>
</html>`;
}
