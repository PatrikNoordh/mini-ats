import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerGate } from "@/components/layout/CustomerGate";
import { EmptyState, ErrorState, LoadingRows, PageHeader } from "@/components/States";
import { Field, type FormErrors } from "@/components/candidates/CandidateDialog";
import { useCreateJob, useJobs, useUpdateJob } from "@/hooks/useJobs";
import { useApplications } from "@/hooks/useApplications";
import { pageHead } from "@/lib/i18n";
import type { Job } from "@/types";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: ({ match }) => pageHead(match.context.language, "jobs"),
  component: () => <CustomerGate>{(id) => <Jobs customerId={id} />}</CustomerGate>,
});

function Jobs({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const jobs = useJobs(customerId);
  const apps = useApplications(customerId);
  const update = useUpdateJob(customerId);
  const [editing, setEditing] = useState<Job | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = async (j: Job) => {
    const status = j.status === "open" ? "closed" : "open";
    try {
      await update.mutateAsync({ id: j.id, patch: { status } });
      toast.success(status === "open" ? t("jobs.reopened") : t("jobs.closedToast"));
    } catch {
      toast.error(t("jobs.statusFailed"));
    }
  };

  return (
    <div>
      <PageHeader
        title={t("jobs.title")}
        meta={
          jobs.data
            ? t("jobs.openCount", { count: jobs.data.filter((j) => j.status === "open").length })
            : undefined
        }
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            {t("jobs.new")}
          </Button>
        }
      />
      <div className="rounded-lg border bg-card">
        {jobs.isLoading ? (
          <LoadingRows rows={4} />
        ) : jobs.isError ? (
          <div className="p-4">
            <ErrorState onRetry={() => jobs.refetch()} />
          </div>
        ) : !jobs.data?.length ? (
          <div className="p-4">
            <EmptyState title={t("jobs.empty")}>{t("jobs.emptyHint")}</EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("jobs.jobTitle")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("jobs.location")}</TableHead>
                <TableHead>{t("jobs.status")}</TableHead>
                <TableHead className="text-right">{t("jobs.candidates")}</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.data.map((j) => (
                <TableRow key={j.id}>
                  <TableCell>
                    <button
                      className="font-semibold text-primary hover:underline"
                      onClick={() => {
                        setEditing(j);
                        setOpen(true);
                      }}
                    >
                      {j.title}
                    </button>
                    <div className="text-xs text-muted-foreground sm:hidden">{j.location}</div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{j.location}</TableCell>
                  <TableCell>
                    <Badge variant={j.status === "open" ? "default" : "secondary"}>
                      {j.status === "open" ? t("jobs.open") : t("jobs.closed")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {apps.data?.filter((a) => a.job_id === j.id).length ?? "…"}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={update.isPending}
                      onClick={() => toggle(j)}
                    >
                      {j.status === "open" ? t("jobs.close") : t("jobs.reopen")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <JobDialog customerId={customerId} open={open} onOpenChange={setOpen} job={editing} />
    </div>
  );
}

function JobDialog({
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
