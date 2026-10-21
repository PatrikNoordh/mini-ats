import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/States";
import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";
import { CHOOSER_LOADING_CARDS } from "@/lib/constants";
import { useOpenJobCounts, useProfiles } from "@/hooks/useProfiles";
import type { Profile } from "@/types";

function CustomerCard({
  customer,
  openJobs,
  countsLoading,
  onPick,
}: {
  customer: Profile;
  /** undefined while the counts load or after they failed. */
  openJobs: number | undefined;
  countsLoading: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onPick}
      className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="font-semibold">{customer.company_name}</div>
      <div className="text-sm text-muted-foreground">
        {openJobs !== undefined ? (
          t("gate.openJobs", { count: openJobs })
        ) : countsLoading ? (
          <Skeleton className="mt-1 h-4 w-24" aria-label={t("common.loading")} />
        ) : (
          t("gate.countUnavailable")
        )}
      </div>
    </button>
  );
}

/** The admin's list of customers to act for, with each one's number of open jobs. */
function CustomerChooser() {
  const { t } = useTranslation();
  const { customers, setCustomerId } = useActiveCustomer();
  const profiles = useProfiles();
  const counts = useOpenJobCounts();

  if (profiles.isError) return <ErrorState onRetry={() => profiles.refetch()} />;
  if (profiles.isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-label={t("common.loading")}>
        {Array.from({ length: CHOOSER_LOADING_CARDS }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }
  if (customers.length === 0) {
    return (
      <EmptyState title={t("gate.empty")}>
        <Button variant="link" asChild>
          <Link to="/admin/accounts">{t("gate.createCustomer")}</Link>
        </Button>
      </EmptyState>
    );
  }
  return (
    <>
      {counts.isError && (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-center gap-2 text-sm text-destructive"
        >
          {t("gate.countsFailed")}
          <Button variant="outline" size="sm" onClick={() => counts.refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {customers.map((c) => (
          <CustomerCard
            key={c.id}
            customer={c}
            openJobs={counts.data?.get(c.id)}
            countsLoading={counts.isLoading}
            onPick={() => setCustomerId(c.id)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * Renders children only when there is an active customer; otherwise shows the admin chooser.
 * The page remounts when the customer changes, so no state from the previous customer (an open
 * panel, a half-filled dialog) carries over.
 */
export function CustomerGate({ children }: { children: (customerId: string) => ReactNode }) {
  const { t } = useTranslation();
  const { customerId } = useActiveCustomer();
  if (customerId) return <Fragment key={customerId}>{children(customerId)}</Fragment>;
  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-dashed bg-card p-6 text-center md:p-8">
      <h2 className="text-lg font-bold">{t("gate.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("gate.description")}</p>
      <div className="mt-6">
        <CustomerChooser />
      </div>
    </div>
  );
}
