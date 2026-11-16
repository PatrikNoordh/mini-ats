import { useTranslation } from "react-i18next";
import { EmptyState, ErrorState, LoadingRows } from "@/components/States";
import { HISTORY_LIMIT } from "@/lib/constants";
import { useFormat } from "@/lib/format";

/** One line of a history: what happened, who or where, and when. */
export interface HistoryItem {
  id: number;
  text: string;
  detail: string;
  at: string;
}

/**
 * A history, newest first, with its loading, empty and error states (ATS-48). Says so when the
 * list stops at HISTORY_LIMIT events.
 */
export function HistoryList({
  items,
  isLoading,
  isError,
  onRetry,
}: {
  items: readonly HistoryItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  if (isLoading) return <LoadingRows rows={4} />;
  if (isError) return <ErrorState onRetry={onRetry} />;
  if (items.length === 0) {
    return <EmptyState title={t("history.empty")}>{t("history.emptyHint")}</EmptyState>;
  }
  return (
    <div>
      <ol className="divide-y">
        {items.map((item) => (
          <li key={item.id} className="py-3">
            <p className="text-sm font-medium wrap-anywhere">{item.text}</p>
            <p className="mt-0.5 text-xs text-muted-foreground wrap-anywhere">
              <time dateTime={item.at}>{format.dateTime(item.at)}</time> · {item.detail}
            </p>
          </li>
        ))}
      </ol>
      {items.length >= HISTORY_LIMIT && (
        <p className="pt-3 text-xs text-muted-foreground">
          {t("history.truncated", { count: HISTORY_LIMIT })}
        </p>
      )}
    </div>
  );
}
