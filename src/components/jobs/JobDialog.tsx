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
import { Field } from "@/components/Field";
import { useCreateJob, useUpdateJob } from "@/hooks/useJobs";
import {
  MAX_JOB_DESCRIPTION_LENGTH,
  MAX_JOB_LOCATION_LENGTH,
  MAX_JOB_TITLE_LENGTH,
} from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import { fieldErrors, jobInputSchema, type FormErrors, type JobInput } from "@/lib/validation";
import type { Job } from "@/types";

export function JobDialog({
  customerId,
  open,
  onOpenChange,
  job,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  job: Job | null;
}) {
  const { t } = useTranslation();
  const create = useCreateJob(customerId);
  const update = useUpdateJob(customerId);
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
  const busy = create.isPending || update.isPending;

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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
