import { AVATAR_INITIALS } from "./constants";
import type { Profile } from "@/types";

/** The name to show for an account. An account made in the dashboard may have no full name. */
export function displayName(profile: Pick<Profile, "full_name" | "email">): string {
  return profile.full_name.trim() || profile.email;
}

/** Word breaks in a name: whitespace only, so "Anna-Lena Svensson" is two words (ATS-32). */
const NAME_BREAKS = /\s+/;
/**
 * Word breaks in the part of an email before the @. A hyphen joins a double name there too, so
 * "anna-lena.svensson" is two words, like the name it stands for.
 */
const EMAIL_BREAKS = /[._+]+/;

/** Up to AVATAR_INITIALS initials from a name, or from the part of an email before the @. */
export function initials(name: string): string {
  const [beforeAt = "", ...afterAt] = name.split("@");
  return beforeAt
    .split(afterAt.length > 0 ? EMAIL_BREAKS : NAME_BREAKS)
    .filter(Boolean)
    .slice(0, AVATAR_INITIALS)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
}
