import { createFileRoute, redirect } from "@tanstack/react-router";
import { pageHead } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/pipeline" });
  },
  head: ({ match }) => pageHead(match.context.language, "home"),
});
