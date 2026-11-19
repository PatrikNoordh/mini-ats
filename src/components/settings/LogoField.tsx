import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImageField } from "@/components/settings/ImageField";
import type { ImageChange } from "@/lib/branding";
import type { ValidationKey } from "@/lib/validation";

/** The logo of the appearance settings (ATS-54), shown in the sidebar in place of the mark. */
export function LogoField(props: {
  hasLogo: boolean;
  change: ImageChange;
  error: ValidationKey | null;
  onChoose: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const { hasLogo, ...rest } = props;
  return (
    <ImageField
      id="logo"
      hasImage={hasLogo}
      text={{
        label: t("appearance.logo"),
        hint: t("appearance.logoHint"),
        none: t("appearance.logoNone"),
        current: t("appearance.logoCurrent"),
        choose: t("appearance.logoChoose"),
        replace: t("appearance.logoReplace"),
        remove: t("appearance.logoRemove"),
        removedOnSave: t("appearance.logoRemovedOnSave"),
      }}
      {...rest}
    />
  );
}
