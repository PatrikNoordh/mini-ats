import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Asks, after a move to Hired, whether the candidate's other open applications should move to
 * Rejected (ATS-31). A soft prompt: one person can be hired for two roles. "Keep" has the focus
 * when it opens, so Enter never moves cards by mistake.
 */
export function RejectOthersDialog({
  name,
  stage,
  count,
  busy,
  onConfirm,
  onKeep,
}: {
  /** The candidate's name, or null when the prompt is closed. */
  name: string | null;
  /** The name of the Rejected stage the cards move to. */
  stage: string;
  count: number;
  busy: boolean;
  onConfirm: () => void;
  onKeep: () => void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={name !== null} onOpenChange={(open) => !open && !busy && onKeep()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("rejectOthers.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("rejectOthers.description", { name: name ?? "", count, stage })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("rejectOthers.keep")}</AlertDialogCancel>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {busy ? t("rejectOthers.moving") : t("rejectOthers.confirm", { stage })}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
