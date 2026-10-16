import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { useProfiles } from "@/hooks/useProfiles";
import type { Profile } from "@/types";

interface ActiveCustomerValue {
  /** Customer whose data is shown. null = admin hasn't picked one. */
  customerId: string | null;
  customer: Profile | null;
  customers: Profile[];
  /** True when an admin is acting on behalf of a customer. */
  isActingAs: boolean;
  setCustomerId: (id: string | null) => void;
}

const Ctx = createContext<ActiveCustomerValue | null>(null);

export function ActiveCustomerProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [selected, setSelected] = useState<string | null>(null);
  const { data: profiles = [] } = useProfiles(isAdmin);

  // Reset admin selection whenever the signed-in user changes.
  useEffect(() => setSelected(null), [profile?.id]);

  const value = useMemo<ActiveCustomerValue>(() => {
    const customers = profiles.filter((p) => p.role === "customer");
    if (!profile)
      return {
        customerId: null,
        customer: null,
        customers: [],
        isActingAs: false,
        setCustomerId: setSelected,
      };
    if (!isAdmin)
      return {
        customerId: profile.id,
        customer: profile,
        customers: [profile],
        isActingAs: false,
        setCustomerId: () => {},
      };
    const customer = customers.find((c) => c.id === selected) ?? null;
    return {
      customerId: customer?.id ?? null,
      customer,
      customers,
      isActingAs: !!customer,
      setCustomerId: setSelected,
    };
  }, [profile, isAdmin, profiles, selected]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveCustomer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useActiveCustomer must be used inside ActiveCustomerProvider");
  return ctx;
}
