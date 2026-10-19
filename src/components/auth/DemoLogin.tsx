import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { errorCode } from "@/lib/errors";
import type { Role } from "@/types";

// Demo shortcuts. Remove this component when real accounts exist.
// `company` is mock data (a company name); null means the admin, shown as the platform.
const DEMO: { role: Role; company: string | null; email: string }[] = [
  { role: "admin", company: null, email: "admin@demo.test" },
  { role: "customer", company: "Nordkust Bygg AB", email: "karin@nordkust.test" },
  { role: "customer", company: "Studio Lumen", email: "oskar@lumen.test" },
];

export function DemoLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="mt-6 border-t pt-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("login.demo")}
      </p>
      <div className="space-y-2">
        {DEMO.map((d) => (
          <button
            key={d.email}
            type="button"
            disabled={!!busy}
            onClick={async () => {
              setBusy(d.email);
              try {
                await signIn(d.email, "demo1234");
                onSignedIn();
              } catch (e) {
                toast.error(t(`errors.${errorCode(e)}`));
              } finally {
                setBusy(null);
              }
            }}
            className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-accent disabled:opacity-60"
          >
            <span className="text-sm font-semibold">
              {busy === d.email ? t("login.submitting") : t(`roles.${d.role}`)}
            </span>
            <span className="text-xs text-muted-foreground">
              {d.company ?? t("login.demoPlatform")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
