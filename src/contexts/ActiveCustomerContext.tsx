import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { useProfiles } from "@/hooks/useProfiles";
import {
  clearStoredCustomer,
  readStoredCustomer,
  storeCustomer,
} from "@/lib/active-customer-storage";
import type { Profile } from "@/types";

interface ActiveCustomerValue {
  /** Customer whose data is shown. null = admin hasn't picked one. */
  customerId: string | null;
  customer: Profile | null;
  customers: Profile[];
  /** True when an admin is acting on behalf of a customer. */
  isActingAs: boolean;
  /** True while an admin's choice from before a reload waits for the customer list. */
  isRestoring: boolean;
  setCustomerId: (id: string | null) => void;
}

const Ctx = createContext<ActiveCustomerValue | null>(null);

/** The admin's choice, and the user it belongs to. */
interface Choice {
  userId: string | null;
  customerId: string | null;
}

export function ActiveCustomerProvider({ children }: { children: ReactNode }) {
  const { profile, isLoading } = useAuth();
  const isAdmin = profile?.role === "admin";
  const userId = profile?.id ?? null;
  const profiles = useProfiles(isAdmin);
  const [choice, setChoice] = useState<Choice>({ userId: null, customerId: null });

  // Another user signed in: an admin gets back the customer chosen earlier in this tab, anyone
  // else starts with none. Done while rendering, so the chooser never flashes before it.
  if (choice.userId !== userId) {
    setChoice({ userId, customerId: isAdmin && userId ? readStoredCustomer(userId) : null });
  }
  const selected = choice.userId === userId ? choice.customerId : null;

  // Signed out, also when the session expired: the next account starts without a choice.
  useEffect(() => {
    if (!isLoading && !profile) clearStoredCustomer();
  }, [isLoading, profile]);

  // A stored customer the admin cannot see (deleted, or never valid) is dropped once the list
  // is in. While the list loads, the choice waits for it.
  const customerIds = profiles.data?.filter((p) => p.role === "customer").map((p) => p.id);
  const isStale = !!selected && !!customerIds && !customerIds.includes(selected);
  useEffect(() => {
    if (!isStale) return;
    clearStoredCustomer();
    setChoice((c) => ({ ...c, customerId: null }));
  }, [isStale]);

  const setCustomerId = useCallback(
    (id: string | null) => {
      if (!isAdmin || !userId) return;
      setChoice({ userId, customerId: id });
      if (id) storeCustomer(userId, id);
      else clearStoredCustomer();
    },
    [isAdmin, userId],
  );

  const value = useMemo<ActiveCustomerValue>(() => {
    if (!profile)
      return {
        customerId: null,
        customer: null,
        customers: [],
        isActingAs: false,
        isRestoring: false,
        setCustomerId,
      };
    if (!isAdmin)
      return {
        customerId: profile.id,
        customer: profile,
        customers: [profile],
        isActingAs: false,
        isRestoring: false,
        setCustomerId,
      };
    const customers = (profiles.data ?? []).filter((p) => p.role === "customer");
    const customer = customers.find((c) => c.id === selected) ?? null;
    return {
      customerId: customer?.id ?? null,
      customer,
      customers,
      isActingAs: !!customer,
      isRestoring: !!selected && profiles.isPending,
      setCustomerId,
    };
  }, [profile, isAdmin, profiles.data, profiles.isPending, selected, setCustomerId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveCustomer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useActiveCustomer must be used inside ActiveCustomerProvider");
  return ctx;
}
