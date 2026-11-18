import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Logo } from "@/components/layout/Logo";

/** The card the pages outside the app are laid out in: sign in, reset and invite (ATS-51). */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Logo />
          <LanguageSwitcher />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {children}
      </div>
    </div>
  );
}
