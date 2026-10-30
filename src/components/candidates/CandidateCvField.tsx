import { FileText, Upload } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field } from "@/components/Field";
import { useCvUrl } from "@/hooks/useCvs";
import { CV_MIME_TYPE } from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { ValidationKey } from "@/lib/validation";

/**
 * The CV field of the candidate dialog (ATS-17, made clearer in ATS-32). Says whether the
 * candidate already has a CV, with a link to open it, and which file is chosen to replace it.
 * While the link is made, "Öppna" is disabled; if it fails, the error and a retry show instead,
 * as in the side panel (ATS-35).
 * The real file input stays focusable and labelled but is visually hidden, because the browser's
 * own one says "no file chosen" even when the candidate has a CV; a label styled as a button
 * opens it and shows its focus ring.
 */
export function CandidateCvField({
  customerId,
  cvPath,
  file,
  error,
  onChange,
  onClear,
}: {
  customerId: string;
  /** The candidate's current CV, or null for a new candidate or one without a CV. */
  cvPath: string | null;
  /** The file chosen in this dialog, uploaded when the candidate is saved. */
  file: File | null;
  error: ValidationKey | undefined;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const url = useCvUrl(customerId, cvPath);

  const clear = () => {
    // Emptied too, so choosing the same file again still fires a change.
    if (input.current) input.current.value = "";
    onClear();
  };

  return (
    <Field
      id="c-cv"
      label={t("candidateDialog.cv")}
      hint={t("candidateDialog.cvHint")}
      error={error}
    >
      {(control) => (
        <div className="space-y-2 text-sm">
          {cvPath ? (
            <p className="flex flex-wrap items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>{t("candidateDialog.cvCurrent")}</span>
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
                <a
                  className="text-primary hover:underline"
                  href={url.data}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("candidateDialog.cvOpen")}
                </a>
              ) : (
                <Button type="button" variant="link" className="h-auto p-0" disabled>
                  {t("candidateDialog.cvOpen")}
                </Button>
              )}
            </p>
          ) : (
            <p className="text-muted-foreground">{t("candidateDialog.cvNone")}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              {...control}
              ref={input}
              type="file"
              accept={CV_MIME_TYPE}
              className="peer sr-only"
              onChange={onChange}
            />
            <label
              htmlFor={control.id}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "peer-focus-visible:ring-1 peer-focus-visible:ring-ring",
              )}
            >
              <Upload aria-hidden="true" />
              {cvPath ? t("candidateDialog.cvReplace") : t("candidateDialog.cvChoose")}
            </label>
            {file && (
              <>
                <span className="min-w-0 wrap-anywhere">
                  {t("candidateDialog.cvChosen", { name: file.name })}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={clear}>
                  {t("candidateDialog.cvClear")}
                </Button>
              </>
            )}
          </div>
          {file && cvPath && (
            <p className="text-muted-foreground">{t("candidateDialog.cvReplacesOnSave")}</p>
          )}
        </div>
      )}
    </Field>
  );
}
