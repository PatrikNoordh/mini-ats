import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Asks before a delete. Cancel has the focus when it opens, so Enter does not delete by mistake.
 * While the delete runs, the button is disabled and the dialog stays open. With `typeToConfirm`,
 * the button stays disabled until that text is typed (for deletes that cannot be undone).
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  busy,
  onConfirm,
  confirmLabel,
  typeToConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => void;
  /** The button's text, "Ta bort" by default. */
  confirmLabel?: string | undefined;
  /** Text the user must type, and the label that asks for it. */
  typeToConfirm?: { text: string; label: string } | undefined;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const confirmed = !typeToConfirm || typed.trim() === typeToConfirm.text;
  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {typeToConfirm && (
          <div className="space-y-1.5">
            <Label htmlFor={inputId}>{typeToConfirm.label}</Label>
            <Input
              id={inputId}
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
          <Button variant="destructive" disabled={busy || !confirmed} onClick={onConfirm}>
            {busy ? t("common.deleting") : (confirmLabel ?? t("common.delete"))}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
