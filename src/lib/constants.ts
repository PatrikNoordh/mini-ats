// Named values for the app. Change them here, never inline.

/** Milliseconds in one day, for date maths. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A card that has been in its stage this many days or more is shown as stale. */
export const STALE_CARD_DAYS = 14;

/** Mouse drag starts after the pointer moves this far, so a click still opens the card. */
export const DRAG_MOUSE_DISTANCE_PX = 6;
/** Touch drag starts after holding this long, so a quick swipe scrolls the board instead. */
export const DRAG_TOUCH_DELAY_MS = 180;
/** How far a finger may move during the hold before the drag is cancelled. */
export const DRAG_TOUCH_TOLERANCE_PX = 8;

/** Minimum length of a password set by an admin. Same as in the admin-create-user function. */
export const MIN_PASSWORD_LENGTH = 8;
/**
 * Supabase Auth hashes passwords with bcrypt, which only reads 72 bytes of UTF-8, so å, ä and ö
 * count as two. Same as admin-create-user.
 */
export const MAX_PASSWORD_BYTES = 72;
/**
 * The longest token the accept-invite page reads from its link (ATS-50). Auth's token hashes are
 * 56 characters; anything far longer is no invite.
 */
export const MAX_TOKEN_HASH_LENGTH = 256;
/** The longest email address SMTP allows. Same as admin-create-user and the database check. */
export const MAX_EMAIL_LENGTH = 254;
/**
 * Longest name or company name for an account, and longest candidate name. Same as
 * admin-create-user and the database check on candidates.full_name.
 */
export const MAX_NAME_LENGTH = 200;

/** How long the language choice is remembered. */
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Letters shown in the avatar, taken from the start of each name part. */
export const AVATAR_INITIALS = 2;

// MAX_JOB_TITLE_LENGTH, MAX_JOB_LOCATION_LENGTH, MAX_JOB_DESCRIPTION_LENGTH, MAX_NAME_LENGTH,
// MAX_EMAIL_LENGTH, MAX_PHONE_LENGTH, MAX_URL_LENGTH and MAX_NOTES_LENGTH are also checks in the
// database: supabase/migrations/20261021200000_text_length_checks.sql. Change a limit in both.

/** Longest job title. */
export const MAX_JOB_TITLE_LENGTH = 200;
/** Longest job location. */
export const MAX_JOB_LOCATION_LENGTH = 200;
/** Longest job description. */
export const MAX_JOB_DESCRIPTION_LENGTH = 5000;

/** Placeholder cards in the admin's customer chooser while the customers load. */
export const CHOOSER_LOADING_CARDS = 4;

// MAX_PIPELINE_STAGES and MAX_STAGE_NAME_LENGTH are also held by the database:
// supabase/migrations/20261101120000_pipeline_stages.sql. Change a limit in both.

/** Most columns a customer's board can have. */
export const MAX_PIPELINE_STAGES = 10;
/** Longest name a customer can give a column. */
export const MAX_STAGE_NAME_LENGTH = 50;

/** Longest board search, in the field and in ?q=. */
export const MAX_SEARCH_LENGTH = 200;

/** Longest candidate phone number. */
export const MAX_PHONE_LENGTH = 50;
/** Longest LinkedIn URL. */
export const MAX_URL_LENGTH = 2048;
/** Longest candidate notes. */
export const MAX_NOTES_LENGTH = 5000;

/** Postgres error code for a unique constraint violation, for example a candidate linked twice. */
export const PG_UNIQUE_VIOLATION = "23505";
/** Postgres error code for a foreign key violation, for example a job that still has candidates. */
export const PG_FOREIGN_KEY_VIOLATION = "23503";
/** Postgres error code for a failed check constraint, for example a text over its length limit. */
export const PG_CHECK_VIOLATION = "23514";

/**
 * Days a deleted account is kept, so an admin can restore it, before it is deleted for good.
 * Same as accounts_due_for_purge() in supabase/migrations/20261023200000_purge_with_cv_files.sql.
 */
export const ACCOUNT_DELETE_GRACE_DAYS = 30;

/** The only file type a CV may have. The cvs bucket allows only this type too. */
export const CV_MIME_TYPE = "application/pdf";
/**
 * Largest CV file, 5 MB. Same as the limit on the cvs bucket in
 * supabase/migrations/20261023180000_cv_bucket_limits.sql: change both.
 */
export const MAX_CV_BYTES = 5 * 1024 * 1024;
/**
 * The only file types a logo or background image may have: no SVG, which can carry scripts. The
 * branding bucket allows only these too, in
 * supabase/migrations/20261119120000_customer_branding.sql: change both.
 */
export const BRANDING_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** Largest logo or background image, 2 MB. The branding bucket has the same limit: change both. */
export const MAX_BRANDING_IMAGE_BYTES = 2 * 1024 * 1024;
/** WCAG AA contrast for normal text, here the text on a customer's accent colour (ATS-53). */
export const MIN_TEXT_CONTRAST = 4.5;
/** WCAG AA contrast for a control against what is around it: the accent on the background. */
export const MIN_UI_CONTRAST = 3;
/**
 * How much of a customer's accent colour goes into the light tints behind a hovered control and
 * the active sidebar item, in percent. The rest is the surface, so dark text stays readable on it.
 */
export const ACCENT_TINT_PERCENT = 12;
/**
 * How far the accent moves toward the dark foreground per step, in percent, when the accent is too
 * light to be text: links and the active sidebar item use the first step that is readable.
 */
export const ACCENT_TEXT_DARKEN_STEP_PERCENT = 5;
/**
 * How long a link to a company's logo works (ATS-54). The logo is shown on every page, so the
 * link lives longer than a CV's, and a new one is fetched BRANDING_SIGNED_URL_MARGIN_SECONDS early.
 */
export const BRANDING_SIGNED_URL_SECONDS = 60 * 60;
export const BRANDING_SIGNED_URL_MARGIN_SECONDS = 5 * 60;
/** How long a link to open a CV works. Short, so a copied link soon stops working. */
export const CV_SIGNED_URL_SECONDS = 5 * 60;
/** A new link is fetched this long before the old one stops working. */
export const CV_SIGNED_URL_MARGIN_SECONDS = 60;
/**
 * The highest score of an AI assessment; the lowest is 1. Same as MAX_SCORE in
 * supabase/functions/assess-cv/assessment.ts and the check on cv_assessments.score.
 */
export const MAX_ASSESSMENT_SCORE = 10;
/**
 * The most audit events a history shows, newest first (ATS-48). Older ones stay in the log; the
 * list says when it was cut off.
 */
export const HISTORY_LIMIT = 100;
