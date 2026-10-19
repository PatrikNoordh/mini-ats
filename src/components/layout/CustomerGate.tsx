import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";
import { useJobs } from "@/hooks/useJobs";
import type { Profile } from "@/types";

function CustomerCard({ customer, onPick }: { customer: Profile; onPick: () => void }) {
  const { t } = useTranslation();
  const { data } = useJobs(customer.id);
  const open = data?.filter((j) => j.status === "open").length;
  return (
    <button
      onClick={onPick}
      className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
    >
      <div className="font-semibold">{customer.company_name}</div>
      <div className="text-sm text-muted-foreground">
        {open === undefined ? "…" : t("gate.openJobs", { count: open })}
      </div>
    </button>
  );
}

/** Renders children only when there is an active customer; otherwise shows the admin chooser. */
export function CustomerGate({ children }: { children: (customerId: string) => ReactNode }) {
  const { t } = useTranslation();
  const { customerId, customers, setCustomerId } = useActiveCustomer();
  if (customerId) return <>{children(customerId)}</>;
  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-dashed bg-card p-6 text-center md:p-8">
      <h2 className="text-lg font-bold">{t("gate.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("gate.description")}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {customers.map((c) => (
          <CustomerCard key={c.id} customer={c} onPick={() => setCustomerId(c.id)} />
        ))}
      </div>
    </div>
  );
}
