// The branding bucket keeps each company's logo and background image directly in a folder named
// after the company id (ATS-52), with no subfolders. Deleting a company for good removes the
// folder (company-purge.ts).

/** The private bucket for logos and backgrounds, the same as in the ATS-52 migration. */
export const BRANDING_BUCKET = "branding";
