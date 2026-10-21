import { useRouter, useRouterState } from "@tanstack/react-router";
import { languageCookie, type Language } from "@/lib/language";

/** The active language and a setter that stores it in the cookie and re-renders the app. */
export function useLanguage() {
  const router = useRouter();
  const language = useRouterState({ select: (s) => s.matches[0]?.context.language });
  const setLanguage = async (next: Language) => {
    document.cookie = languageCookie(next, window.location.protocol === "https:");
    await router.invalidate();
  };
  return { language, setLanguage };
}
