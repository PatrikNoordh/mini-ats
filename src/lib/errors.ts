import { FunctionsFetchError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { PG_CHECK_VIOLATION } from "./constants";

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
  "job_has_candidates",
  "text_too_long",
  "offline",
  "network_error",
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

/** The database's length checks are named <table>_<column>_length (ATS-23). */
const LENGTH_CHECK = /_length"/;

/**
 * A database error from a write as an AppError when a text was over its length limit, otherwise
 * the error as it is. The forms stop such text first, so this matters for clients out of date.
 */
export function fromWriteError(error: { code?: string; message: string }): unknown {
  return error.code === PG_CHECK_VIOLATION && LENGTH_CHECK.test(error.message)
    ? new AppError("text_too_long")
    : error;
}

/** What fetch rejects with when no answer came back, in Chrome, Firefox, Safari and Node. */
const FETCH_FAILURE = /Failed to fetch|NetworkError|Load failed|fetch failed/i;

/**
 * A request that never got an answer from the server. Each Supabase client reports it its own
 * way: data calls return `{ message: "TypeError: Failed to fetch" }`, Edge Functions throw
 * FunctionsFetchError and Auth throws AuthRetryableFetchError. Other errors, such as a TypeError
 * from a bug, do not count.
 */
function isNetworkFailure(error: unknown): boolean {
  if (error instanceof FunctionsFetchError || isAuthRetryableFetchError(error)) return true;
  if (typeof error !== "object" || error === null || !("message" in error)) return false;
  return typeof error.message === "string" && FETCH_FAILURE.test(error.message);
}

/**
 * The code of a known error. A request that got no answer is `offline` when the browser has no
 * connection and `network_error` when it has one. Anything else (bugs) is "unknown".
 */
export function errorCode(error: unknown): ErrorCode | "unknown" {
  if (error instanceof AppError) return error.code;
  if (isNetworkFailure(error)) {
    return typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "network_error";
  }
  return "unknown";
}

/**
 * A database error as an AppError when its message is a known code, as raised by the triggers.
 * Any other error is returned as it is and shows as unknown.
 */
export function fromDbError(error: Error): Error {
  const code = toErrorCode(error.message);
  return code ? new AppError(code) : error;
}
