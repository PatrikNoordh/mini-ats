import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFormat } from "@/lib/format";
import type { Profile } from "@/types";

/** Active accounts, each name a button that opens the account to edit. */
export function AccountTable({
  accounts,
  onEdit,
}: {
  accounts: Profile[];
  onEdit: (account: Profile) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("accounts.name")}</TableHead>
          <TableHead className="hidden sm:table-cell">{t("accounts.email")}</TableHead>
          <TableHead>{t("accounts.role")}</TableHead>
          <TableHead className="hidden md:table-cell">{t("accounts.created")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="wrap-anywhere">
              <button
                className="text-left font-semibold text-primary hover:underline"
                aria-label={t("accounts.edit", { name: p.full_name || p.email })}
                onClick={() => onEdit(p)}
              >
                {p.full_name || p.email}
              </button>
              <div className="text-xs text-muted-foreground sm:hidden">{p.email}</div>
            </TableCell>
            <TableCell className="hidden wrap-anywhere sm:table-cell">{p.email}</TableCell>
            <TableCell>
              <Badge variant={p.role === "admin" ? "default" : "outline"}>
                {t(`roles.${p.role}`)}
              </Badge>
            </TableCell>
            <TableCell className="hidden text-sm md:table-cell">
              {format.date(p.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
