import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** The columns of a board and the cards in them, as in docs/brand/mark.svg. */
const COLUMNS_X = [10, 25, 40];
const CARDS: [number, number][] = [
  [12.5, 14.5],
  [12.5, 24],
  [12.5, 33.5],
  [27.5, 14.5],
  [27.5, 24],
  [42.5, 14.5],
];

/** The Mini-ATS mark in theme colours. Decorative: the product name is shown next to it. */
function Mark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className="h-8 w-8 shrink-0">
      <rect width="64" height="64" rx="14" className="fill-primary" />
      {COLUMNS_X.map((x) => (
        <rect
          key={x}
          x={x}
          y="11"
          width="14"
          height="42"
          rx="4"
          className="fill-primary-foreground/15"
        />
      ))}
      {CARDS.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="9"
          height="7"
          rx="2"
          className="fill-primary-foreground"
        />
      ))}
    </svg>
  );
}

/** A company's own logo (ATS-54): a link to the image, and the company's name as its alt text. */
export interface LogoImage {
  src: string;
  alt: string;
}

/**
 * A company's logo in place of the mark, as large as the mark is tall. An image that cannot be
 * loaded, such as a file already removed, shows the Mini-ATS mark instead.
 */
function CompanyLogo({ image }: { image: LogoImage }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Mark />;
  return (
    <img
      src={image.src}
      alt={image.alt}
      className="h-8 w-auto max-w-logo shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

/** The product's name, next to the Mini-ATS mark or a company's own logo. */
export function Logo({ className, image }: { className?: string; image?: LogoImage | null }) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {image ? <CompanyLogo key={image.src} image={image} /> : <Mark />}
      <span className="text-lg font-bold tracking-tight">{t("app.name")}</span>
    </div>
  );
}
