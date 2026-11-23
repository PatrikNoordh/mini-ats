import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div className="solid-on-image space-y-2 rounded-lg p-4" aria-label={t("common.loading")}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="solid-on-image flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center"
    >
      <p className="text-sm text-destructive">{message ?? t("common.loadError")}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="solid-on-image flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/**
 * A page's title, with an optional count beside it, an action on the right and a hint below. With
 * a background image its title and hint sit on frosted chips (ATS-66), so no text is on the bare
 * image; the action is a solid button of its own.
 */
export function PageHeader({
  title,
  meta,
  action,
  hint,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="chip-on-image flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
        </div>
        {action}
      </div>
      {hint && <p className="chip-on-image mt-2 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
