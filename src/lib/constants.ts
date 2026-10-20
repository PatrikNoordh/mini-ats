// Named values for the app. Change them here, never inline.

/** Milliseconds in one day, for date maths. */
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Delay on every mock API call, so loading states show. Removed with the mock store in epic 1. */
export const MOCK_DELAY_MS = 300;

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
/** Supabase Auth hashes passwords with bcrypt, which only reads 72 bytes. Same as admin-create-user. */
export const MAX_PASSWORD_LENGTH = 72;
/** The longest email address SMTP allows. Same as admin-create-user. */
export const MAX_EMAIL_LENGTH = 254;
/** Longest name or company name for an account. Same as admin-create-user. */
export const MAX_NAME_LENGTH = 200;

/** How long the language choice is remembered. */
export const LANGUAGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Letters shown in the avatar, taken from the start of each name part. */
export const AVATAR_INITIALS = 2;
