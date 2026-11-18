// The cvs bucket keeps each company's CVs in a folder named after the company id (the customer
// id), so removing that folder removes all of them. The branding bucket keeps its files the same
// way (ATS-52, branding.ts). No user's delete removes a folder (ATS-44): only deleting a company
// for good does (company-purge.ts, ATS-46).

/** The private bucket for CVs, the same as CV_BUCKET in src/lib/api/cvs.ts. */
export const CV_BUCKET = "cvs";

/** How many files one list call returns, and one remove call takes. */
const FOLDER_PAGE_SIZE = 100;

/** The part of a Storage bucket client this needs, so tests can pass a fake. */
export interface FolderBucket {
  list: (
    folder: string,
    options: { limit: number; offset: number },
  ) => Promise<{ data: { name: string }[] | null; error: unknown }>;
  remove: (paths: string[]) => Promise<{ error: unknown }>;
}

/**
 * Removes every file in the company's folder of the bucket and returns how many. Only files
 * directly in the folder: neither bucket has subfolders. All names are listed first and removed
 * after, page by page, so a remove never shifts the pages still to be read. Throws on the first
 * failure; a new try removes what is left.
 */
export async function removeCompanyFolder(
  bucket: FolderBucket,
  customerId: string,
): Promise<number> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += FOLDER_PAGE_SIZE) {
    const { data, error } = await bucket.list(customerId, { limit: FOLDER_PAGE_SIZE, offset });
    if (error) throw error;
    const files = data ?? [];
    paths.push(...files.map((file) => `${customerId}/${file.name}`));
    if (files.length < FOLDER_PAGE_SIZE) break;
  }
  for (let start = 0; start < paths.length; start += FOLDER_PAGE_SIZE) {
    const { error } = await bucket.remove(paths.slice(start, start + FOLDER_PAGE_SIZE));
    if (error) throw error;
  }
  return paths.length;
}
