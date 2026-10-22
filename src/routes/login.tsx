import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";
import { errorCode } from "@/lib/errors";
import { pageHead } from "@/lib/i18n";
import { safeRedirect } from "@/lib/redirect";
import { isEmail } from "@/lib/validation";

const searchSchema = z.object({
  // The page to return to after login. Anything but a path inside the app is dropped.
  redirect: z.unknown().transform(safeRedirect),
});

export const Route = createFileRoute("/login")({
  validateSearch: (s) => searchSchema.parse(s),
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
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<LoginError | null>(null);
  const [busy, setBusy] = useState(false);

  const signedIn = !isLoading && !!user;

  // Runs on a visit while signed in and right after a successful sign-in.
  useEffect(() => {
    if (!signedIn) return;
    if (redirect) navigate({ href: redirect, replace: true });
    else navigate({ to: "/pipeline", replace: true });
  }, [signedIn, redirect, navigate]);

  if (signedIn) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError({ kind: "validation", key: "login_required" });
    if (!isEmail(email)) return setError({ kind: "validation", key: "email_invalid" });
    setBusy(true);
    try {
      await signIn(email, password);
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
          <Logo />
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
      </div>
    </div>
  );
}
