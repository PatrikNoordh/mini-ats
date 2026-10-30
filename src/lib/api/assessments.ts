import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/api/functions";
import type { Language } from "@/lib/language";
import type { Candidate, CvAssessment } from "@/types";

const ASSESSMENT_COLUMNS = "id, application_id, score, summary, strengths, gaps, created_at";

const assessmentRowSchema = z.object({
  id: z.string(),
  application_id: z.string(),
  score: z.number().int(),
  summary: z.string().nullable(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  created_at: z.string(),
});

/** A `cv_assessments` row as the app's CvAssessment. A missing summary becomes empty text. */
export function parseAssessmentRow(row: unknown): CvAssessment {
  const a = assessmentRowSchema.parse(row);
  return { ...a, summary: a.summary ?? "" };
}

/**
 * The assessments of the given applications, newest first. The filter on customer_id matters for
 * admins: RLS returns every customer's assessments to them.
 */
export async function listAssessments(
  customerId: string,
  applicationIds: readonly string[],
): Promise<CvAssessment[]> {
  if (applicationIds.length === 0) return [];
  const { data, error } = await supabase
    .from("cv_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("customer_id", customerId)
    .in("application_id", [...applicationIds])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(parseAssessmentRow);
}

/** The newest assessment of each application, from a list ordered newest first. */
export function latestByApplication(
  assessments: readonly CvAssessment[],
): Map<string, CvAssessment> {
  const latest = new Map<string, CvAssessment>();
  for (const assessment of assessments) {
    if (!latest.has(assessment.application_id)) latest.set(assessment.application_id, assessment);
  }
  return latest;
}

/**
 * Whether an assessment was made from an earlier CV than the candidate's current one: it is
 * older than the current CV's upload (ATS-35). Without a CV, or a CV from before the upload time
 * was stored, there is nothing to compare with, so it is not marked.
 */
export function isFromEarlierCv(
  assessment: Pick<CvAssessment, "created_at">,
  candidate: Pick<Candidate, "cv_uploaded_at">,
): boolean {
  if (!candidate.cv_uploaded_at) return false;
  return Date.parse(assessment.created_at) < Date.parse(candidate.cv_uploaded_at);
}

const assessResponseSchema = z.object({ assessment: z.unknown() });

/**
 * Asks assess-cv for a new assessment of the application's CV, written in the app's language.
 * The function reads with the caller's JWT, so RLS decides; failures come back as codes such as
 * `cv_missing` or `assessment_too_soon` (docs/error-codes.md).
 */
export async function assessCv(applicationId: string, language: Language): Promise<CvAssessment> {
  const data = await invokeFunction("assess-cv", { application_id: applicationId, language });
  return parseAssessmentRow(assessResponseSchema.parse(data).assessment);
}
