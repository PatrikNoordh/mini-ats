/**
 * Search params as the text in the URL. The router's default reads `?q=1e3` as the number 1000,
 * `?q=true` as a boolean and `?q=null` as null, so the search field would not show what was typed.
 * Every route's zod schema reads text. A key given twice keeps its last value.
 */
export function parseSearch(searchStr: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(searchStr));
}

/** The reverse of parseSearch. A value that is undefined or null is left out of the URL. */
export function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const searchStr = params.toString();
  return searchStr ? `?${searchStr}` : "";
}

/** The router options that use them, shared by the app's router and the route tests. */
export const searchSerializer = { parseSearch, stringifySearch };
