import { assertEquals } from "jsr:@std/assert@1.0.13";

import { createHandler, type Account, type Caller, type Deps } from "./handler.ts";

const ADMIN_ID = "00000000-0000-4000-8000-0000000000ad";
const CUSTOMER_ID = "00000000-0000-4000-8000-0000000000c1";
const OTHER_ADMIN_ID = "00000000-0000-4000-8000-0000000000a2";

const accounts: Record<string, Account> = {
  [ADMIN_ID]: { id: ADMIN_ID, role: "admin", deleted: false },
  [CUSTOMER_ID]: { id: CUSTOMER_ID, role: "customer", deleted: false },
  [OTHER_ADMIN_ID]: { id: OTHER_ADMIN_ID, role: "admin", deleted: false },
};

const update = {
  action: "update",
  id: CUSTOMER_ID,
  role: "customer",
  full_name: "Erik Exempel",
  company_name: "Exempelbygg AB",
  email: " Kund@Exempelbygg.test ",
};

/** The handler with fake Supabase actions that record what ran. */
function setup(
  options: {
    caller?: Caller;
    accounts?: Record<string, Account>;
    activeAdmins?: number;
    updateResult?: { error: "email_exists" } | null;
  } = {},
) {
  const ran: string[] = [];
  const known = options.accounts ?? accounts;
  const deps: Deps = {
    getCaller: () => Promise.resolve(options.caller ?? { kind: "admin", id: ADMIN_ID }),
    getAccount: (_, id) => Promise.resolve(known[id] ?? null),
    countActiveAdmins: () => Promise.resolve(options.activeAdmins ?? 2),
    updateAccount: (u) => {
      ran.push(`update ${u.id} ${u.email} ${u.password ?? "-"}`);
      return Promise.resolve(options.updateResult ?? null);
    },
    softDelete: (id) => (ran.push(`delete ${id}`), Promise.resolve()),
    restore: (id) => (ran.push(`restore ${id}`), Promise.resolve()),
    deleteNow: (id) => (ran.push(`delete_now ${id}`), Promise.resolve()),
  };
  return { handler: createHandler(deps), ran };
}

function post(body: unknown, authorization: string | null = "Bearer caller-jwt") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost/admin-manage-account", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(handler: (req: Request) => Promise<Response>, req: Request) {
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}

const deleted = (account: Account): Account => ({ ...account, deleted: true });

Deno.test("answers the CORS preflight and only accepts POST", async () => {
  const { handler } = setup();
  const preflight = await handler(new Request("http://localhost/", { method: "OPTIONS" }));
  assertEquals(preflight.status, 200);
  assertEquals(preflight.headers.get("Access-Control-Allow-Origin"), "*");
  const get = await call(handler, new Request("http://localhost/", { method: "GET" }));
  assertEquals([get.status, get.body.error], [405, "method_not_allowed"]);
});

Deno.test("checks the caller before the body, and refuses non-admins", async () => {
  for (const [caller, status, error] of [
    [{ kind: "invalid_token" }, 401, "not_authenticated"],
    [{ kind: "not_admin" }, 403, "forbidden"],
  ] as const) {
    const { handler, ran } = setup({ caller });
    const res = await call(handler, post("not even json"));
    assertEquals([res.status, res.body.error], [status, error]);
    assertEquals(ran, []);
  }
  const { handler } = setup();
  const res = await call(handler, post(update, null));
  assertEquals([res.status, res.body.error], [401, "not_authenticated"]);
});

Deno.test("names the invalid fields and changes nothing", async () => {
  const cases: [unknown, string[]][] = [
    ["not json", ["body"]],
    [{ action: "rename", id: CUSTOMER_ID }, ["action"]],
    [{ action: "delete", id: "not-a-uuid" }, ["id"]],
    [{ ...update, email: "a@b.c" }, ["email"]],
    [{ ...update, full_name: " " }, ["full_name"]],
    [{ ...update, role: "owner" }, ["role"]],
    [{ ...update, password: "short" }, ["password"]],
    // 37 characters, but 74 bytes: å takes two.
    [{ ...update, password: "å".repeat(37) }, ["password"]],
  ];
  for (const [body, fields] of cases) {
    const { handler, ran } = setup();
    const res = await call(handler, post(body));
    assertEquals([res.status, res.body.error, res.body.fields], [400, "invalid_input", fields]);
    assertEquals(ran, []);
  }
});

