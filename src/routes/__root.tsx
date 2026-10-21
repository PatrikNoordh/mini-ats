import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { NotFoundPage } from "@/components/errors/NotFoundPage";
import { RouteErrorPage } from "@/components/errors/RouteErrorPage";
import { AuthProvider } from "@/contexts/AuthContext";
import { ActiveCustomerProvider } from "@/contexts/ActiveCustomerContext";
import { detectLanguage } from "@/lib/detect-language";
import { getI18n, getT } from "@/lib/i18n";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // The language comes from the cookie, so the server renders the right one without a flash.
  beforeLoad: () => ({ language: detectLanguage() }),
  head: ({ match }) => {
    const t = getT(match.context.language);
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: t("app.name") },
        { name: "description", content: t("app.description") },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
});

function RootShell({ children }: { children: ReactNode }) {
  const { language } = Route.useRouteContext();
  return (
    <html lang={language}>
      <head>
        <HeadContent />
      </head>
      <body>
        <I18nextProvider i18n={getI18n(language)}>{children}</I18nextProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ActiveCustomerProvider>
          <Outlet />
          {/* Top center stays clear of the side panel and of dialog buttons, which sit at the bottom. */}
          <Toaster richColors position="top-center" />
        </ActiveCustomerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
