import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getProfile, verifyCredentials } from "@/lib/api/profiles";
import type { Profile, Role } from "@/types";

// Mock auth. Replaced by Supabase Auth later — keep the useAuth() contract stable.

interface AuthUser {
  id: string;
  email: string;
}

interface AuthValue {
  user: AuthUser | null;
  profile: Profile | null;
  role: Role | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const SESSION_KEY = "mini-ats-mock-session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    const id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      setLoading(false);
      return;
    }
    getProfile(id)
      .then(setProfile)
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const p = await verifyCredentials(email, password);
      if (!p) throw new Error("Fel e-post eller lösenord.");
      qc.clear();
      window.localStorage.setItem(SESSION_KEY, p.id);
      setProfile(p);
      return p;
    },
    [qc],
  );

  const signOut = useCallback(async () => {
    window.localStorage.removeItem(SESSION_KEY);
    qc.clear();
    setProfile(null);
  }, [qc]);

  const value = useMemo<AuthValue>(
    () => ({
      user: profile ? { id: profile.id, email: profile.email } : null,
      profile,
      role: profile?.role ?? null,
      isLoading,
      signIn,
      signOut,
    }),
    [profile, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
