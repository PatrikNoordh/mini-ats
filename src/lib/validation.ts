import { z } from "zod";

import sv from "@/locales/sv.json";
import {
  MAX_EMAIL_LENGTH,
  MAX_JOB_DESCRIPTION_LENGTH,
  MAX_JOB_LOCATION_LENGTH,
  MAX_JOB_TITLE_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_PASSWORD_BYTES,
  MAX_PHONE_LENGTH,
  MAX_URL_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/constants";
import { isLinkedInUrl } from "@/lib/stages";

/** The roles an account can have. The same values as the check on `profiles.role`. */
export const roleSchema = z.enum(["admin", "customer"]);

/** The statuses a job can have. The same values as the check on `jobs.status`. */
export const jobStatusSchema = z.enum(["open", "closed"]);

/** The same loose email check the forms used before: something@something.something. */
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** A form error is the key of a message in `validation.*`, translated where it is shown. */
export type ValidationKey = keyof typeof sv.validation;

function isValidationKey(value: string): value is ValidationKey {
  return value in sv.validation;
}

/**
 * The first error of each field in a failed form schema. The schemas below use validation keys
 * as their messages, so the form can show them with `Field`.
 */
export function fieldErrors(error: z.ZodError): Record<string, ValidationKey> {
  const errors: Record<string, ValidationKey> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || field in errors || !isValidationKey(issue.message)) continue;
    errors[field] = issue.message;
  }
  return errors;
}

/** The job form. Trims every field; the title and location are required. */
export const jobInputSchema = z.object({
  title: z.string().trim().min(1, "title_required").max(MAX_JOB_TITLE_LENGTH, "too_long"),
  location: z.string().trim().min(1, "location_required").max(MAX_JOB_LOCATION_LENGTH, "too_long"),
  description: z.string().trim().max(MAX_JOB_DESCRIPTION_LENGTH, "too_long"),
});

export type JobInput = z.infer<typeof jobInputSchema>;

/**
 * The candidate form. Trims every field. The name and a valid email are required; the LinkedIn
 * URL is optional but must match the database check when it is given.
 */
export const candidateInputSchema = z.object({
  full_name: z.string().trim().min(1, "name_required").max(MAX_NAME_LENGTH, "too_long"),
  email: z.string().trim().max(MAX_EMAIL_LENGTH, "too_long").refine(isEmail, "email_invalid"),
  phone: z.string().trim().max(MAX_PHONE_LENGTH, "too_long"),
  linkedin_url: z
    .string()
    .trim()
    .max(MAX_URL_LENGTH, "too_long")
    .refine((url) => !url || isLinkedInUrl(url), "linkedin_invalid"),
  notes: z.string().trim().max(MAX_NOTES_LENGTH, "too_long"),
});

export type CandidateInput = z.infer<typeof candidateInputSchema>;

/** Length in bytes when encoded as UTF-8, the way Supabase Auth stores a password. */
export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

const requiredName = (message: ValidationKey) =>
  z.string().trim().min(1, message).max(MAX_NAME_LENGTH, "too_long");

/**
 * The new-account form. The same rules as `newAccountSchema` in admin-create-user, so every
 * error the function would return is shown under its field first.
 */
export const accountInputSchema = z.object({
  role: roleSchema,
  full_name: requiredName("name_required"),
  company_name: requiredName("company_required"),
  email: z.string().trim().max(MAX_EMAIL_LENGTH, "too_long").email("email_invalid"),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, "password_too_short")
    .refine((password) => utf8Length(password) <= MAX_PASSWORD_BYTES, "password_too_long"),
});

export type AccountInput = z.infer<typeof accountInputSchema>;
