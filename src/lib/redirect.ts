/** Any origin works here: it is only used to tell a path inside the app from a full URL. */
const APP_ORIGIN = "https://app.invalid";

/**
 * The page to return to after login, from `?redirect=`. Only a path inside the app is
 * accepted (`/jobs?x=1`), never a URL to another site (`https://…`, `//evil.test`, `/\evil.test`),
 * so the parameter cannot be used as an open redirect.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\s]/.test(value)) {
    return undefined;
  }
  const url = new URL(value, APP_ORIGIN);
  if (url.origin !== APP_ORIGIN || url.pathname === "/login") return undefined;
  return `${url.pathname}${url.search}${url.hash}`;
}
