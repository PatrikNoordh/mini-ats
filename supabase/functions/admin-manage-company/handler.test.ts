import { assertEquals } from "jsr:@std/assert@1.0.13";

import { createHandler, type Caller, type Company } from "./handler.ts";

const COMPANY = "00000000-0000-4000-8000-0000000000c1";
const NEW_COMPANY = "00000000-0000-4000-8000-0000000000c2";

/** The handler with fake Supabase actions that record what ran. */
function setup(
  caller: Caller = "admin",
  company: Company | null = { id: COMPANY, deleted: false },
) {
  const ran: string[] = [];
  let bodyRead = false;
  const record = (step: string) => {
    ran.push(step);
    return Promise.resolve();
  };
  const handler = createHandler({
    checkCaller: () => Promise.resolve(caller),
    getCompany: () => {
      bodyRead = true;
      return Promise.resolve(company);
    },
    create: (name) => record(`create ${name}`).then(() => NEW_COMPANY),
    rename: (id, name) => record(`rename ${id} ${name}`),
    softDelete: (id) => record(`delete ${id}`),
    restore: (id) => record(`restore ${id}`),
    deleteNow: (id) => record(`delete_now ${id}`),
  });
  return { handler, ran, bodyRead: () => bodyRead };
}

function post(body: unknown, authorization: string | null = "Bearer caller-jwt") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost/admin-manage-company", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
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

Deno.test("answers the CORS preflight and only accepts POST", async () => {
  const { handler } = setup();
  const preflight = await handler(new Request("http://localhost/", { method: "OPTIONS" }));
  assertEquals(preflight.status, 200);
  assertEquals(preflight.headers.get("Access-Control-Allow-Origin"), "*");
  const get = await call(handler, new Request("http://localhost/", { method: "GET" }));
  assertEquals([get.status, get.body.error], [405, "method_not_allowed"]);
});

Deno.test("refuses a signed-out caller and a bad token", async () => {
  for (const authorization of [null, "Basic abc"]) {
    const { handler, ran } = setup();
    const res = await call(handler, post({ action: "create", name: "Bolag" }, authorization));
    assertEquals([res.status, res.body.error, ran], [401, "not_authenticated", []]);
  }
  const { handler, ran } = setup("invalid_token");
  const res = await call(handler, post({ action: "create", name: "Bolag" }));
  assertEquals([res.status, res.body.error, ran], [401, "not_authenticated", []]);
});

Deno.test("refuses a customer, a second member too, before reading the body", async () => {
  // Every customer user is "not_admin" to is_admin(), whichever member of a company they are.
  for (const action of ["create", "rename", "delete", "restore", "delete_now"]) {
    const { handler, ran, bodyRead } = setup("not_admin");
    const res = await call(handler, post({ action, id: COMPANY, name: "Bolag" }));
    assertEquals([res.status, res.body.error, ran, bodyRead()], [403, "forbidden", [], false]);
  }
});

Deno.test("refuses a body that is not a known action with valid fields", async () => {
  const cases: [unknown, string[]][] = [
    ["{not json", ["body"]],
    [{ action: "merge", id: COMPANY }, ["action"]],
    [{ action: "create", name: "  " }, ["name"]],
    [{ action: "create", name: "x".repeat(201) }, ["name"]],
    [{ action: "rename", id: "not-a-uuid", name: "Bolag" }, ["id"]],
    [{ action: "delete" }, ["id"]],
  ];
  for (const [body, fields] of cases) {
    const { handler, ran } = setup();
    const res = await call(handler, post(body));
    assertEquals(
      [res.status, res.body.error, res.body.fields, ran],
      [400, "invalid_input", fields, []],
    );
  }
});

Deno.test("creates a company with the trimmed name", async () => {
  const { handler, ran } = setup();
  const res = await call(handler, post({ action: "create", name: "  Nordkust Bygg AB " }));
  assertEquals([res.status, res.body.id, ran], [201, NEW_COMPANY, ["create Nordkust Bygg AB"]]);
});

Deno.test("renames and deletes an active company", async () => {
  for (const [body, step] of [
    [{ action: "rename", id: COMPANY, name: " Nytt namn " }, `rename ${COMPANY} Nytt namn`],
    [{ action: "delete", id: COMPANY }, `delete ${COMPANY}`],
  ] as const) {
    const { handler, ran } = setup();
    const res = await call(handler, post(body));
    assertEquals([res.status, res.body.id, ran], [200, COMPANY, [step]]);
  }
});

Deno.test("restores and deletes for good only a deleted company", async () => {
  for (const action of ["restore", "delete_now"]) {
    const active = setup();
    const refused = await call(active.handler, post({ action, id: COMPANY }));
    assertEquals(
      [refused.status, refused.body.error, active.ran],
      [409, "company_not_deleted", []],
    );

    const deleted = setup("admin", { id: COMPANY, deleted: true });
    const res = await call(deleted.handler, post({ action, id: COMPANY }));
    assertEquals([res.status, deleted.ran], [200, [`${action} ${COMPANY}`]]);
  }
});

Deno.test("never renames or deletes a deleted company again", async () => {
  for (const body of [
    { action: "rename", id: COMPANY, name: "Bolag" },
    { action: "delete", id: COMPANY },
  ]) {
    const { handler, ran } = setup("admin", { id: COMPANY, deleted: true });
    const res = await call(handler, post(body));
    assertEquals([res.status, res.body.error, ran], [409, "company_deleted", []]);
  }
});

Deno.test("answers company_not_found for a company that does not exist", async () => {
  const { handler, ran } = setup("admin", null);
  const res = await call(handler, post({ action: "delete", id: COMPANY }));
  assertEquals([res.status, res.body.error, ran], [404, "company_not_found", []]);
});

Deno.test("answers unknown when a write fails, without details", async () => {
  const handler = createHandler({
    checkCaller: () => Promise.resolve("admin"),
    getCompany: () => Promise.resolve({ id: COMPANY, deleted: false }),
    create: () => Promise.reject(new Error("db down")),
    rename: () => Promise.reject(new Error("db down")),
    softDelete: () => Promise.reject(new Error("auth down")),
    restore: () => Promise.reject(new Error("db down")),
    deleteNow: () => Promise.reject(new Error("db down")),
  });
  const res = await quietly(() => call(handler, post({ action: "delete", id: COMPANY })));
  assertEquals([res.status, res.body], [500, { error: "unknown" }]);
});
