import { assertEquals } from "jsr:@std/assert@1.0.13";

import { createHandler, type Caller, type CreateResult, type NewAccount } from "./handler.ts";

const valid = {
  role: "customer",
  full_name: "Karin Exempel",
  company_name: "Nordkust Bygg AB",
  email: "  Karin@Nordkust.test ",
  password: "long-enough",
};

function setup(caller: Caller = "admin", result: CreateResult = { id: "new-id" }) {
  const created: NewAccount[] = [];
  const handler = createHandler({
    checkCaller: () => Promise.resolve(caller),
    createUser: (account) => {
      created.push(account);
      return Promise.resolve(result);
    },
  });
  return { handler, created };
}

function post(body: unknown, authorization: string | null = "Bearer caller-jwt") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost/admin-create-user", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(handler: (req: Request) => Promise<Response>, req: Request) {
  const res = await handler(req);
  return {
    status: res.status,
    body: await res.json(),
    cors: res.headers.get("Access-Control-Allow-Origin"),
  };
}

Deno.test("answers the CORS preflight", async () => {
  const { handler } = setup();
  const res = await handler(new Request("http://localhost/", { method: "OPTIONS" }));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
});

Deno.test("only accepts POST", async () => {
  const { handler } = setup();
  const res = await call(handler, new Request("http://localhost/", { method: "GET" }));
  assertEquals([res.status, res.body.error], [405, "method_not_allowed"]);
});

Deno.test("rejects a request without a bearer token", async () => {
  const { handler, created } = setup();
  for (const authorization of [null, "Basic abc"]) {
    const res = await call(handler, post(valid, authorization));
    assertEquals([res.status, res.body.error, res.cors], [401, "not_authenticated", "*"]);
  }
  assertEquals(created.length, 0);
});

Deno.test("rejects an invalid or expired token", async () => {
  const { handler, created } = setup("invalid_token");
  const res = await call(handler, post(valid));
  assertEquals([res.status, res.body.error], [401, "not_authenticated"]);
  assertEquals(created.length, 0);
});

Deno.test("returns 403 for a signed-in customer, before reading the body", async () => {
  const { handler, created } = setup("not_admin");
  const res = await call(handler, post("not json"));
  assertEquals([res.status, res.body.error], [403, "forbidden"]);
  assertEquals(created.length, 0);
});

Deno.test("creates the account with a trimmed, lower-case email", async () => {
  const { handler, created } = setup();
  const res = await call(handler, post(valid));
  assertEquals([res.status, res.body], [201, { id: "new-id" }]);
  assertEquals(created, [
    {
      role: "customer",
      full_name: "Karin Exempel",
      company_name: "Nordkust Bygg AB",
      email: "karin@nordkust.test",
      password: "long-enough",
    },
  ]);
});

Deno.test("an admin can create another admin", async () => {
  const { handler, created } = setup();
  const res = await call(handler, post({ ...valid, role: "admin" }));
  assertEquals(res.status, 201);
  assertEquals(created[0]?.role, "admin");
});

Deno.test("returns email_exists for a taken email", async () => {
  const { handler } = setup("admin", { error: "email_exists" });
  const res = await call(handler, post(valid));
  assertEquals([res.status, res.body.error], [409, "email_exists"]);
});

Deno.test("names the invalid fields and creates nothing", async () => {
  const cases: [unknown, string[]][] = [
    ["not json", ["body"]],
    [{}, ["role", "full_name", "company_name", "email", "password"]],
    [{ ...valid, role: "owner" }, ["role"]],
    [{ ...valid, full_name: "   " }, ["full_name"]],
    [{ ...valid, company_name: "x".repeat(201) }, ["company_name"]],
    [{ ...valid, email: "not-an-email" }, ["email"]],
    [{ ...valid, password: "short" }, ["password"]],
    [{ ...valid, password: "x".repeat(73) }, ["password"]],
  ];
  for (const [body, fields] of cases) {
    const { handler, created } = setup();
    const res = await call(handler, post(body));
    assertEquals([res.status, res.body.error, res.body.fields], [400, "invalid_input", fields]);
    assertEquals(created.length, 0);
  }
});

Deno.test("hides unexpected errors behind the unknown code", async () => {
  const handler = createHandler({
    checkCaller: () => Promise.resolve("admin"),
    createUser: () => Promise.reject(new Error("database down")),
  });
  const originalError = console.error;
  console.error = () => {};
  try {
    const res = await call(handler, post(valid));
    assertEquals([res.status, res.body], [500, { error: "unknown" }]);
  } finally {
    console.error = originalError;
  }
});
