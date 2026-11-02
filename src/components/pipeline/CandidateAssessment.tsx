import { Sparkles, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { AssessmentResult } from "@/components/pipeline/AssessmentResult";
import { ErrorState, LoadingRows } from "@/components/States";
import { useAssessCv, useAssessments, useRemoveAssessment } from "@/hooks/useAssessments";
import { useErrorToast } from "@/hooks/useErrorToast";
import { isFromEarlierCv, latestByApplication } from "@/lib/api/assessments";
import { useFormat } from "@/lib/format";
import type { Application, Candidate } from "@/types";

/**
 * The AI assessment part of the candidate panel (ATS-19): for each job the candidate is linked
 * to, the newest assessment of the CV against that job and a button to make a new one. Always
 * labelled as a suggestion from AI, never a decision. An assessment made from an earlier CV
 * says so (ATS-35), and an assessment can be removed while the CV stays (ATS-56).
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
  const remove = useRemoveAssessment(customerId);
  // The card whose assessment the user is asked about before it is removed.
  const [removing, setRemoving] = useState<Application | null>(null);
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

  const onRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success(t("assessment.removed", { job: jobTitle(removing) }));
    } catch (err) {
      errorToast(t("assessment.removeFailed"), err);
    } finally {
      setRemoving(null);
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
            <span className="flex items-center gap-1">
              {result && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={t("assessment.forJob", {
                    action: t("assessment.remove"),
                    job: jobTitle(a),
                  })}
                  title={t("assessment.remove")}
                  disabled={assessing(a) || remove.isPending}
                  onClick={() => setRemoving(a)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
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
            </span>
          </div>
          {assessing(a) && (
            <p className="text-xs text-muted-foreground" role="status">
              {t("assessment.assessingHint")}
            </p>
          )}
          {result && isFromEarlierCv(result, candidate) && (
            <p className="rounded-md border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-warning-foreground">
              {t("assessment.fromEarlierCv")}
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
      <ConfirmDeleteDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("assessment.removeTitle")}
        description={t("assessment.removeDescription", {
          job: removing ? jobTitle(removing) : "",
        })}
        busy={remove.isPending}
        onConfirm={onRemove}
      />
    </section>
  );
}
