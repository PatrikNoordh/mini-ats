/**
 * Errors cross the data layer as codes, never as user-facing text. The UI
 * translates them with t(`errors.${code}`). See docs/error-codes.md.
 */
export const ERROR_CODES = [
  "card_not_found",
  "job_not_found",
  "candidate_not_found",
  "email_exists",
  "invalid_input",
  "not_authenticated",
  "forbidden",
  "invalid_credentials",
  "too_many_attempts",
  "profile_not_found",
  "job_candidate_customer_mismatch",
  "application_not_found",
  "links_failed",
  "already_linked",
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

/** The code if the app knows it, for codes that come back from the server as text. */
export function toErrorCode(value: unknown): ErrorCode | null {
  return ERROR_CODES.find((code) => code === value) ?? null;
}

/** The code of a known error, or "unknown" for anything else (network, bugs). */
export function errorCode(error: unknown): ErrorCode | "unknown" {
  return error instanceof AppError ? error.code : "unknown";
}

/**
 * A database error as an AppError when its message is a known code, as raised by the triggers.
 * Any other error is returned as it is and shows as unknown.
 */
export function fromDbError(error: Error): Error {
  const code = toErrorCode(error.message);
  return code ? new AppError(code) : error;
}
