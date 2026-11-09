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
import { useCompanies, useCompany } from "@/hooks/useCompanies";
import {
  clearStoredCustomer,
  readStoredCustomer,
  storeCustomer,
} from "@/lib/active-customer-storage";
import { isActive } from "@/lib/accounts";
import type { Company } from "@/types";

/**
 * The active customer is a company (ATS-45). A customer user's is always their own company; an
 * admin belongs to none and picks one among the active companies.
 */
interface ActiveCustomerValue {
  /** The company whose data is shown. null = an admin hasn't picked one. */
  customerId: string | null;
  /** That company, once loaded. */
  customer: Company | null;
  customers: Company[];
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
  const { profile, isLoading, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";
  const userId = profile?.id ?? null;
  const companies = useCompanies(isAdmin);
  // A customer user's own company. Sign-in already refused a user without one (hasNoCompany).
  const ownCompanyId = !isAdmin ? (profile?.company_id ?? null) : null;
  const ownCompany = useCompany(ownCompanyId);
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

  // The company was deleted, or the user removed from it, while signed in: RLS no longer shows it.
  // Without an active company the user sees nothing, so they are signed out.
  const lostCompany = !!ownCompanyId && ownCompany.isSuccess && ownCompany.data === null;
  useEffect(() => {
    if (lostCompany) void signOut().catch(() => {});
  }, [lostCompany, signOut]);

  // A stored company the admin cannot pick (deleted, or never valid) is dropped once the list is
  // in. While the list loads, the choice waits for it. A choice stored before ATS-45 is a customer's
  // profile id, which is their company's id, so it still works.
  const customerIds = companies.data?.filter(isActive).map((c) => c.id);
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
    if (!isAdmin) {
      const customer = ownCompany.data ?? null;
      return {
        customerId: ownCompanyId,
        customer,
        customers: customer ? [customer] : [],
        isActingAs: false,
        isRestoring: false,
        setCustomerId,
      };
    }
    const customers = (companies.data ?? []).filter(isActive);
    const customer = customers.find((c) => c.id === selected) ?? null;
    return {
      customerId: customer?.id ?? null,
      customer,
      customers,
      isActingAs: !!customer,
      isRestoring: !!selected && companies.isPending,
      setCustomerId,
    };
  }, [
    profile,
    isAdmin,
    ownCompanyId,
    ownCompany.data,
    companies.data,
    companies.isPending,
    selected,
    setCustomerId,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveCustomer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useActiveCustomer must be used inside ActiveCustomerProvider");
  return ctx;
}
