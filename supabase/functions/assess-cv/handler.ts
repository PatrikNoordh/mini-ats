import { z } from "npm:zod@3.25.76/v4";

import { corsHeaders, json } from "../_shared/cors.ts";
import {
  assessmentSchema,
  languageSchema,
  MAX_CV_TEXT_LENGTH,
  MIN_CV_TEXT_LENGTH,
  normalizeCvText,
  type Assessment,
  type JobForAssessment,
  type Language,
} from "./assessment.ts";

/** One assessment per application per minute, so a double click or a loop cannot run up costs. */
export const ASSESS_COOLDOWN_SECONDS = 60;

export const requestSchema = z.object({
  application_id: z.string().uuid(),
  language: languageSchema,
});

/** The application as the caller sees it through RLS (AC1). */
export interface ApplicationForAssessment {
  id: string;
  cvPath: string | null;
  job: JobForAssessment;
  /** When the newest assessment of this application was made, or null. */
  lastAssessedAt: string | null;
}

/** What the model answered. `answer` is checked against assessmentSchema before it is saved. */
export type ModelResult =
  | { kind: "answer"; answer: unknown; model: string }
  /** The model declined, or its answer did not parse. */
  | { kind: "no_answer" }
  /** The API could not be reached, was overloaded or rate limited. */
  | { kind: "unavailable" };

export interface SavedAssessment extends Assessment {
  id: string;
  application_id: string;
  model: string;
  created_at: string;
}

/**
 * The outside world, passed in so the flow can be tested without a project. Everything reads
 * with the caller's JWT; only `save` uses the service role (CLAUDE.md, security rules 2 and 8).
 */
export interface Deps {
  /** The caller's user id, or null for a missing, expired or invalid token. */
  getUserId: (authorization: string) => Promise<string | null>;
  getApplication: (authorization: string, id: string) => Promise<ApplicationForAssessment | null>;
  /** The CV file, downloaded as the caller (AC2), or null when there is no such file. */
  downloadCv: (authorization: string, path: string) => Promise<Uint8Array | null>;
  /** The text of a PDF. Throws when the file is not a readable PDF. */
  extractText: (pdf: Uint8Array) => Promise<string>;
  assess: (job: JobForAssessment, cvText: string, language: Language) => Promise<ModelResult>;
  save: (applicationId: string, assessment: Assessment, model: string) => Promise<SavedAssessment>;
  now: () => number;
}

type Step<T> = { ok: true; value: T } | { ok: false; response: Response };

const fail = (error: string, status: number): { ok: false; response: Response } => ({
  ok: false,
  response: json({ error }, status),
});

/** The CV's text, or why it cannot be assessed. Too long is refused, never cut. */
async function cvText(deps: Deps, authorization: string, path: string): Promise<Step<string>> {
  const pdf = await deps.downloadCv(authorization, path);
  if (!pdf) return fail("cv_not_found", 404);
  let text: string;
  try {
    text = normalizeCvText(await deps.extractText(pdf));
  } catch (error) {
    console.error("assess-cv: could not read the PDF", error);
    return fail("cv_unreadable", 422);
  }
  if (text.length < MIN_CV_TEXT_LENGTH) return fail("cv_no_text", 422);
  if (text.length > MAX_CV_TEXT_LENGTH) return fail("cv_too_long", 422);
  return { ok: true, value: text };
}

/** The model's assessment, checked before anything is saved (AC3). */
async function modelAssessment(
  deps: Deps,
  job: JobForAssessment,
  text: string,
  language: Language,
): Promise<Step<{ assessment: Assessment; model: string }>> {
  const result = await deps.assess(job, text, language);
  if (result.kind === "unavailable") return fail("assessment_unavailable", 503);
  if (result.kind === "no_answer") return fail("assessment_failed", 502);
  const checked = assessmentSchema.safeParse(result.answer);
  if (!checked.success) {
    console.error("assess-cv: the answer failed validation", checked.error.issues);
    return fail("assessment_failed", 502);
  }
  return { ok: true, value: { assessment: checked.data, model: result.model } };
}

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "not_authenticated" }, 401);

    try {
      // The caller is checked before the body is even read.
      if (!(await deps.getUserId(authorization))) return json({ error: "not_authenticated" }, 401);

      const parsed = requestSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        const fields = [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "body")),
        ];
        return json({ error: "invalid_input", fields }, 400);
      }
      const { application_id, language } = parsed.data;

      // RLS decides: another customer's application, or a deleted account's, is not found.
      const application = await deps.getApplication(authorization, application_id);
      if (!application) return json({ error: "application_not_found" }, 404);
      const last = application.lastAssessedAt ? Date.parse(application.lastAssessedAt) : null;
      if (last !== null && deps.now() - last < ASSESS_COOLDOWN_SECONDS * 1000) {
        return json({ error: "assessment_too_soon" }, 429);
      }
      if (!application.cvPath) return json({ error: "cv_missing" }, 409);

      const text = await cvText(deps, authorization, application.cvPath);
      if (!text.ok) return text.response;
      const result = await modelAssessment(deps, application.job, text.value, language);
      if (!result.ok) return result.response;

      const saved = await deps.save(application.id, result.value.assessment, result.value.model);
      return json({ assessment: saved }, 200);
    } catch (error) {
      // Logged for the Supabase function logs. The CV text is never logged.
      console.error("assess-cv failed", error);
      return json({ error: "unknown" }, 500);
    }
  };
}
