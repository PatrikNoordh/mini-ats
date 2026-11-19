import type { CompanyBackground } from "@/hooks/useCompanyBackground";
import { cn } from "@/lib/utils";

/**
 * A company's background image behind the main area (ATS-55), with a scrim of the page background
 * at the chosen dim level over it. It covers the area and is cropped to the centre; from md up it
 * stays put while the page scrolls, and on a phone it scrolls with the page, which is cheaper.
 * Decoration only, so screen readers skip it. The link is a runtime value, so it is a style.
 * `pinned` is off for the settings page's small preview, which scrolls as one box.
 */
export function PageBackground({
  background,
  pinned = true,
}: {
  background: CompanyBackground;
  pinned?: boolean;
}) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div
        className={cn("absolute inset-0 bg-cover bg-center", pinned && "md:bg-fixed")}
        style={{ backgroundImage: `url(${JSON.stringify(background.url)})` }}
      />
      <div className="background-scrim absolute inset-0" data-dim={background.dim} />
    </div>
  );
}
