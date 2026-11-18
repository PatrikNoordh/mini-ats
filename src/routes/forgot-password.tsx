import { createFileRoute, redirect } from "@tanstack/react-router";
import { ForgotPassword } from "@/components/auth/ForgotPassword";
import { EMAIL_ENABLED } from "@/lib/features";
import { pageHead } from "@/lib/i18n";

export const Route = createFileRoute("/forgot-password")({
  // Without email the reset link could never arrive, so the page is not offered (ATS-51 AC4).
  beforeLoad: () => {
    if (!EMAIL_ENABLED) throw redirect({ to: "/login" });
  },
  head: ({ match }) => pageHead(match.context.language, "forgotPassword"),
  component: ForgotPassword,
});
