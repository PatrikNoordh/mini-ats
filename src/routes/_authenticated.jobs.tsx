import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
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
import type { Job } from "@/types";

export const Route = createFileRoute("/_authenticated/jobs")({
  head: () => ({
    meta: [
      { title: "Jobb — Mini-ATS" },
      { name: "description", content: "Skapa, redigera och stäng jobbannonser." },
      { property: "og:title", content: "Jobb — Mini-ATS" },
      { property: "og:description", content: "Skapa, redigera och stäng jobbannonser." },
    ],
  }),
  component: () => <CustomerGate>{(id) => <Jobs customerId={id} />}</CustomerGate>,
});

function Jobs({ customerId }: { customerId: string }) {
  const jobs = useJobs(customerId);
  const apps = useApplications(customerId);
  const update = useUpdateJob(customerId);
  const [editing, setEditing] = useState<Job | null>(null);
  const [open, setOpen] = useState(false);

  const toggle = async (j: Job) => {
    const status = j.status === "open" ? "closed" : "open";
    try {
      await update.mutateAsync({ id: j.id, patch: { status } });
      toast.success(status === "open" ? "Jobbet är öppnat igen." : "Jobbet är stängt.");
    } catch {
      toast.error("Kunde inte ändra status.");
    }
  };

  return (
    <div>
      <PageHeader
        title="Jobb"
        meta={
          jobs.data ? `${jobs.data.filter((j) => j.status === "open").length} öppna` : undefined
        }
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            + Nytt jobb
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
            <EmptyState title="Inga jobb än">
              Skapa ditt första jobb för att börja ta emot kandidater.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titel</TableHead>
                <TableHead className="hidden sm:table-cell">Ort</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Kandidater</TableHead>
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
                      {j.status === "open" ? "Öppet" : "Stängt"}
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
                      {j.status === "open" ? "Stäng" : "Öppna igen"}
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
    if (!title.trim()) errs.title = "Ange en titel.";
    if (!location.trim()) errs.location = "Ange en ort.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      if (job) await update.mutateAsync({ id: job.id, patch: { title, location, description } });
      else await create.mutateAsync({ title, location, description, status: "open" });
      toast.success(job ? "Jobbet är uppdaterat." : "Jobbet är skapat.");
      onOpenChange(false);
    } catch {
      toast.error("Kunde inte spara jobbet.");
    }
  };
  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{job ? "Redigera jobb" : "Nytt jobb"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="j-title" label="Titel" error={errors.title}>
            <Input id="j-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field id="j-loc" label="Ort" error={errors.location}>
            <Input id="j-loc" value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field id="j-desc" label="Beskrivning">
            <Textarea
              id="j-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Sparar…" : "Spara"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
