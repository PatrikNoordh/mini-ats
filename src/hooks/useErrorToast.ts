import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { errorCode } from "@/lib/errors";

/**
 * An error toast that says what failed and why: the action as the title ("Kunde inte spara
 * jobbet.") and the error code's text below it ("Ingen internetanslutning…").
 */
export function useErrorToast() {
  const { t } = useTranslation();
  return useCallback(
    (title: string, error: unknown) =>
      toast.error(title, { description: t(`errors.${errorCode(error)}`) }),
    [t],
  );
}
