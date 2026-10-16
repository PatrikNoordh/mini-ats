import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useJobs } from "@/hooks/useJobs";
import { useApplications } from "@/hooks/useApplications";
import { useSaveCandidate } from "@/hooks/useCandidates";
import { isLinkedInUrl } from "@/lib/stages";
import type { Candidate } from "@/types";

export type FormErrors = Partial<
  Record<
    "full_name" | "email" | "linkedin_url" | "company_name" | "password" | "title" | "location",
    string
  >
>;

const empty = { full_name: "", email: "", phone: "", linkedin_url: "", notes: "" };

export function CandidateDialog({
  customerId,
  open,
  onOpenChange,
  candidate,
}: {
  customerId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidate: Candidate | null;
}) {
  const jobs = useJobs(customerId);
  const apps = useApplications(customerId);
  const save = useSaveCandidate(customerId);
  const [form, setForm] = useState(empty);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (candidate) {
      const { full_name, email, phone, linkedin_url, notes } = candidate;
      setForm({ full_name, email, phone, linkedin_url, notes });
      setJobIds(
        (apps.data ?? []).filter((a) => a.candidate_id === candidate.id).map((a) => a.job_id),
      );
    } else {
      setForm(empty);
      setJobIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidate?.id]);

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: FormErrors = {};
    if (!form.full_name.trim()) errs.full_name = "Ange namn.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = "Ange en giltig e-postadress.";
    if (form.linkedin_url.trim() && !isLinkedInUrl(form.linkedin_url.trim()))
      errs.linkedin_url = "Länken måste gå till linkedin.com.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      await save.mutateAsync({
        id: candidate?.id,
        input: { ...form, linkedin_url: form.linkedin_url.trim() },
        jobIds,
      });
      toast.success(candidate ? "Kandidaten är uppdaterad." : "Kandidaten är tillagd.");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message || "Kunde inte spara.");
    }
  };

  const visibleJobs = (jobs.data ?? []).filter((j) => j.status === "open" || jobIds.includes(j.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{candidate ? "Redigera kandidat" : "Ny kandidat"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="c-name" label="Namn" error={errors.full_name}>
            <Input id="c-name" value={form.full_name} onChange={set("full_name")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="c-email" label="E-post" error={errors.email}>
              <Input id="c-email" type="email" value={form.email} onChange={set("email")} />
            </Field>
            <Field id="c-phone" label="Telefon">
              <Input id="c-phone" value={form.phone} onChange={set("phone")} />
            </Field>
          </div>
          <Field id="c-li" label="LinkedIn-länk" error={errors.linkedin_url}>
            <Input
              id="c-li"
              placeholder="https://www.linkedin.com/in/…"
              value={form.linkedin_url}
              onChange={set("linkedin_url")}
            />
          </Field>
          <Field id="c-notes" label="Anteckningar">
            <Textarea id="c-notes" rows={3} value={form.notes} onChange={set("notes")} />
          </Field>
          <div className="space-y-2">
            <Label>Koppla till jobb</Label>
            {visibleJobs.length === 0 && (
              <p className="text-sm text-muted-foreground">Inga öppna jobb.</p>
            )}
            <div className="space-y-1.5">
              {visibleJobs.map((j) => (
                <label key={j.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={jobIds.includes(j.id)}
                    onCheckedChange={(c) =>
                      setJobIds((ids) => (c ? [...ids, j.id] : ids.filter((x) => x !== j.id)))
                    }
                  />
                  {j.title} <span className="text-muted-foreground">· {j.location}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Nya kopplingar hamnar i steget Ny.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Sparar…" : "Spara"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
