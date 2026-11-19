import { KanbanSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Logo, type LogoImage } from "@/components/layout/Logo";
import { buttonVariants } from "@/components/ui/button";
import { themeTokens } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * A small copy of the app with the choices not yet saved (ATS-54): the menu with the logo and an
 * active item, a primary button and a link. The draft's tokens are set on this box only, so the
 * rest of the page keeps the saved theme until the customer saves. It only shows, so it is hidden
 * from screen readers and holds nothing to focus.
 */
export function ThemePreview({ accent, logo }: { accent: string | null; logo: LogoImage | null }) {
  const { t } = useTranslation();
  // The theme's own tokens, or the Mini-ATS ones put back over the saved theme.
  const tokens = themeTokens(accent);
  return (
    <section aria-labelledby="preview-title" className="space-y-2">
      <h2 id="preview-title" className="text-sm font-medium">
        {t("appearance.preview")}
      </h2>
      <p className="text-xs text-muted-foreground">{t("appearance.previewHint")}</p>
      <div
        aria-hidden="true"
        className={cn(
          "flex overflow-hidden rounded-lg border bg-background",
          !tokens && "theme-mini-ats",
        )}
        style={tokens ?? undefined}
      >
        <div className="w-44 shrink-0 space-y-3 border-r bg-sidebar p-3 text-sidebar-foreground">
          <Logo image={logo} />
          <div className="flex items-center gap-2 rounded-md bg-sidebar-accent px-2 py-2 text-sm font-medium text-primary-text">
            <KanbanSquare className="h-4 w-4" />
            {t("nav.pipeline")}
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-4">
          <span className={buttonVariants({ size: "sm" })}>{t("jobs.new")}</span>
          <p className="text-sm text-primary-text underline">{t("appearance.previewLink")}</p>
        </div>
      </div>
    </section>
  );
}
