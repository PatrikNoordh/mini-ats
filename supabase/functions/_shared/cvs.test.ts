import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";

import { removeCvFolder, type CvBucket } from "./cvs.ts";

const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";

/** A bucket holding `count` files in the customer's folder, recording each remove call. */
function fakeBucket(count: number, failures: { list?: Error; remove?: Error } = {}) {
  const files = Array.from({ length: count }, (_, i) => ({ name: `${i}.pdf` }));
  const removed: string[][] = [];
  const bucket: CvBucket = {
    list: (folder, { limit, offset }) => {
      if (failures.list) return Promise.resolve({ data: null, error: failures.list });
      const data = folder === CUSTOMER ? files.slice(offset, offset + limit) : [];
      return Promise.resolve({ data, error: null });
    },
    remove: (paths) => {
      removed.push(paths);
      return Promise.resolve({ error: failures.remove ?? null });
    },
  };
  return { bucket, removed };
}

Deno.test("removes nothing from an empty folder", async () => {
  const { bucket, removed } = fakeBucket(0);
  assertEquals(await removeCvFolder(bucket, CUSTOMER), 0);
  assertEquals(removed, []);
});

Deno.test("removes every file in the customer's folder, over several pages", async () => {
  const { bucket, removed } = fakeBucket(250);
  assertEquals(await removeCvFolder(bucket, CUSTOMER), 250);
  assertEquals(
    removed.map((paths) => paths.length),
    [100, 100, 50],
  );
  assertEquals(removed[0]![0], `${CUSTOMER}/0.pdf`);
  assertEquals(removed[2]!.at(-1), `${CUSTOMER}/249.pdf`);
});

Deno.test("stops at the first failure, so the caller deletes nothing more", async () => {
  const listFailure = new Error("list failed");
  await assertRejects(() => removeCvFolder(fakeBucket(3, { list: listFailure }).bucket, CUSTOMER));
  const removeFailure = new Error("remove failed");
  const { bucket, removed } = fakeBucket(250, { remove: removeFailure });
  await assertRejects(() => removeCvFolder(bucket, CUSTOMER));
  assertEquals(removed.length, 1);
});
