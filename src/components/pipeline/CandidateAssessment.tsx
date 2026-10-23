import { Sparkles } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssessmentResult } from "@/components/pipeline/AssessmentResult";
import { ErrorState, LoadingRows } from "@/components/States";
import { useAssessCv, useAssessments } from "@/hooks/useAssessments";
import { useErrorToast } from "@/hooks/useErrorToast";
import { latestByApplication } from "@/lib/api/assessments";
import { useFormat } from "@/lib/format";
import type { Application, Candidate } from "@/types";

/**
 * The AI assessment part of the candidate panel (ATS-19): for each job the candidate is linked
 * to, the newest assessment of the CV against that job and a button to make a new one. Always
 * labelled as a suggestion from AI, never a decision.
 */
export function CandidateAssessment({
  customerId,
  candidate,
  links,
  jobTitle,
}: {
  customerId: string;
  candidate: Candidate;
  links: Application[];
  jobTitle: (application: Application) => string;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const errorToast = useErrorToast();
  const headingId = useId();
  const assessments = useAssessments(
    customerId,
    candidate.id,
    links.map((a) => a.id),
  );
  const assess = useAssessCv(customerId);
  const latest = latestByApplication(assessments.data ?? []);
  const assessing = (a: Application) =>
    assess.isPending && assess.variables?.applicationId === a.id;

  const onAssess = async (a: Application) => {
    try {
      await assess.mutateAsync({ applicationId: a.id, language: format.language });
      toast.success(t("assessment.done", { job: jobTitle(a) }));
    } catch (err) {
      errorToast(t("assessment.failed"), err);
    }
  };

  const body = () => {
    if (links.length === 0) {
      return <p className="text-muted-foreground">{t("assessment.noLinks")}</p>;
    }
    if (assessments.isLoading) return <LoadingRows rows={1} />;
    if (assessments.isError) return <ErrorState onRetry={() => assessments.refetch()} />;
    return links.map((a) => {
      const result = latest.get(a.id);
      const action = assessing(a)
        ? t("assessment.assessing")
        : result
          ? t("assessment.assessAgain")
          : t("assessment.assess");
      return (
        <div key={a.id} className="space-y-3 rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium">{jobTitle(a)}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!candidate.cv_path || assess.isPending}
              // The visible text first, so voice control finds it, then the job (WCAG 2.5.3).
              aria-label={t("assessment.forJob", { action, job: jobTitle(a) })}
              onClick={() => onAssess(a)}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {action}
            </Button>
          </div>
          {assessing(a) && (
            <p className="text-xs text-muted-foreground" role="status">
              {t("assessment.assessingHint")}
            </p>
          )}
          {result ? (
            <AssessmentResult assessment={result} />
          ) : (
            <p className="text-muted-foreground">{t("assessment.notAssessed")}</p>
          )}
        </div>
      );
    });
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="text-sm font-semibold">
          {t("assessment.title")}
        </h3>
        <Badge variant="secondary">{t("assessment.badge")}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{t("assessment.disclaimer")}</p>
      {!candidate.cv_path && links.length > 0 && (
        <p className="text-muted-foreground">{t("assessment.noCv")}</p>
      )}
      {body()}
    </section>
  );
}
