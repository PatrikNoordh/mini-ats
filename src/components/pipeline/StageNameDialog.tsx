import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { useErrorToast } from "@/hooks/useErrorToast";
import { MAX_STAGE_NAME_LENGTH } from "@/lib/constants";
import { errorCode } from "@/lib/errors";
import { isValidationKey, stageNameSchema, type ValidationKey } from "@/lib/validation";

/**
 * Asks for a column name, to rename a column or add one (ATS-40). The name is checked against the
 * other columns' names on screen first; a name the database still finds taken, for example one
 * added in another tab, shows the same way.
 */
export function StageNameDialog({
  open,
  onOpenChange,
  title,
  hint,
  initialName,
  takenNames,
  failedTitle,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hint?: string | undefined;
  initialName: string;
  /** The names the other columns show. */
  takenNames: readonly string[];
  /** The error toast's title when saving fails. */
  failedTitle: string;
  /** Saves the trimmed name. The dialog closes when it resolves. */
  onSave: (name: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const errorToast = useErrorToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<ValidationKey | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError(undefined);
  }, [open, initialName]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = stageNameSchema(takenNames).safeParse(name);
    if (!parsed.success) {
      const key = parsed.error.issues[0]?.message ?? "";
      setError(isValidationKey(key) ? key : "name_required");
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      await onSave(parsed.data);
      onOpenChange(false);
    } catch (err) {
      if (errorCode(err) === "stage_name_taken") setError("stage_name_taken");
      else errorToast(failedTitle, err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field id="stage-name" label={t("stageEditor.name")} hint={hint} error={error}>
            {(control) => (
              <Input
                {...control}
                maxLength={MAX_STAGE_NAME_LENGTH}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
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
