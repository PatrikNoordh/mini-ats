import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/pipeline" });
  },
  head: () => ({
    meta: [
      { title: "Mini-ATS — rekrytering för små företag" },
      { name: "description", content: "Håll koll på jobb, kandidater och pipeline på ett ställe." },
      { property: "og:title", content: "Mini-ATS — rekrytering för små företag" },
      {
        property: "og:description",
        content: "Håll koll på jobb, kandidater och pipeline på ett ställe.",
      },
    ],
  }),
});
