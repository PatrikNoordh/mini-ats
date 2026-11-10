import { assertEquals } from "jsr:@std/assert@1.0.13";

import { createHandler, CRON_SECRET_HEADER, type Deps } from "./handler.ts";

const SECRET = "cron-secret-for-tests";

/** The handler with fake Supabase actions that record what ran, in order. */
function setup(due: string[], failing: string[] = [], companiesDue: string[] = []) {
  const ran: string[] = [];
  const step = (name: string, id: string) => {
    ran.push(`${name} ${id}`);
    return failing.includes(id) ? Promise.reject(new Error("down")) : Promise.resolve();
  };
  const deps: Deps = {
    listCompaniesDue: () => Promise.resolve(companiesDue),
    purgeCompany: (id) => step("company", id),
    listDue: () => Promise.resolve(due),
    deleteUser: (id) => step("user", id),
  };
  return { handler: createHandler(SECRET, deps), ran };
}

function post(secret: string | null = SECRET, method = "POST") {
  const headers = new Headers();
  if (secret !== null) headers.set(CRON_SECRET_HEADER, secret);
  return new Request("http://localhost/purge-deleted-accounts", { method, headers });
}

async function call(handler: (req: Request) => Promise<Response>, req: Request) {
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}

/** Runs `fn` without the expected error logs in the test output. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const originalError = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = originalError;
  }
}

Deno.test("purges nothing without the cron secret, or with a wrong one", async () => {
  for (const secret of [null, "", "wrong", `${SECRET}x`]) {
    const { handler, ran } = setup(["a"]);
    const res = await call(handler, post(secret));
    assertEquals([res.status, res.body.error], [403, "forbidden"]);
    assertEquals(ran, []);
  }
  const { handler } = setup(["a"]);
  assertEquals((await call(handler, post(SECRET, "GET"))).status, 405);
});

Deno.test("deletes each due account's user, and nothing else", async () => {
  const { handler, ran } = setup(["a", "b"]);
  const res = await call(handler, post());
  assertEquals([res.status, res.body], [200, { companies: 0, purged: 2, failed: 0 }]);
  assertEquals(ran, ["user a", "user b"]);
});

Deno.test("does nothing when no account is due", async () => {
  const { handler, ran } = setup([]);
  assertEquals((await call(handler, post())).body, { companies: 0, purged: 0, failed: 0 });
  assertEquals(ran, []);
});

Deno.test("keeps an account that cannot be deleted, and purges the others", async () => {
  const { handler, ran } = setup(["a", "b", "c"], ["a", "c"]);
  const res = await quietly(() => call(handler, post()));
  assertEquals([res.status, res.body], [500, { companies: 0, purged: 1, failed: 2 }]);
  assertEquals(ran, ["user a", "user b", "user c"]);
});

Deno.test("purges each due company before the accounts", async () => {
  const { handler, ran } = setup(["a"], [], ["c1", "c2"]);
  const res = await call(handler, post());
  assertEquals([res.status, res.body], [200, { companies: 2, purged: 1, failed: 0 }]);
  assertEquals(ran, ["company c1", "company c2", "user a"]);
});

Deno.test("keeps a company that cannot be purged, and purges the rest", async () => {
  const { handler, ran } = setup(["a"], ["c1"], ["c1", "c2"]);
  const res = await quietly(() => call(handler, post()));
  assertEquals([res.status, res.body], [500, { companies: 1, purged: 1, failed: 1 }]);
  assertEquals(ran, ["company c1", "company c2", "user a"]);
});
