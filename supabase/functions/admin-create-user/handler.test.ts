import { assertEquals } from "jsr:@std/assert@1.0.13";

import {
  createHandler,
  type AuthAccount,
  type Caller,
  type Company,
  type CreateResult,
  type Deps,
} from "./handler.ts";

const COMPANY = "00000000-0000-4000-8000-0000000000c1";
const NEW_COMPANY = "00000000-0000-4000-8000-0000000000c2";

/** A customer with a new company: the request shape the accounts page on main still sends. */
const valid = {
  role: "customer",
  full_name: "Karin Exempel",
  company_name: "Nordkust Bygg AB",
  email: "  Karin@Nordkust.test ",
  password: "long-enough",
};
const { company_name: _, ...withoutCompany } = valid;

interface Options {
  caller?: Caller;
  result?: CreateResult;
  company?: Company | null;
  failAt?: "createUser" | "addMember";
}

/** The handler with fake Supabase actions that record what ran, in order. */
function setup({
  caller = "admin",
  result = { id: "new-id" },
  company = { id: COMPANY, name: "Lumen AB", deleted: false },
  failAt,
}: Options = {}) {
  const created: AuthAccount[] = [];
  const ran: string[] = [];
  const deps: Deps = {
    checkCaller: () => Promise.resolve(caller),
    getCompany: () => Promise.resolve(company),
    createCompany: (name) => {
      ran.push(`company ${name}`);
      return Promise.resolve(NEW_COMPANY);
    },
    deleteCompany: (id) => {
      ran.push(`drop company ${id}`);
      return Promise.resolve();
    },
    createUser: (account) => {
      created.push(account);
      ran.push("user");
      return failAt === "createUser"
        ? Promise.reject(new Error("auth down"))
        : Promise.resolve(result);
    },
    addMember: (companyId, userId) => {
      ran.push(`member ${companyId} ${userId}`);
      return failAt === "addMember" ? Promise.reject(new Error("db down")) : Promise.resolve();
    },
    deleteUser: (id) => {
      ran.push(`drop user ${id}`);
      return Promise.resolve();
    },
  };
  return { handler: createHandler(deps), created, ran };
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
  const { handler, created } = setup({ caller: "invalid_token" });
  const res = await call(handler, post(valid));
  assertEquals([res.status, res.body.error], [401, "not_authenticated"]);
  assertEquals(created.length, 0);
});

Deno.test("returns 403 for a signed-in customer, before reading the body", async () => {
  const { handler, created } = setup({ caller: "not_admin" });
  const res = await call(handler, post("not json"));
  assertEquals([res.status, res.body.error], [403, "forbidden"]);
  assertEquals(created.length, 0);
});

Deno.test(
  "creates a customer with a new company: the company, the account, then the membership",
  async () => {
    const { handler, created, ran } = setup();
    const res = await call(handler, post(valid));
    assertEquals([res.status, res.body], [201, { id: "new-id", company_id: NEW_COMPANY }]);
    assertEquals(created, [
      {
        role: "customer",
        full_name: "Karin Exempel",
        company_name: "Nordkust Bygg AB",
        email: "karin@nordkust.test",
        password: "long-enough",
      },
    ]);
    assertEquals(ran, ["company Nordkust Bygg AB", "user", `member ${NEW_COMPANY} new-id`]);
  },
);

Deno.test("adds a customer to an existing company", async () => {
  const { handler, created, ran } = setup();
  const res = await call(handler, post({ ...withoutCompany, company_id: COMPANY }));
  assertEquals([res.status, res.body], [201, { id: "new-id", company_id: COMPANY }]);
  assertEquals(created[0]?.company_name, "Lumen AB");
  assertEquals(ran, ["user", `member ${COMPANY} new-id`]);
});

Deno.test("refuses a company that does not exist or is deleted, and creates nothing", async () => {
  const cases: [Company | null, number, string][] = [
    [null, 404, "company_not_found"],
    [{ id: COMPANY, name: "Lumen AB", deleted: true }, 409, "company_deleted"],
  ];
  for (const [company, status, error] of cases) {
    const { handler, ran } = setup({ company });
    const res = await call(handler, post({ ...withoutCompany, company_id: COMPANY }));
    assertEquals([res.status, res.body.error, ran], [status, error, []]);
  }
});

