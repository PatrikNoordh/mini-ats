import { useNavigate } from "@tanstack/react-router";
import { KeyRound, LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useErrorToast } from "@/hooks/useErrorToast";
import { LanguageMenuItems } from "@/components/LanguageSwitcher";
import { displayName, initials } from "@/lib/profile-name";

export function UserMenu() {
  const { t } = useTranslation();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const errorToast = useErrorToast();
  const [changingPassword, setChangingPassword] = useState(false);
  if (!profile) return null;
  const name = displayName(profile);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent"
            aria-label={t("shell.userMenu")}
          >
            <span className="hidden rounded-full border px-2 py-0.5 text-xs text-muted-foreground md:inline">
              {t(`roles.${profile.role}`)}
            </span>
            <span className="hidden max-w-48 truncate text-sm font-medium md:inline">{name}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
              {initials(name)}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="font-semibold wrap-anywhere">{name}</div>
            {name !== profile.email && (
              <div className="text-xs font-normal text-muted-foreground wrap-anywhere">
                {profile.email}
              </div>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* Opened after the menu has closed, so the menu does not take the focus back. */}
          <DropdownMenuItem onSelect={() => setTimeout(() => setChangingPassword(true), 0)}>
            <KeyRound className="mr-2 h-4 w-4" /> {t("changePassword.menuItem")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <LanguageMenuItems />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              try {
                await signOut();
                navigate({ to: "/login" });
              } catch (err) {
                errorToast(t("shell.signOutFailed"), err);
              }
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> {t("shell.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog
        open={changingPassword}
        onOpenChange={setChangingPassword}
        email={user?.email ?? profile.email}
      />
    </>
  );
}
