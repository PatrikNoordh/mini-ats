import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageMenuItems } from "@/components/LanguageSwitcher";
import { AVATAR_INITIALS } from "@/lib/constants";

export function UserMenu() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  if (!profile) return null;
  const initials = profile.full_name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, AVATAR_INITIALS)
    .toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent"
          aria-label={t("shell.userMenu")}
        >
          <span className="hidden rounded-full border px-2 py-0.5 text-xs text-muted-foreground md:inline">
            {t(`roles.${profile.role}`)}
          </span>
          <span className="hidden text-sm font-medium md:inline">{profile.full_name}</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
            {initials}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-semibold">{profile.full_name}</div>
          <div className="text-xs font-normal text-muted-foreground">{profile.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <LanguageMenuItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> {t("shell.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
