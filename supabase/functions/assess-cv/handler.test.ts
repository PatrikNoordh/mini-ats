import { assertEquals } from "jsr:@std/assert@1.0.13";

import { MAX_CV_TEXT_LENGTH, MIN_CV_TEXT_LENGTH } from "./assessment.ts";
import {
  ASSESS_COOLDOWN_SECONDS,
  createHandler,
  type ApplicationForAssessment,
  type Deps,
  type ModelResult,
} from "./handler.ts";

const APPLICATION_ID = "30000000-0000-4000-8000-0000000000a1";
const NOW = Date.parse("2026-10-23T12:00:00Z");
const CV_TEXT = "Erfaren UX-designer med åtta år inom användbarhet och prototyper. ".repeat(10);

const application: ApplicationForAssessment = {
  id: APPLICATION_ID,
  cvPath: "00000000-0000-4000-8000-0000000000c1/c1.pdf",
  job: { title: "UX-designer", location: "Stockholm", description: "Figma och användartester." },
  lastAssessedAt: null,
};

const answer = {
  score: 8,
  summary: "  Stark matchning mot rollen.  ",
  strengths: ["Åtta års erfarenhet"],
  gaps: [],
};

/** The handler with fake Supabase, PDF and model actions that record what ran. */
function setup(
  options: {
    userId?: string | null;
    application?: ApplicationForAssessment | null;
    pdf?: Uint8Array | null;
    text?: string | Error;
    model?: ModelResult;
  } = {},
) {
  const ran: string[] = [];
  const deps: Deps = {
    getUserId: () => Promise.resolve(options.userId === undefined ? "user-1" : options.userId),
    getApplication: (auth, id) => {
      ran.push(`read ${id} as ${auth}`);
      return Promise.resolve(options.application === undefined ? application : options.application);
    },
    downloadCv: (auth, path) => {
      ran.push(`download ${path} as ${auth}`);
      return Promise.resolve(options.pdf === undefined ? new Uint8Array([37, 80]) : options.pdf);
    },
    extractText: () => {
      const text = options.text ?? CV_TEXT;
      return text instanceof Error ? Promise.reject(text) : Promise.resolve(text);
    },
    assess: (job, text, language) => {
      ran.push(`assess ${job.title} ${text.length} ${language}`);
      return Promise.resolve(options.model ?? { kind: "answer", answer, model: "claude-opus-5-5" });
    },
    save: (applicationId, assessment, model) => {
      ran.push(`save ${applicationId} ${assessment.score} ${model}`);
      return Promise.resolve({
        ...assessment,
        id: "a1",
        application_id: applicationId,
        model,
        created_at: "2026-10-23T12:00:01Z",
      });
    },
    now: () => NOW,
  };
  return { handler: createHandler(deps), ran };
}

