import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

// Demo shortcuts. Remove this component when real accounts exist.
const DEMO = [
  { label: "Admin", sub: "Plattformen", email: "admin@demo.test" },
  { label: "Kund", sub: "Nordkust Bygg AB", email: "karin@nordkust.test" },
  { label: "Kund", sub: "Studio Lumen", email: "oskar@lumen.test" },
];

export function DemoLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="mt-6 border-t pt-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Demo
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
                toast.error((e as Error).message);
              } finally {
                setBusy(null);
              }
            }}
            className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-accent disabled:opacity-60"
          >
            <span className="text-sm font-semibold">
              {busy === d.email ? "Loggar in…" : d.label}
            </span>
            <span className="text-xs text-muted-foreground">{d.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
