import { ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { AddToJob } from "@/components/pipeline/AddToJob";
import { useRemoveApplication } from "@/hooks/useApplications";
import { useErrorToast } from "@/hooks/useErrorToast";
import { useFormat } from "@/lib/format";
import { daysSince } from "@/lib/stages";
import type { Application, Candidate, Job } from "@/types";

export function CandidateSheet({
  customerId,
  candidate,
  applications,
  jobs,
  onClose,
}: {
  customerId: string;
  candidate: Candidate | null;
  applications: Application[];
  jobs: Job[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const remove = useRemoveApplication(customerId);
  const errorToast = useErrorToast();
  // The card the user is asked about before it is removed.
  const [removing, setRemoving] = useState<Application | null>(null);
  const links = candidate ? applications.filter((a) => a.candidate_id === candidate.id) : [];
  const jobTitle = (a: Application) =>
    jobs.find((j) => j.id === a.job_id)?.title ?? t("pipeline.unknownJob");

  const onRemove = async () => {
    if (!candidate || !removing) return;
    try {
      await remove.mutateAsync({ candidateId: candidate.id, jobId: removing.job_id });
      toast.success(t("candidateSheet.removedToast", { job: jobTitle(removing) }));
    } catch (err) {
      errorToast(t("candidateSheet.removeFailed"), err);
    } finally {
      setRemoving(null);
    }
  };
  return (
    <Sheet open={!!candidate} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {candidate && (
          <>
            <SheetHeader>
              <SheetTitle className="text-xl">{candidate.full_name}</SheetTitle>
              <SheetDescription>
                {t("candidateSheet.added", { date: format.date(candidate.created_at) })}
              </SheetDescription>
            </SheetHeader>
            <dl className="mt-6 space-y-4 px-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("candidateSheet.email")}
                </dt>
                <dd>
                  <a className="text-primary hover:underline" href={`mailto:${candidate.email}`}>
                    {candidate.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("candidateSheet.phone")}
                </dt>
                <dd>{candidate.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("candidateSheet.linkedin")}
                </dt>
                <dd>
                  {candidate.linkedin_url ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={candidate.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("candidateSheet.openProfile")} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("candidateSheet.notes")}
                </dt>
                <dd className="whitespace-pre-wrap">
                  {candidate.notes || (
                    <span className="text-muted-foreground">{t("candidateSheet.noNotes")}</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("candidateSheet.linkedJobs")}
                </dt>
                <dd className="space-y-2">
                  {links.length === 0 && (
                    <span className="text-muted-foreground">
                      {t("candidateSheet.noLinkedJobs")}
                    </span>
                  )}
                  {links.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="min-w-0 truncate font-medium">{jobTitle(a)}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant="secondary">{t(`stages.${a.stage}`)}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {t("pipeline.days", { count: daysSince(a.stage_changed_at) })}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          aria-label={t("candidateSheet.removeFromJob", { job: jobTitle(a) })}
                          disabled={remove.isPending}
                          onClick={() => setRemoving(a)}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </span>
                    </div>
                  ))}
                </dd>
              </div>
            </dl>
            <div className="mt-4 px-4 pb-4 text-sm">
              <AddToJob
                key={candidate.id}
                customerId={customerId}
                candidateId={candidate.id}
                applications={applications}
                jobs={jobs}
              />
            </div>
            <ConfirmDeleteDialog
              open={removing !== null}
              onOpenChange={(o) => !o && setRemoving(null)}
              title={t("candidateDialog.unlinkTitle")}
              description={t("candidateDialog.unlinkDescription", {
                name: candidate.full_name,
                jobs: removing ? jobTitle(removing) : "",
                count: 1,
              })}
              confirmLabel={t("candidateDialog.unlinkConfirm")}
              busy={remove.isPending}
              onConfirm={onRemove}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
