import { z } from "zod";

import sv from "@/locales/sv.json";
import {
  MAX_JOB_DESCRIPTION_LENGTH,
  MAX_JOB_LOCATION_LENGTH,
  MAX_JOB_TITLE_LENGTH,
} from "@/lib/constants";

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
