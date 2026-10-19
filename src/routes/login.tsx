import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { DemoLogin } from "@/components/auth/DemoLogin";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Logga in — Mini-ATS" },
      { name: "description", content: "Logga in på Mini-ATS för att hantera jobb och kandidater." },
      { property: "og:title", content: "Logga in — Mini-ATS" },
      {
        property: "og:description",
        content: "Logga in på Mini-ATS för att hantera jobb och kandidater.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, isLoading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLoading && user) return <Navigate to="/pipeline" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) return setError("Fyll i både e-post och lösenord.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Ange en giltig e-postadress.");
    setBusy(true);
    try {
      await signIn(email, password);
      navigate({ to: "/pipeline" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            A
          </span>
          <span className="text-lg font-bold">Mini-ATS</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Logga in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Konton skapas av en administratör.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-post</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="namn@foretag.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Lösenord</Label>
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
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? "Loggar in…" : "Logga in"}
          </Button>
        </form>
        <DemoLogin onSignedIn={() => navigate({ to: "/pipeline" })} />
      </div>
    </div>
  );
}