Deno.test(
  "updates an account with a trimmed, lower-case email, keeping or setting the password",
  async () => {
    const keep = setup();
    assertEquals((await call(keep.handler, post(update))).status, 200);
    assertEquals(keep.ran, [`update ${CUSTOMER_ID} kund@exempelbygg.test -`]);

    const set = setup();
    assertEquals(
      (await call(set.handler, post({ ...update, password: "Blå-Katt-47" }))).status,
      200,
    );
    assertEquals(set.ran, [`update ${CUSTOMER_ID} kund@exempelbygg.test Blå-Katt-47`]);
  },
);

Deno.test("returns email_exists for a taken email", async () => {
  const { handler } = setup({ updateResult: { error: "email_exists" } });
  const res = await call(handler, post(update));
  assertEquals([res.status, res.body.error], [409, "email_exists"]);
});

Deno.test("returns account_not_found for an unknown id", async () => {
  const { handler, ran } = setup();
  const res = await call(
    handler,
    post({ action: "delete", id: "00000000-0000-4000-8000-00000000dead" }),
  );
  assertEquals([res.status, res.body.error], [404, "account_not_found"]);
  assertEquals(ran, []);
});

Deno.test("deletes, restores and deletes for good, each only in the right state", async () => {
  const active = setup();
  assertEquals(
    (await call(active.handler, post({ action: "delete", id: CUSTOMER_ID }))).status,
    200,
  );
  for (const action of ["restore", "delete_now"]) {
    const res = await call(active.handler, post({ action, id: CUSTOMER_ID }));
    assertEquals([res.status, res.body.error], [409, "account_not_deleted"]);
  }
  assertEquals(active.ran, [`delete ${CUSTOMER_ID}`]);

  const gone = setup({ accounts: { [CUSTOMER_ID]: deleted(accounts[CUSTOMER_ID]!) } });
  for (const action of ["delete", "update"]) {
    const body = action === "update" ? update : { action, id: CUSTOMER_ID };
    const res = await call(gone.handler, post(body));
    assertEquals([res.status, res.body.error], [409, "account_deleted"]);
  }
  assertEquals(
    (await call(gone.handler, post({ action: "restore", id: CUSTOMER_ID }))).status,
    200,
  );
  assertEquals(
    (await call(gone.handler, post({ action: "delete_now", id: CUSTOMER_ID }))).status,
    200,
  );
  assertEquals(gone.ran, [`restore ${CUSTOMER_ID}`, `delete_now ${CUSTOMER_ID}`]);
});

Deno.test("an admin cannot delete or demote itself, but can edit its own details", async () => {
  const { handler, ran } = setup();
  for (const body of [
    { action: "delete", id: ADMIN_ID },
    { ...update, id: ADMIN_ID, role: "customer" },
  ]) {
    const res = await call(handler, post(body));
    assertEquals([res.status, res.body.error], [409, "cannot_change_self"]);
  }
  assertEquals(ran, []);
  const own = await call(handler, post({ ...update, id: ADMIN_ID, role: "admin" }));
  assertEquals(own.status, 200);
});

Deno.test("can delete and demote another admin, but never the last active one", async () => {
  const two = setup({ activeAdmins: 2 });
  assertEquals(
    (await call(two.handler, post({ action: "delete", id: OTHER_ADMIN_ID }))).status,
    200,
  );
  const demote = await call(two.handler, post({ ...update, id: OTHER_ADMIN_ID, role: "customer" }));
  assertEquals(demote.status, 200);

  const last = setup({ activeAdmins: 1 });
  for (const body of [
    { action: "delete", id: OTHER_ADMIN_ID },
    { ...update, id: OTHER_ADMIN_ID, role: "customer" },
  ]) {
    const res = await call(last.handler, post(body));
    assertEquals([res.status, res.body.error], [409, "last_admin"]);
  }
  assertEquals(last.ran, []);
});

Deno.test("hides unexpected errors behind the unknown code", async () => {
  const failing = createHandler({
    getCaller: () => Promise.resolve({ kind: "admin", id: ADMIN_ID }),
    getAccount: () => Promise.reject(new Error("database down")),
    countActiveAdmins: () => Promise.resolve(2),
    updateAccount: () => Promise.resolve(null),
    softDelete: () => Promise.resolve(),
    restore: () => Promise.resolve(),
    deleteNow: () => Promise.resolve(),
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await call(failing, post({ action: "delete", id: CUSTOMER_ID }));
    assertEquals([res.status, res.body], [500, { error: "unknown" }]);
  } finally {
    console.error = originalError;
  }
});
