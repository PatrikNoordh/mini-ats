import { useTranslation } from "react-i18next";
import { AppearanceForm } from "@/components/settings/AppearanceForm";
import { ErrorState, LoadingRows } from "@/components/States";
import { useActiveCustomer } from "@/contexts/ActiveCustomerContext";
import { useBranding } from "@/hooks/useBranding";

/**
 * Settings → Appearance (ATS-54), for a customer and for an admin acting for one: the company's
 * colour and logo. The form mounts again from the saved theme after every save or reset.
 */
export function AppearanceSettings({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { customer } = useActiveCustomer();
  const branding = useBranding(customerId);
  const companyName = customer?.name ?? "";

  return (
    <section aria-labelledby="appearance-title" className="space-y-4">
      <div className="space-y-1">
        <h2 id="appearance-title" className="chip-on-image text-lg font-semibold">
          {t("appearance.title")}
        </h2>
        <p className="chip-on-image text-sm text-muted-foreground">
          {t("appearance.hint", { company: companyName })}
        </p>
      </div>
      {branding.isPending ? (
        <LoadingRows rows={3} />
      ) : branding.isError ? (
        <ErrorState message={t("appearance.loadFailed")} onRetry={() => branding.refetch()} />
      ) : (
        <AppearanceForm
          key={branding.data?.updated_at ?? "none"}
          customerId={customerId}
          companyName={companyName}
          branding={branding.data}
        />
      )}
    </section>
  );
}
