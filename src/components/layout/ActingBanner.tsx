import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";

export function ActingBanner() {
  const { t } = useTranslation();
  const { isActingAs, customer, setCustomerId } = useActiveCustomer();
  if (!isActingAs || !customer) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/40 bg-warning-muted px-4 py-2.5 text-sm text-warning-foreground md:px-6">
      <span>
        <Trans
          i18nKey="shell.actingAs"
          values={{ company: customer.company_name }}
          components={{ bold: <strong className="font-bold" /> }}
        />
      </span>
      <Button variant="warning" size="sm" onClick={() => setCustomerId(null)}>
        {t("shell.leaveCustomer")}
      </Button>
    </div>
  );
}
