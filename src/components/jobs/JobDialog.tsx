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
import { Field, type FormErrors } from "@/components/candidates/CandidateDialog";
import { useCreateJob, useUpdateJob } from "@/hooks/useJobs";
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
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setTitle(job?.title ?? "");
    setLocation(job?.location ?? "");
    setDescription(job?.description ?? "");
  }, [open, job]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: FormErrors = {};
    if (!title.trim()) errs.title = "title_required";
    if (!location.trim()) errs.location = "location_required";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      if (job) await update.mutateAsync({ id: job.id, patch: { title, location, description } });
      else await create.mutateAsync({ title, location, description, status: "open" });
      toast.success(job ? t("jobDialog.updated") : t("jobDialog.created"));
      onOpenChange(false);
    } catch {
      toast.error(t("jobDialog.saveFailed"));
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
            <Input id="j-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field id="j-loc" label={t("jobDialog.location")} error={errors.location}>
            <Input id="j-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field id="j-desc" label={t("jobDialog.description")}>
            <Textarea
              id="j-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
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
