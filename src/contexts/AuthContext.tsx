import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  onAuthUserChange,
  signInWithPassword,
  signOut as signOutUser,
  type AuthUser,
} from "@/lib/api/auth";
import { getProfile } from "@/lib/api/profiles";
import { AppError } from "@/lib/errors";
import type { Profile, Role } from "@/types";

interface AuthValue {
  user: AuthUser | null;
  profile: Profile | null;
  role: Role | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signOut: () => Promise<void>;
}

/** A signed-in user always comes with their profile, which holds the role. */
type AuthState = { user: AuthUser; profile: Profile } | null;

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  // undefined until the browser has read the session. The server always renders the loading state.
  const [state, setState] = useState<AuthState | undefined>(undefined);
  const committed = useRef<AuthState | undefined>(undefined);
  const inflight = useRef<{ userId: string; profile: Promise<Profile | null> } | null>(null);

  const commit = useCallback(
    (next: AuthState) => {
      // A different user, or none, must never see the previous user's cached data.
      if ((committed.current?.user.id ?? null) !== (next?.user.id ?? null)) qc.clear();
      committed.current = next;
      setState(next);
    },
    [qc],
  );

  /** Loads the profile for `user` once, however many sign-in events arrive for them. */
  const resolveUser = useCallback(
    (user: AuthUser | null): Promise<Profile | null> => {
      if (!user) {
        inflight.current = null;
        commit(null);
        return Promise.resolve(null);
      }
      if (committed.current?.user.id === user.id) return Promise.resolve(committed.current.profile);
      if (inflight.current?.userId === user.id) return inflight.current.profile;

      const profile = getProfile(user.id).then(
        (loaded) => {
          // A newer sign-in or sign-out has taken over: drop this result.
          if (inflight.current?.profile !== profile) return loaded;
          inflight.current = null;
          commit(loaded ? { user, profile: loaded } : null);
          return loaded;
        },
        (error: unknown) => {
          if (inflight.current?.profile === profile) {
            inflight.current = null;
            commit(null);
          }
          throw error;
        },
      );
      inflight.current = { userId: user.id, profile };
      return profile;
    },
    [commit],
  );

  useEffect(
    () =>
      onAuthUserChange((user) => {
        // A failed profile load leaves the app signed out, so the login page shows.
        resolveUser(user).catch(() => {});
      }),
    [resolveUser],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const profile = await resolveUser(await signInWithPassword(email, password));
      if (!profile) {
        await signOutUser().catch(() => {});
        throw new AppError("profile_not_found");
      }
      return profile;
    },
    [resolveUser],
  );

  const signOut = useCallback(async () => {
    await signOutUser();
    await resolveUser(null);
  }, [resolveUser]);

  const value = useMemo<AuthValue>(
    () => ({
      user: state?.user ?? null,
      profile: state?.profile ?? null,
      role: state?.profile.role ?? null,
      isLoading: state === undefined,
      signIn,
      signOut,
    }),
    [state, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
