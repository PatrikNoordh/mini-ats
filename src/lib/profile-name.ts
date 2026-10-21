import { AVATAR_INITIALS } from "./constants";
import type { Profile } from "@/types";

/** The name to show for an account. An account made in the dashboard may have no full name. */
export function displayName(profile: Pick<Profile, "full_name" | "email">): string {
  return profile.full_name.trim() || profile.email;
}

/** Up to AVATAR_INITIALS initials from a name, or from the part of an email before the @. */
export function initials(name: string): string {
  const [beforeAt = ""] = name.split("@");
  return beforeAt
    .split(/[\s._+-]+/)
    .filter(Boolean)
    .slice(0, AVATAR_INITIALS)
    .map((word) => Array.from(word)[0])
    .join("")
    .toUpperCase();
}
