import { useTranslation } from "react-i18next";

export function Logo() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        A
      </span>
      <span className="text-lg font-bold tracking-tight">{t("app.name")}</span>
    </div>
  );
}
