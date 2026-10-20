import { z } from "zod";

import type sv from "@/locales/sv.json";

/** The roles an account can have. The same values as the check on `profiles.role`. */
export const roleSchema = z.enum(["admin", "customer"]);

/** The same loose email check the forms used before: something@something.something. */
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** A form error is the key of a message in `validation.*`, translated where it is shown. */
export type ValidationKey = keyof typeof sv.validation;