function post(body: unknown, authorization: string | null = "Bearer caller-jwt") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization) headers.set("Authorization", authorization);
  return new Request("http://localhost/assess-cv", {
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

const request = { application_id: APPLICATION_ID, language: "sv" };

Deno.test("answers the CORS preflight and only accepts POST", async () => {
  const { handler } = setup();
  const preflight = await handler(new Request("http://localhost/", { method: "OPTIONS" }));
  assertEquals(preflight.status, 200);
  const get = await call(handler, new Request("http://localhost/", { method: "GET" }));
  assertEquals([get.status, get.body.error], [405, "method_not_allowed"]);
});

Deno.test("checks the caller before the body", async () => {
  for (const [options, authorization] of [
    [{}, null],
    [{ userId: null }, "Bearer expired"],
  ] as const) {
    const { handler, ran } = setup(options);
    const res = await call(handler, post("not even json", authorization));
    assertEquals([res.status, res.body.error], [401, "not_authenticated"]);
    assertEquals(ran, []);
  }
});

Deno.test("names the invalid fields and reads nothing", async () => {
  for (const [body, fields] of [
    ["not json", ["body"]],
    [{ ...request, application_id: "not-a-uuid" }, ["application_id"]],
    [{ ...request, language: "de" }, ["language"]],
  ] as const) {
    const { handler, ran } = setup();
    const res = await call(handler, post(body));
    assertEquals([res.status, res.body.error, res.body.fields], [400, "invalid_input", fields]);
    assertEquals(ran, []);
  }
});

Deno.test(
  "reads the application and the CV as the caller, then saves the checked answer",
  async () => {
    const { handler, ran } = setup();
    const res = await call(handler, post(request));
    assertEquals(res.status, 200);
    assertEquals(res.body.assessment.summary, "Stark matchning mot rollen.");
    assertEquals(ran, [
      `read ${APPLICATION_ID} as Bearer caller-jwt`,
      `download ${application.cvPath} as Bearer caller-jwt`,
      `assess UX-designer ${CV_TEXT.trim().length} sv`,
      `save ${APPLICATION_ID} 8 claude-opus-5-5`,
    ]);
  },
);

Deno.test("an application the caller cannot see is not found", async () => {
  const { handler, ran } = setup({ application: null });
  const res = await call(handler, post(request));
  assertEquals([res.status, res.body.error], [404, "application_not_found"]);
  assertEquals(ran.length, 1);
});

Deno.test("refuses a new assessment within the cooldown, and allows one after it", async () => {
  const recent = new Date(NOW - (ASSESS_COOLDOWN_SECONDS - 1) * 1000).toISOString();
  const soon = setup({ application: { ...application, lastAssessedAt: recent } });
  const res = await call(soon.handler, post(request));
  assertEquals([res.status, res.body.error], [429, "assessment_too_soon"]);
  assertEquals(soon.ran.length, 1);

  const earlier = new Date(NOW - ASSESS_COOLDOWN_SECONDS * 1000).toISOString();
  const later = setup({ application: { ...application, lastAssessedAt: earlier } });
  assertEquals((await call(later.handler, post(request))).status, 200);
});

Deno.test("says why a CV cannot be assessed, and never calls the model", async () => {
  const cases: [Parameters<typeof setup>[0], number, string][] = [
    [{ application: { ...application, cvPath: null } }, 409, "cv_missing"],
    [{ pdf: null }, 404, "cv_not_found"],
    [{ text: new Error("Invalid PDF structure") }, 422, "cv_unreadable"],
    [{ text: "  \n ".repeat(50) + "a".repeat(MIN_CV_TEXT_LENGTH - 1) }, 422, "cv_no_text"],
    [{ text: "a".repeat(MAX_CV_TEXT_LENGTH + 1) }, 422, "cv_too_long"],
  ];
  for (const [options, status, error] of cases) {
    const { handler, ran } = setup(options);
    const res = await quietly(() => call(handler, post(request)));
    assertEquals([res.status, res.body.error], [status, error]);
    assertEquals(
      ran.some((step) => step.startsWith("assess")),
      false,
    );
  }
});

Deno.test("saves nothing when the model gives no valid answer", async () => {
  const cases: [ModelResult, number, string][] = [
    [{ kind: "no_answer" }, 502, "assessment_failed"],
    [{ kind: "unavailable" }, 503, "assessment_unavailable"],
    [{ kind: "answer", answer: { ...answer, score: 11 }, model: "m" }, 502, "assessment_failed"],
    [
      { kind: "answer", answer: { ...answer, summary: "   " }, model: "m" },
      502,
      "assessment_failed",
    ],
    [
      { kind: "answer", answer: { ...answer, strengths: Array(7).fill("x") }, model: "m" },
      502,
      "assessment_failed",
    ],
    [{ kind: "answer", answer: "not an object", model: "m" }, 502, "assessment_failed"],
  ];
  for (const [model, status, error] of cases) {
    const { handler, ran } = setup({ model });
    const res = await quietly(() => call(handler, post(request)));
    assertEquals([res.status, res.body.error], [status, error]);
    assertEquals(
      ran.some((step) => step.startsWith("save")),
      false,
    );
  }
});

Deno.test("hides unexpected errors behind the unknown code", async () => {
  const failing = createHandler({
    getUserId: () => Promise.resolve("user-1"),
    getApplication: () => Promise.reject(new Error("database down")),
    downloadCv: () => Promise.resolve(null),
    extractText: () => Promise.resolve(""),
    assess: () => Promise.resolve({ kind: "no_answer" }),
    save: () => Promise.reject(new Error("unreachable")),
    now: () => NOW,
  });
  const res = await quietly(() => call(failing, post(request)));
  assertEquals([res.status, res.body], [500, { error: "unknown" }]);
});
