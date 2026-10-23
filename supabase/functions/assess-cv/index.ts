// assess-cv: an AI first read of a candidate's CV against the job of one application (ATS-18).
// A suggestion for the recruiter, never a decision. Everything is read with the caller's JWT, so
// RLS decides access; only saving the assessment uses the service role (security rules 2 and 8).
import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.132.1/helpers/zod";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { extractText as pdfText, getDocumentProxy } from "npm:unpdf@1.8.1";
import { z } from "npm:zod@3.25.76/v4";

import { CV_BUCKET } from "../_shared/cvs.ts";
import {
  answerSchema,
  ASSESSMENT_MAX_TOKENS,
  ASSESSMENT_MODEL,
  assessmentSchema,
  SYSTEM_PROMPT,
  userPrompt,
  type Assessment,
  type JobForAssessment,
  type Language,
} from "./assessment.ts";
import {
  createHandler,
  type ApplicationForAssessment,
  type ModelResult,
  type SavedAssessment,
} from "./handler.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

// Supabase provides these to every Edge Function.
const supabaseUrl = env("SUPABASE_URL");
const anonKey = env("SUPABASE_ANON_KEY");
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
// Set with `npx supabase secrets set` and nowhere else (AC6). Read without env(): until it is
// set, the function still answers, with assessment_unavailable, instead of failing at boot.
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
const anthropic = anthropicApiKey ? new Anthropic({ apiKey: anthropicApiKey }) : null;

/** Storage's code for a file that does not exist. */
const STORAGE_NOT_FOUND = "404";
/** Beta that lets the API retry a declined request on the model Anthropic recommends. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

const noSession = { persistSession: false, autoRefreshToken: false };

/** Reads as the caller, so RLS answers for the caller (security rule 2). */
function asCaller(authorization: string): SupabaseClient {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: noSession,
  });
}

async function getUserId(authorization: string): Promise<string | null> {
  const token = authorization.slice("Bearer ".length);
  const { data, error } = await asCaller(authorization).auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

const applicationRowSchema = z.object({
  id: z.string(),
  job: z.object({ title: z.string(), location: z.string(), description: z.string().nullable() }),
  candidate: z.object({ cv_path: z.string().nullable() }),
});

async function getApplication(
  authorization: string,
  id: string,
): Promise<ApplicationForAssessment | null> {
  const caller = asCaller(authorization);
  const { data, error } = await caller
    .from("applications")
    .select("id, job:jobs(title, location, description), candidate:candidates(cv_path)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = applicationRowSchema.parse(data);

  const latest = await caller
    .from("cv_assessments")
    .select("created_at")
    .eq("application_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest.error) throw latest.error;

  return {
    id: row.id,
    cvPath: row.candidate.cv_path,
    job: { ...row.job, description: row.job.description ?? "" },
    lastAssessedAt:
      z.object({ created_at: z.string() }).nullable().parse(latest.data)?.created_at ?? null,
  };
}

async function downloadCv(authorization: string, path: string): Promise<Uint8Array | null> {
  const { data, error } = await asCaller(authorization).storage.from(CV_BUCKET).download(path);
  if (error) {
    if ("statusCode" in error && String(error.statusCode) === STORAGE_NOT_FOUND) return null;
    throw error;
  }
  return new Uint8Array(await data.arrayBuffer());
}

async function extractText(pdf: Uint8Array): Promise<string> {
  const document = await getDocumentProxy(pdf);
  const { text } = await pdfText(document, { mergePages: true });
  return text;
}

/** One request, structured JSON back (AC3). A declined request falls back server-side. */
async function assess(
  job: JobForAssessment,
  cvText: string,
  language: Language,
): Promise<ModelResult> {
  if (!anthropic) {
    console.error("assess-cv: ANTHROPIC_API_KEY is not set");
    return { kind: "unavailable" };
  }
  try {
    const response = await anthropic.beta.messages.parse({
      model: ASSESSMENT_MODEL,
      max_tokens: ASSESSMENT_MAX_TOKENS,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: zodOutputFormat(answerSchema) },
      messages: [{ role: "user", content: userPrompt(job, cvText, language) }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.error("assess-cv: no answer", response.stop_reason);
      return { kind: "no_answer" };
    }
    return { kind: "answer", answer: response.parsed_output, model: response.model };
  } catch (error) {
    if (
      error instanceof Anthropic.RateLimitError ||
      error instanceof Anthropic.InternalServerError ||
      error instanceof Anthropic.APIConnectionError
    ) {
      console.error("assess-cv: the model is unavailable", error);
      return { kind: "unavailable" };
    }
    // The SDK's own errors that are not API responses: an answer that failed its schema check.
    if (error instanceof Anthropic.AnthropicError && !(error instanceof Anthropic.APIError)) {
      console.error("assess-cv: the answer could not be parsed", error);
      return { kind: "no_answer" };
    }
    // A wrong key or a bad request is a bug or a setup error, not the model's: unknown, logged.
    throw error;
  }
}

const savedSchema = assessmentSchema.extend({
  id: z.string(),
  application_id: z.string(),
  model: z.string(),
  created_at: z.string(),
});

/** The one privileged action: clients can only read assessments (AC5, security rule 8). */
async function save(
  applicationId: string,
  assessment: Assessment,
  model: string,
): Promise<SavedAssessment> {
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: noSession });
  // customer_id is set by the trigger from the application (security rule 7).
  const { data, error } = await service
    .from("cv_assessments")
    .insert({ application_id: applicationId, ...assessment, model })
    .select("id, application_id, score, summary, strengths, gaps, model, created_at")
    .single();
  if (error) throw error;
  return savedSchema.parse(data);
}

Deno.serve(
  createHandler({
    getUserId,
    getApplication,
    downloadCv,
    extractText,
    assess,
    save,
    now: () => Date.now(),
  }),
);
