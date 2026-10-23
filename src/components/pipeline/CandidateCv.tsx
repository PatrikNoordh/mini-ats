import { FileText, Upload } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { useCvUrl, useRemoveCv, useUploadCv } from "@/hooks/useCvs";
import { useErrorToast } from "@/hooks/useErrorToast";
import { CV_MIME_TYPE } from "@/lib/constants";
import { AppError, errorCode } from "@/lib/errors";
import { cvFileError } from "@/lib/validation";
import type { Candidate } from "@/types";

/**
 * The CV part of the candidate panel (ATS-17): upload a PDF, open it through a short-lived link,
 * replace it or remove it. The file input is hidden; the buttons open it.
 */
export function CandidateCv({
  customerId,
  candidate,
}: {
  customerId: string;
  candidate: Candidate;
}) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const input = useRef<HTMLInputElement>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const url = useCvUrl(customerId, candidate.cv_path);
  const upload = useUploadCv(customerId);
  const remove = useRemoveCv(customerId);
  const busy = upload.isPending || remove.isPending;

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again still fires a change.
    event.target.value = "";
    if (!file) return;
    const invalid = cvFileError(file);
    if (invalid) {
      errorToast(t("candidateSheet.cvUploadFailed"), new AppError(invalid));
      return;
    }
    try {
      await upload.mutateAsync({ candidateId: candidate.id, file });
      toast.success(t("candidateSheet.cvUploaded"));
    } catch (err) {
      errorToast(t("candidateSheet.cvUploadFailed"), err);
    }
  };

  const onRemove = async () => {
    try {
      await remove.mutateAsync(candidate.id);
      toast.success(t("candidateSheet.cvRemoved"));
    } catch (err) {
      errorToast(t("candidateSheet.cvRemoveFailed"), err);
    } finally {
      setConfirmRemove(false);
    }
  };

  return (
    <div>
      <dt className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("candidateSheet.cv")}
      </dt>
      <dd className="space-y-2">
        {candidate.cv_path ? (
          <div className="flex flex-wrap items-center gap-2">
            {url.isError ? (
              <span className="text-destructive" role="alert">
                {t("candidateSheet.cvOpenFailed")} {t(`errors.${errorCode(url.error)}`)}{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => url.refetch()}
                >
                  {t("common.retry")}
                </Button>
              </span>
            ) : url.data ? (
              <Button asChild variant="outline" size="sm">
                <a href={url.data} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  {t("candidateSheet.openCv")}
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                <FileText className="h-4 w-4" aria-hidden="true" />
                {t("candidateSheet.openCv")}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {upload.isPending ? t("candidateSheet.uploading") : t("candidateSheet.replaceCv")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              {t("candidateSheet.removeCv")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("candidateSheet.noCv")}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {upload.isPending ? t("candidateSheet.uploading") : t("candidateSheet.uploadCv")}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t("candidateSheet.cvHint")}</p>
        <input
          ref={input}
          type="file"
          accept={CV_MIME_TYPE}
          className="hidden"
          tabIndex={-1}
          aria-label={t("candidateSheet.chooseCvFile", { name: candidate.full_name })}
          onChange={onFile}
        />
      </dd>
      <ConfirmDeleteDialog
        open={confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(false)}
        title={t("candidateSheet.removeCvTitle")}
        description={t("candidateSheet.removeCvDescription", { name: candidate.full_name })}
        confirmLabel={t("candidateSheet.removeCv")}
        busy={remove.isPending}
        onConfirm={onRemove}
      />
    </div>
  );
}
