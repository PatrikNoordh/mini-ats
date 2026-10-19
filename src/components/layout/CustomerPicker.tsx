import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";

export function CustomerPicker() {
  const { t } = useTranslation();
  const { customers, customerId, setCustomerId } = useActiveCustomer();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="hidden text-sm text-muted-foreground sm:inline">
        {t("shell.customerLabel")}
      </span>
      <Select value={customerId ?? ""} onValueChange={(v) => setCustomerId(v)}>
        <SelectTrigger
          className="h-9 w-filter-compact sm:w-filter"
          aria-label={t("shell.chooseCustomer")}
        >
          <SelectValue placeholder={t("shell.chooseCustomerPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {customers.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.company_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
