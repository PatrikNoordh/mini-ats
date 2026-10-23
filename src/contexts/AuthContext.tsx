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
  sessionIsGone,
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
  /**
   * Signs out on this device if Auth says the session was ended elsewhere. Never throws. Runs by
   * itself on sign-in and when the tab is shown; the app also runs it on every page change.
   */
  checkSession: () => Promise<void>;
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
      const user = await signInWithPassword(email, password);
      // Without a profile there is no role, so the session must not survive to a reload.
      const profile = await resolveUser(user).catch(async (error: unknown) => {
        await signOutUser().catch(() => {});
        throw error;
      });
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

  // A session ended elsewhere (a password change signs out the other devices) still has a valid
  // access token here until it expires. So ask Auth, and sign out on this device if the session is
  // gone (ATS-34, AC5). A check that fails, for example offline, leaves the user signed in.
  const checkSession = useCallback(async () => {
    if (!committed.current) return;
    try {
      if (await sessionIsGone()) await signOut();
    } catch {
      // Ignored on purpose; the next check, or the token's own expiry, signs the user out.
    }
  }, [signOut]);

  // When a user is signed in, and each time the tab is shown again.
  const userId = state?.user.id ?? null;
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkSession();
    };
    void checkSession();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId, checkSession]);

  const value = useMemo<AuthValue>(
    () => ({
      user: state?.user ?? null,
      profile: state?.profile ?? null,
      role: state?.profile.role ?? null,
      isLoading: state === undefined,
      signIn,
      signOut,
      checkSession,
    }),
    [state, signIn, signOut, checkSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
