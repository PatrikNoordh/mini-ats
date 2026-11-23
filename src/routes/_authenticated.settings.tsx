import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CustomerGate } from "@/components/layout/CustomerGate";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { PageHeader } from "@/components/States";
import { pageHead } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/settings")({
  head: ({ match }) => pageHead(match.context.language, "settings"),
  component: () => <CustomerGate>{(id) => <Settings customerId={id} />}</CustomerGate>,
});

/** The customer's settings (ATS-54). Appearance is the only section so far. */
function Settings({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("settings.title")} inBar={false} />
      <AppearanceSettings customerId={customerId} />
    </div>
  );
}