Deno.test(
  "deletes the new account and the new company again when the membership fails",
  async () => {
    const { handler, ran } = setup({ failAt: "addMember" });
    const res = await quietly(() => call(handler, post(valid)));
    assertEquals([res.status, res.body.error], [500, "unknown"]);
    assertEquals(ran, [
      "company Nordkust Bygg AB",
      "user",
      `member ${NEW_COMPANY} new-id`,
      "drop user new-id",
      `drop company ${NEW_COMPANY}`,
    ]);
  },
);

Deno.test("keeps an existing company when the membership fails", async () => {
  const { handler, ran } = setup({ failAt: "addMember" });
  await quietly(() => call(handler, post({ ...withoutCompany, company_id: COMPANY })));
  assertEquals(ran, ["user", `member ${COMPANY} new-id`, "drop user new-id"]);
});

Deno.test("removes the new company when the account cannot be made", async () => {
  const taken = setup({ result: { error: "email_exists" } });
  const res = await call(taken.handler, post(valid));
  assertEquals([res.status, res.body.error], [409, "email_exists"]);
  assertEquals(taken.ran, ["company Nordkust Bygg AB", "user", `drop company ${NEW_COMPANY}`]);

  const failing = setup({ failAt: "createUser" });
  await quietly(() => call(failing.handler, post(valid)));
  assertEquals(failing.ran, ["company Nordkust Bygg AB", "user", `drop company ${NEW_COMPANY}`]);
});

Deno.test("accepts a password of exactly 72 bytes, even with å", async () => {
  const { handler, created } = setup();
  const res = await call(handler, post({ ...valid, password: "å".repeat(36) }));
  assertEquals(res.status, 201);
  assertEquals(created[0]?.password, "å".repeat(36));
});

Deno.test("an admin creates another admin, who gets no company", async () => {
  const { handler, created, ran } = setup();
  // The accounts page on main sends a company name for an admin too; it is ignored.
  const res = await call(handler, post({ ...valid, role: "admin" }));
  assertEquals([res.status, res.body], [201, { id: "new-id", company_id: null }]);
  assertEquals([created[0]?.role, created[0]?.company_name], ["admin", null]);
  assertEquals(ran, ["user"]);
});

Deno.test("returns email_exists for a taken email", async () => {
  const { handler } = setup({ result: { error: "email_exists" } });
  const res = await call(handler, post(valid));
  assertEquals([res.status, res.body.error], [409, "email_exists"]);
});

Deno.test("names the invalid fields and creates nothing", async () => {
  const cases: [unknown, string[]][] = [
    ["not json", ["body"]],
    [{}, ["role", "full_name", "email", "password"]],
    [withoutCompany, ["company_id"]],
    [{ ...valid, company_id: COMPANY }, ["company_name"]],
    [{ ...withoutCompany, role: "admin", company_id: COMPANY }, ["company_id"]],
    [{ ...withoutCompany, company_id: "not-a-uuid" }, ["company_id"]],
    [{ ...valid, role: "owner" }, ["role"]],
    [{ ...valid, full_name: "   " }, ["full_name"]],
    [{ ...valid, company_name: "x".repeat(201) }, ["company_name"]],
    [{ ...valid, email: "not-an-email" }, ["email"]],
    [{ ...valid, password: "short" }, ["password"]],
    [{ ...valid, password: "x".repeat(73) }, ["password"]],
    // 37 characters, but 74 bytes: å takes two.
    [{ ...valid, password: "å".repeat(37) }, ["password"]],
  ];
  for (const [body, fields] of cases) {
    const { handler, created } = setup();
    const res = await call(handler, post(body));
    assertEquals([res.status, res.body.error, res.body.fields], [400, "invalid_input", fields]);
    assertEquals(created.length, 0);
  }
});

Deno.test("hides unexpected errors behind the unknown code", async () => {
  const { handler } = setup({ failAt: "createUser" });
  const res = await quietly(() => call(handler, post(valid)));
  assertEquals([res.status, res.body], [500, { error: "unknown" }]);
});
