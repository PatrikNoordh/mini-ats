import { z } from "zod";

import sv from "@/locales/sv.json";
import {
  CV_MIME_TYPE,
  MAX_CV_BYTES,
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

/** Own keys only, so a message like "constructor" or "toString" is not taken for a key. */
export function isValidationKey(value: string): value is ValidationKey {
  return Object.hasOwn(sv.validation, value);
}

/** The errors a form shows: at most one validation key per field of its schema. */
export type FormErrors<T> = Partial<Record<keyof T & string, ValidationKey>>;

/**
 * The first error of each field in a failed form schema. The schemas below use validation keys
 * as their messages, so the form can show them with `Field`. The result is typed by the schema's
 * fields, so a form that reads a field the schema does not have fails the type check.
 */
export function fieldErrors<Field extends string>(
  schema: { shape: Record<Field, unknown> },
  error: z.ZodError,
): Partial<Record<Field, ValidationKey>> {
  const isField = (key: unknown): key is Field =>
    typeof key === "string" && Object.hasOwn(schema.shape, key);
  const errors: Partial<Record<Field, ValidationKey>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (!isField(field) || errors[field] || !isValidationKey(issue.message)) continue;
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

const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "password_too_short")
  .refine((password) => utf8Length(password) <= MAX_PASSWORD_BYTES, "password_too_long");

/**
 * The new-account form. The same rules as `newAccountSchema` in admin-create-user, so every
 * error the function would return is shown under its field first.
 */
export const accountInputSchema = z.object({
  role: roleSchema,
  full_name: requiredName("name_required"),
  company_name: requiredName("company_required"),
  email: z.string().trim().max(MAX_EMAIL_LENGTH, "too_long").email("email_invalid"),
  password: passwordSchema,
});

export type AccountInput = z.infer<typeof accountInputSchema>;

/** Editing an account: the same rules as admin-manage-account, and an empty password keeps it. */
export const accountUpdateSchema = accountInputSchema.extend({
  password: z.union([z.literal(""), passwordSchema]),
});

/**
 * A CV file the cvs bucket accepts: a PDF with content, of at most MAX_CV_BYTES (ATS-17). The
 * candidate form shows the message under its CV field, the candidate panel in a toast.
 */
const cvFileSchema = z.object({
  type: z.literal(CV_MIME_TYPE, { message: "cv_not_pdf" }),
  size: z.number().min(1, "cv_empty").max(MAX_CV_BYTES, "cv_too_large"),
});

/** Why a chosen file cannot be a CV, as a validation key, or null when it can. */
export function cvFileError(file: { type: string; size: number }): ValidationKey | null {
  const result = cvFileSchema.safeParse({ type: file.type, size: file.size });
  if (result.success) return null;
  const message = result.error.issues[0]?.message ?? "";
  return isValidationKey(message) ? message : "cv_not_pdf";
}

/**
 * Changing your own password (ATS-34). The new password follows the same rules as a password an
 * admin sets, must be typed twice, and must differ from the current one.
 */
export const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1, "current_password_required"),
    new_password: passwordSchema,
    confirm_password: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.confirm_password !== value.new_password) {
      ctx.addIssue({ code: "custom", path: ["confirm_password"], message: "password_mismatch" });
    }
    if (value.current_password && value.new_password === value.current_password) {
      ctx.addIssue({ code: "custom", path: ["new_password"], message: "password_same" });
    }
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
