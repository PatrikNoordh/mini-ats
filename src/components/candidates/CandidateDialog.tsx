import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
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
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { Field } from "@/components/Field";
import { ErrorState, LoadingRows } from "@/components/States";
import { useJobs } from "@/hooks/useJobs";
import { useApplications } from "@/hooks/useApplications";
import { useDeleteCandidate, useSaveCandidate } from "@/hooks/useCandidates";
import { useErrorToast } from "@/hooks/useErrorToast";
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_URL_LENGTH,
} from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import { useFormat } from "@/lib/format";
import {
  candidateInputSchema,
  fieldErrors,
  type CandidateInput,
  type FormErrors,
} from "@/lib/validation";
import type { Candidate } from "@/types";

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
  const { t } = useTranslation();
  const format = useFormat();
  const jobs = useJobs(customerId);
  const apps = useApplications(customerId);
  const save = useSaveCandidate(customerId);
  const remove = useDeleteCandidate(customerId);
  const errorToast = useErrorToast();
  const [confirming, setConfirming] = useState(false);
  const [form, setForm] = useState(empty);
  // Jobs ticked and unticked in this dialog. The existing links come from the applications.
  const [newJobIds, setNewJobIds] = useState<string[]>([]);
  const [removedJobIds, setRemovedJobIds] = useState<string[]>([]);
  // The validated form, held while the user confirms removing links.
  const [pendingInput, setPendingInput] = useState<CandidateInput | null>(null);
  const [errors, setErrors] = useState<FormErrors<CandidateInput>>({});

  // Jobs the candidate is already linked to. Read from the query, so links that arrive after the
  // dialog opened still show.
  const linkedJobIds = useMemo(
    () =>
      candidate
        ? (apps.data ?? []).filter((a) => a.candidate_id === candidate.id).map((a) => a.job_id)
        : [],
    [apps.data, candidate],
  );

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setNewJobIds([]);
    setRemovedJobIds([]);
    setPendingInput(null);
    if (candidate) {
      const { full_name, email, phone, linkedin_url, notes } = candidate;
      setForm({ full_name, email, phone, linkedin_url, notes });
    } else {
      setForm(empty);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, candidate?.id]);

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Only links that still exist are removed, so one removed in another tab meanwhile is skipped.
  const removing = removedJobIds.filter((id) => linkedJobIds.includes(id));

  const saveCandidate = async (input: CandidateInput) => {
    try {
      await save.mutateAsync({
        id: candidate?.id,
        input,
        newJobIds: newJobIds.filter((id) => !linkedJobIds.includes(id)),
        removedJobIds: removing,
      });
      toast.success(candidate ? t("candidateDialog.updated") : t("candidateDialog.created"));
      onOpenChange(false);
    } catch (err) {
      // The candidate is saved, so the form closes: saving it again would create a duplicate.
      const code = errorCode(err);
      if (code === "links_failed" || code === "unlinks_failed") {
        toast.error(t(`errors.${code}`));
        onOpenChange(false);
      } else {
        errorToast(t("candidateDialog.saveFailed"), err);
      }
    } finally {
      setPendingInput(null);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = candidateInputSchema.safeParse(form);
    setErrors(parsed.success ? {} : fieldErrors(candidateInputSchema, parsed.error));
    if (!parsed.success) return;
    // Removing a link deletes its card, so it is confirmed first.
    if (removing.length > 0) setPendingInput(parsed.data);
    else await saveCandidate(parsed.data);
  };

  // Cancelling the confirm keeps every link: the unticked jobs are ticked again.
  const onCancelUnlink = () => {
    setPendingInput(null);
    setRemovedJobIds([]);
  };

  const onDelete = async () => {
    if (!candidate) return;
    try {
      await remove.mutateAsync(candidate.id);
      toast.success(t("candidateDialog.deleted"));
      setConfirming(false);
      onOpenChange(false);
    } catch (err) {
      errorToast(t("candidateDialog.deleteFailed"), err);
      setConfirming(false);
    }
  };

  // Editing needs the existing links first, or they would show as unchecked and enabled.
  const linksLoading = jobs.isLoading || (!!candidate && apps.isLoading);
  const linksError = jobs.isError || (!!candidate && apps.isError);
  const isLinked = (jobId: string) => linkedJobIds.includes(jobId);
  const isChecked = (jobId: string) =>
    isLinked(jobId) ? !removedJobIds.includes(jobId) : newJobIds.includes(jobId);
  // A closed job stays listed while the candidate is linked to it, so it can be unticked and ticked
  // back.
  const visibleJobs = (jobs.data ?? []).filter(
    (j) => j.status === "open" || isLinked(j.id) || newJobIds.includes(j.id),
  );
  const toggle = (jobId: string, checked: boolean) => {
    const update = (ids: string[], add: boolean) =>
      add ? [...ids, jobId] : ids.filter((x) => x !== jobId);
    if (isLinked(jobId)) setRemovedJobIds((ids) => update(ids, !checked));
    else setNewJobIds((ids) => update(ids, checked));
  };
  const removingTitles = (jobs.data ?? [])
    .filter((j) => removing.includes(j.id))
    .map((j) => j.title);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-dialog overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {candidate ? t("candidateDialog.titleEdit") : t("candidateDialog.titleNew")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="c-name" label={t("candidateDialog.name")} error={errors.full_name}>
            {(control) => (
              <Input
                {...control}
                maxLength={MAX_NAME_LENGTH}
                value={form.full_name}
                onChange={set("full_name")}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="c-email" label={t("candidateDialog.email")} error={errors.email}>
              {(control) => (
                <Input
                  {...control}
                  type="email"
                  maxLength={MAX_EMAIL_LENGTH}
                  value={form.email}
                  onChange={set("email")}
                />
              )}
            </Field>
            <Field id="c-phone" label={t("candidateDialog.phone")} error={errors.phone}>
              {(control) => (
                <Input
                  {...control}
                  type="tel"
                  maxLength={MAX_PHONE_LENGTH}
                  value={form.phone}
                  onChange={set("phone")}
                />
              )}
            </Field>
          </div>
          <Field id="c-li" label={t("candidateDialog.linkedin")} error={errors.linkedin_url}>
            {(control) => (
              <Input
                {...control}
                type="url"
                maxLength={MAX_URL_LENGTH}
                placeholder={t("candidateDialog.linkedinPlaceholder")}
                value={form.linkedin_url}
                onChange={set("linkedin_url")}
              />
            )}
          </Field>
          <Field id="c-notes" label={t("candidateDialog.notes")} error={errors.notes}>
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                maxLength={MAX_NOTES_LENGTH}
                value={form.notes}
                onChange={set("notes")}
              />
            )}
          </Field>
          <div className="space-y-2">
            <Label>{t("candidateDialog.linkJobs")}</Label>
            {linksLoading ? (
              <LoadingRows rows={2} />
            ) : linksError ? (
              <ErrorState
                onRetry={() => {
                  jobs.refetch();
                  apps.refetch();
                }}
              />
            ) : (
              <>
                {visibleJobs.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("candidateDialog.noOpenJobs")}</p>
                )}
                <div className="space-y-1.5">
                  {visibleJobs.map((j) => (
                    <label key={j.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={isChecked(j.id)}
                        onCheckedChange={(c) => toggle(j.id, c === true)}
                      />
                      {j.title} <span className="text-muted-foreground">· {j.location}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("candidateDialog.newLinksHint")}
                  {linkedJobIds.length > 0 && ` ${t("candidateDialog.unlinkHint")}`}
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            {candidate && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                disabled={save.isPending || remove.isPending}
                onClick={() => setConfirming(true)}
              >
                {t("common.delete")}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending || remove.isPending || linksLoading}>
              {save.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {candidate && (
        <ConfirmDeleteDialog
          open={pendingInput !== null}
          onOpenChange={(o) => !o && onCancelUnlink()}
          title={t("candidateDialog.unlinkTitle")}
          description={t("candidateDialog.unlinkDescription", {
            name: pendingInput?.full_name ?? candidate.full_name,
            jobs: format.list(removingTitles),
            count: removing.length,
          })}
          confirmLabel={t("candidateDialog.unlinkConfirm")}
          busy={save.isPending}
          onConfirm={() => pendingInput && saveCandidate(pendingInput)}
        />
      )}
      {candidate && (
        <ConfirmDeleteDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={t("candidateDialog.deleteTitle")}
          description={[
            t("candidateDialog.deleteDescription", { name: candidate.full_name }),
            // The number is only known once the links have loaded.
            apps.isSuccess && linkedJobIds.length > 0
              ? t("candidateDialog.deleteLinks", { count: linkedJobIds.length })
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          busy={remove.isPending}
          onConfirm={onDelete}
        />
      )}
    </Dialog>
  );
}
