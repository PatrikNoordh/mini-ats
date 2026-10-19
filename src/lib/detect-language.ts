import { createIsomorphicFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { languageFromCookies, LANGUAGE_COOKIE, parseLanguage } from "./language";

/** The language from the `lang` cookie: the request on the server, document.cookie in the browser. */
export const detectLanguage = createIsomorphicFn()
  .server(() => parseLanguage(getCookie(LANGUAGE_COOKIE)))
  .client(() => languageFromCookies(document.cookie));
