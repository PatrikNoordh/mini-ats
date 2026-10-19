import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { DemoLogin } from "@/components/auth/DemoLogin";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { errorCode } from "@/lib/errors";
import { pageHead } from "@/lib/i18n";
import { isEmail } from "@/lib/validation";

export const Route = createFileRoute("/login")({
  head: ({ match }) => pageHead(match.context.language, "login"),
  component: LoginPage,
});

type LoginError =
  | { kind: "validation"; key: "login_required" | "email_invalid" }
  | { kind: "error"; code: ReturnType<typeof errorCode> };

function LoginPage() {
  const { t } = useTranslation();
  const { user, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginError | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLoading && user) return <Navigate to="/pipeline" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError({ kind: "validation", key: "login_required" });
    if (!isEmail(email)) return setError({ kind: "validation", key: "email_invalid" });
    setBusy(true);
    try {
      await signIn(email, password);
      navigate({ to: "/pipeline" });
    } catch (err) {
      setError({ kind: "error", code: errorCode(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              A
            </span>
            <span className="text-lg font-bold">{t("app.name")}</span>
          </div>
          <LanguageSwitcher />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t("login.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("login.subtitle")}</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("login.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t("login.emailPlaceholder")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("login.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.kind === "validation"
                ? t(`validation.${error.key}`)
                : t(`errors.${error.code}`)}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? t("login.submitting") : t("login.submit")}
          </Button>
        </form>
        <DemoLogin onSignedIn={() => navigate({ to: "/pipeline" })} />
      </div>
    </div>
  );
}
