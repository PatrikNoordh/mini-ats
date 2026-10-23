// CV files of an account deleted for good (ATS-17). The cvs bucket keeps each customer's CVs in a
// folder named after the customer id, so removing that folder removes all of them.

/** The private bucket for CVs, the same as CV_BUCKET in src/lib/api/cvs.ts. */
export const CV_BUCKET = "cvs";

/** How many files one list call returns, and one remove call takes. */
const CV_PAGE_SIZE = 100;

/** The part of a Storage bucket client this needs, so tests can pass a fake. */
export interface CvBucket {
  list: (
    folder: string,
    options: { limit: number; offset: number },
  ) => Promise<{ data: { name: string }[] | null; error: unknown }>;
  remove: (paths: string[]) => Promise<{ error: unknown }>;
}

/**
 * Removes every file in the customer's CV folder and returns how many. All names are listed
 * first and removed after, page by page, so a remove never shifts the pages still to be read.
 * Throws on the first failure; a new try removes what is left.
 */
export async function removeCvFolder(bucket: CvBucket, customerId: string): Promise<number> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += CV_PAGE_SIZE) {
    const { data, error } = await bucket.list(customerId, { limit: CV_PAGE_SIZE, offset });
    if (error) throw error;
    const files = data ?? [];
    paths.push(...files.map((file) => `${customerId}/${file.name}`));
    if (files.length < CV_PAGE_SIZE) break;
  }
  for (let start = 0; start < paths.length; start += CV_PAGE_SIZE) {
    const { error } = await bucket.remove(paths.slice(start, start + CV_PAGE_SIZE));
    if (error) throw error;
  }
  return paths.length;
}
