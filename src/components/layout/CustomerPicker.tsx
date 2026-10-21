import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
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
  const id = useId();
  return (
    <div className="flex min-w-0 items-center gap-2">
      {/* Visible from sm, read by screen readers at every width. */}
      <Label htmlFor={id} className="sr-only font-normal text-muted-foreground sm:not-sr-only">
        {t("shell.customerLabel")}
      </Label>
      <Select value={customerId ?? ""} onValueChange={(v) => setCustomerId(v)}>
        <SelectTrigger id={id} className="h-9 w-filter-compact sm:w-filter">
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
