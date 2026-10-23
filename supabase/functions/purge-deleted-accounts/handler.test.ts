import { assertEquals } from "jsr:@std/assert@1.0.13";

import { createHandler, CRON_SECRET_HEADER, type Deps } from "./handler.ts";

const SECRET = "cron-secret-for-tests";

/** The handler with fake Supabase actions that record what ran, in order. */
function setup(due: string[], failing: { cvs?: string; user?: string } = {}) {
  const ran: string[] = [];
  const deps: Deps = {
    listDue: () => Promise.resolve(due),
    removeCvs: (id) => {
      ran.push(`cvs ${id}`);
      return id === failing.cvs ? Promise.reject(new Error("storage down")) : Promise.resolve();
    },
    deleteUser: (id) => {
      ran.push(`user ${id}`);
      return id === failing.user ? Promise.reject(new Error("auth down")) : Promise.resolve();
    },
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

Deno.test("removes each account's CV files before its user", async () => {
  const { handler, ran } = setup(["a", "b"]);
  const res = await call(handler, post());
  assertEquals([res.status, res.body], [200, { purged: 2, failed: 0 }]);
  assertEquals(ran, ["cvs a", "user a", "cvs b", "user b"]);
});

Deno.test("does nothing when no account is due", async () => {
  const { handler, ran } = setup([]);
  assertEquals((await call(handler, post())).body, { purged: 0, failed: 0 });
  assertEquals(ran, []);
});

Deno.test("keeps an account whose files cannot be removed, and purges the others", async () => {
  const { handler, ran } = setup(["a", "b", "c"], { cvs: "a", user: "c" });
  const res = await quietly(() => call(handler, post()));
  assertEquals([res.status, res.body], [500, { purged: 1, failed: 2 }]);
  assertEquals(ran, ["cvs a", "cvs b", "user b", "cvs c", "user c"]);
});
