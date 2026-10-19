/**
 * Errors cross the data layer as codes, never as user-facing text. The UI
 * translates them with t(`errors.${code}`). See docs/error-codes.md.
 */
export const ERROR_CODES = [
  "card_not_found",
  "job_not_found",
  "candidate_not_found",
  "email_exists",
  "invalid_credentials",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.name = "AppError";
    this.code = code;
  }
}

/** The code of a known error, or "unknown" for anything else (network, bugs). */
export function errorCode(error: unknown): ErrorCode | "unknown" {
  return error instanceof AppError ? error.code : "unknown";
}
