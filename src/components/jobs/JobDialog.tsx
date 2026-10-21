import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Field } from "@/components/Field";
import { useCreateJob, useDeleteJob, useUpdateJob } from "@/hooks/useJobs";
import {
  MAX_JOB_DESCRIPTION_LENGTH,
  MAX_JOB_LOCATION_LENGTH,
  MAX_JOB_TITLE_LENGTH,
} from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import { fieldErrors, jobInputSchema, type FormErrors, type JobInput } from "@/lib/validation";
import type { JobWithCount } from "@/types";

export function JobDialog({
  customerId,
  open,
  onOpenChange,
  job,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  job: JobWithCount | null;
}) {
  const { t } = useTranslation();
  const create = useCreateJob(customerId);
  const update = useUpdateJob(customerId);
  const remove = useDeleteJob(customerId);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FormErrors<JobInput>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTitle(job?.title ?? "");
    setLocation(job?.location ?? "");
    setDescription(job?.description ?? "");
  }, [open, job]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = jobInputSchema.safeParse({ title, location, description });
    setErrors(parsed.success ? {} : fieldErrors(jobInputSchema, parsed.error));
    if (!parsed.success) return;
    try {
      if (job) await update.mutateAsync({ id: job.id, input: parsed.data });
      else await create.mutateAsync(parsed.data);
      toast.success(job ? t("jobDialog.updated") : t("jobDialog.created"));
      onOpenChange(false);
    } catch (err) {
      const code = errorCode(err);
      toast.error(code === "unknown" ? t("jobDialog.saveFailed") : t(`errors.${code}`));
    }
  };
  const busy = create.isPending || update.isPending || remove.isPending;

  // A job with candidates is never deleted with them. The database refuses too, for a count
  // on screen that is out of date.
  const askToDelete = () => {
    if (job && job.candidate_count > 0) toast.error(t("errors.job_has_candidates"));
    else setConfirming(true);
  };

  const onDelete = async () => {
    if (!job) return;
    try {
      await remove.mutateAsync(job.id);
      toast.success(t("jobDialog.deleted"));
      setConfirming(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(t(`errors.${errorCode(err)}`));
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{job ? t("jobDialog.titleEdit") : t("jobDialog.titleNew")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="j-title" label={t("jobDialog.jobTitle")} error={errors.title}>
            {(control) => (
              <Input
                {...control}
                maxLength={MAX_JOB_TITLE_LENGTH}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            )}
          </Field>
          <Field id="j-loc" label={t("jobDialog.location")} error={errors.location}>
            {(control) => (
              <Input
                {...control}
                maxLength={MAX_JOB_LOCATION_LENGTH}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            )}
          </Field>
          <Field id="j-desc" label={t("jobDialog.description")} error={errors.description}>
            {(control) => (
              <Textarea
                {...control}
                rows={4}
                maxLength={MAX_JOB_DESCRIPTION_LENGTH}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            {job && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                disabled={busy}
                onClick={askToDelete}
              >
                {t("common.delete")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {job && (
        <ConfirmDeleteDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t("jobDialog.deleteTitle")}
          description={t("jobDialog.deleteDescription", { title: job.title })}
          busy={remove.isPending}
          onConfirm={onDelete}
        />
      )}
    </Dialog>
  );
}
