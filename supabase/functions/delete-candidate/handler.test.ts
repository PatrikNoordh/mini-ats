import { assertEquals } from "jsr:@std/assert@1.0.13";

import { createHandler, type CandidateToDelete, type Deps } from "./handler.ts";

const CUSTOMER_ID = "00000000-0000-4000-8000-0000000000c1";
const CANDIDATE_ID = "20000000-0000-4000-8000-0000000000c1";
const candidate: CandidateToDelete = { id: CANDIDATE_ID, customerId: CUSTOMER_ID };

/** The handler with fake Supabase actions that record what ran, in order. */
function setup(
  options: {
    userId?: string | null;
    candidate?: CandidateToDelete | null;
    removeFails?: boolean;
    deleteFails?: boolean;
    clearFails?: boolean;
    deleted?: boolean;
  } = {},
) {
  const ran: string[] = [];
  const deps: Deps = {
    getUserId: () => Promise.resolve(options.userId === undefined ? "user" : options.userId),
    getCandidate: (_, id) => {
      ran.push(`get ${id}`);
      return Promise.resolve(options.candidate === undefined ? candidate : options.candidate);
    },
    removeCv: (_, path) => {
      ran.push(`remove ${path}`);
      return options.removeFails ? Promise.reject(new Error("storage down")) : Promise.resolve();
    },
    deleteCandidate: (_, c) => {
      ran.push(`delete ${c.id}`);
      return options.deleteFails
        ? Promise.reject(new Error("database down"))
        : Promise.resolve(options.deleted ?? true);
    },
    clearCvPath: (_, c) => {
      ran.push(`clear ${c.id}`);
      return options.clearFails ? Promise.reject(new Error("still down")) : Promise.resolve();
    },
  };
  return { handler: createHandler(deps), ran };
}

function post(body: unknown, authorization: string | null = "Bearer caller-jwt") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost/delete-candidate", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(handler: (req: Request) => Promise<Response>, req: Request) {
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}

const body = { candidate_id: CANDIDATE_ID };
const path = `${CUSTOMER_ID}/${CANDIDATE_ID}.pdf`;

Deno.test("answers the CORS preflight and only accepts POST", async () => {
  const { handler } = setup();
  const preflight = await handler(new Request("http://localhost/", { method: "OPTIONS" }));
  assertEquals(preflight.status, 200);
  assertEquals(preflight.headers.get("Access-Control-Allow-Origin"), "*");
  const get = await call(handler, new Request("http://localhost/", { method: "GET" }));
  assertEquals([get.status, get.body.error], [405, "method_not_allowed"]);
});

Deno.test("checks the caller before the body, and touches nothing without one", async () => {
  for (const [authorization, userId] of [
    [null, "user"],
    ["Bearer expired", null],
  ] as const) {
    const { handler, ran } = setup({ userId });
    const res = await call(handler, post("not even json", authorization));
    assertEquals([res.status, res.body.error], [401, "not_authenticated"]);
    assertEquals(ran, []);
  }
});

Deno.test("names the invalid field and touches nothing", async () => {
  for (const [request, fields] of [
    ["not json", ["body"]],
    [{ candidate_id: "not-a-uuid" }, ["candidate_id"]],
  ] as const) {
    const { handler, ran } = setup();
    const res = await call(handler, post(request));
    assertEquals([res.status, res.body.error, res.body.fields], [400, "invalid_input", fields]);
    assertEquals(ran, []);
  }
});

Deno.test("another customer's candidate is not found, and nothing is removed", async () => {
  const { handler, ran } = setup({ candidate: null });
  const res = await call(handler, post(body));
  assertEquals([res.status, res.body.error], [404, "candidate_not_found"]);
  assertEquals(ran, [`get ${CANDIDATE_ID}`]);
});

Deno.test("removes the CV file from the candidate's own folder, then the candidate", async () => {
  const { handler, ran } = setup();
  const res = await call(handler, post({ ...body, customer_id: "someone-else" }));
  assertEquals([res.status, res.body.deleted], [200, CANDIDATE_ID]);
  // The folder comes from the row the caller can see, never from the request body.
  assertEquals(ran, [`get ${CANDIDATE_ID}`, `remove ${path}`, `delete ${CANDIDATE_ID}`]);
});

Deno.test("deletes nothing when the CV file cannot be removed", async () => {
  const { handler, ran } = setup({ removeFails: true });
  const res = await call(handler, post(body));
  assertEquals([res.status, res.body.error], [500, "unknown"]);
  assertEquals(ran, [`get ${CANDIDATE_ID}`, `remove ${path}`]);
});

Deno.test("clears cv_path when the file is gone but the candidate can't be deleted", async () => {
  const { handler, ran } = setup({ deleteFails: true });
  const res = await call(handler, post(body));
  assertEquals([res.status, res.body.error], [500, "unknown"]);
  assertEquals(ran.slice(-2), [`delete ${CANDIDATE_ID}`, `clear ${CANDIDATE_ID}`]);

  // Clearing is a best effort: its own failure does not hide the delete's error.
  const failing = setup({ deleteFails: true, clearFails: true });
  const again = await call(failing.handler, post(body));
  assertEquals([again.status, again.body.error], [500, "unknown"]);
});

Deno.test("a candidate deleted meanwhile is not found, and cv_path is left alone", async () => {
  const { handler, ran } = setup({ deleted: false });
  const res = await call(handler, post(body));
  assertEquals([res.status, res.body.error], [404, "candidate_not_found"]);
  assertEquals(ran.includes(`clear ${CANDIDATE_ID}`), false);
});
