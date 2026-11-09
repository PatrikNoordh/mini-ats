import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveCustomerProvider, useActiveCustomer } from "@/contexts/ActiveCustomerContext";
import { ACTIVE_CUSTOMER_STORAGE_KEY } from "@/lib/active-customer-storage";
import type { Company, Profile } from "@/types";

function company(id: string): Company {
  return { id, name: `${id} AB`, created_at: "2026-10-01T08:00:00Z", deleted_at: null };
}

function account(id: string, role: Profile["role"], companyId: string | null = null): Profile {
  return {
    id,
    role,
    full_name: id,
    company_id: companyId,
    company_name: companyId ? `${companyId} AB` : "",
    email: `${id}@test.local`,
    created_at: "2026-10-01T08:00:00Z",
    deleted_at: null,
  };
}

const nordkust = company("nordkust");
const lumen = company("lumen");
const admin = account("admin", "admin");
const otherAdmin = account("admin2", "admin");
// Since ATS-45 a user's id is never their company's.
const nordkustFirst = account("nordkust-user-1", "customer", nordkust.id);
const nordkustSecond = account("nordkust-user-2", "customer", nordkust.id);

interface Query<T> {
  data: T | undefined;
  isPending: boolean;
  isSuccess: boolean;
}
const loaded = <T,>(data: T): Query<T> => ({ data, isPending: false, isSuccess: true });
const pending = <T,>(): Query<T> => ({ data: undefined, isPending: true, isSuccess: false });

const state = vi.hoisted(() => ({
  auth: { profile: null as Profile | null, isLoading: false, signOut: vi.fn() },
  companies: { data: undefined, isPending: true, isSuccess: false } as Query<Company[]>,
  company: { data: undefined, isPending: true, isSuccess: false } as Query<Company | null>,
  companyIds: [] as (string | null)[],
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("@/hooks/useCompanies", () => ({
  useCompanies: () => state.companies,
  useCompany: (id: string | null) => {
    state.companyIds.push(id);
    return id ? state.company : pending();
  },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <ActiveCustomerProvider>{children}</ActiveCustomerProvider>
);
const renderActive = () => renderHook(() => useActiveCustomer(), { wrapper });

const signIn = (profile: Profile | null) =>
  (state.auth = { profile, isLoading: false, signOut: state.auth.signOut });
const listLoaded = (...companies: Company[]) => (state.companies = loaded(companies));
const stored = () => sessionStorage.getItem(ACTIVE_CUSTOMER_STORAGE_KEY);

describe("the admin's chosen customer", () => {
  beforeEach(() => {
    sessionStorage.clear();
    signIn(admin);
    listLoaded(nordkust, lumen);
  });
  afterEach(() => vi.restoreAllMocks());

  it("survives a remount of the provider, as after a reload", () => {
    const first = renderActive();
    act(() => first.result.current.setCustomerId(nordkust.id));
    expect(first.result.current.customerId).toBe(nordkust.id);
    first.unmount();

    const second = renderActive();
    expect(second.result.current.customerId).toBe(nordkust.id);
    expect(second.result.current.isActingAs).toBe(true);
  });

  it("waits for the company list instead of dropping the stored choice", () => {
    sessionStorage.setItem(
      ACTIVE_CUSTOMER_STORAGE_KEY,
      JSON.stringify({ userId: admin.id, customerId: lumen.id }),
    );
    state.companies = pending();
    const view = renderActive();
    expect(view.result.current.customerId).toBeNull();
    expect(view.result.current.isRestoring).toBe(true);

    listLoaded(nordkust, lumen);
    view.rerender();
    expect(view.result.current.customerId).toBe(lumen.id);
    expect(view.result.current.isRestoring).toBe(false);
  });

  it("ignores and removes a stored id that is not one of the companies", () => {
    sessionStorage.setItem(
      ACTIVE_CUSTOMER_STORAGE_KEY,
      JSON.stringify({ userId: admin.id, customerId: "deleted-customer" }),
    );
    const view = renderActive();
    expect(view.result.current.customerId).toBeNull();
    expect(view.result.current.isRestoring).toBe(false);
    expect(stored()).toBeNull();
  });

  it("ignores stored text that is not a choice", () => {
    sessionStorage.setItem(ACTIVE_CUSTOMER_STORAGE_KEY, "{not json");
    expect(renderActive().result.current.customerId).toBeNull();
  });

  it("forgets the choice when the admin leaves customer mode", () => {
    const view = renderActive();
    act(() => view.result.current.setCustomerId(nordkust.id));
    act(() => view.result.current.setCustomerId(null));
    expect(stored()).toBeNull();
  });

  it("clears the choice on logout", () => {
    const view = renderActive();
    act(() => view.result.current.setCustomerId(nordkust.id));
    signIn(null);
    view.rerender();
    expect(view.result.current.customerId).toBeNull();
    expect(stored()).toBeNull();
  });

  it("never hands one admin's choice to another account on the same tab", () => {
    const view = renderActive();
    act(() => view.result.current.setCustomerId(nordkust.id));
    signIn(otherAdmin);
    listLoaded(nordkust, lumen);
    view.rerender();
    expect(view.result.current.customerId).toBeNull();
  });

  it("keeps the choice while auth is still loading after a reload", () => {
    sessionStorage.setItem(
      ACTIVE_CUSTOMER_STORAGE_KEY,
      JSON.stringify({ userId: admin.id, customerId: nordkust.id }),
    );
    state.auth = { profile: null, isLoading: true, signOut: state.auth.signOut };
    const view = renderActive();
    expect(stored()).not.toBeNull();
    signIn(admin);
    view.rerender();
    expect(view.result.current.customerId).toBe(nordkust.id);
  });

  it("still works when storage is blocked, without remembering", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const view = renderActive();
    act(() => view.result.current.setCustomerId(lumen.id));
    expect(view.result.current.customerId).toBe(lumen.id);
    view.unmount();
    expect(renderActive().result.current.customerId).toBeNull();
  });
});

describe("a customer user", () => {
  beforeEach(() => {
    sessionStorage.clear();
    state.companyIds = [];
    state.auth.signOut = vi.fn().mockResolvedValue(undefined);
    state.company = loaded(nordkust);
  });
  afterEach(() => vi.restoreAllMocks());

  it("acts for their company, never their own id, and never reads or writes the stored choice", () => {
    sessionStorage.setItem(
      ACTIVE_CUSTOMER_STORAGE_KEY,
      JSON.stringify({ userId: nordkustFirst.id, customerId: lumen.id }),
    );
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    signIn(nordkustFirst);
    const view = renderActive();
    act(() => view.result.current.setCustomerId(lumen.id));
    expect(view.result.current.customerId).toBe(nordkust.id);
    expect(view.result.current.customer).toEqual(nordkust);
    expect(view.result.current.customers).toEqual([nordkust]);
    expect(view.result.current.isActingAs).toBe(false);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("gives a second member of the same company the same company", () => {
    signIn(nordkustSecond);
    const view = renderActive();
    expect(view.result.current.customerId).toBe(nordkust.id);
    expect(state.companyIds).toContain(nordkust.id);
  });

  it("has the company id at once, while the company's name loads", () => {
    state.company = pending();
    signIn(nordkustFirst);
    const view = renderActive();
    expect(view.result.current.customerId).toBe(nordkust.id);
    expect(view.result.current.customer).toBeNull();
    expect(state.auth.signOut).not.toHaveBeenCalled();
  });

  it("is signed out when their company is no longer active", () => {
    state.company = loaded(null);
    signIn(nordkustFirst);
    renderActive();
    expect(state.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it("never asks for the company list, which is the admin's", () => {
    state.companies = loaded([nordkust, lumen]);
    signIn(nordkustFirst);
    const view = renderActive();
    expect(view.result.current.customers).toEqual([nordkust]);
  });
});

describe("an admin", () => {
  beforeEach(() => {
    sessionStorage.clear();
    state.companyIds = [];
    signIn(admin);
    listLoaded(nordkust, lumen);
  });

  it("belongs to no company and picks among the active ones", () => {
    const view = renderActive();
    expect(view.result.current.customerId).toBeNull();
    expect(view.result.current.customers.map((c) => c.id)).toEqual([nordkust.id, lumen.id]);
    expect(state.companyIds.every((id) => id === null)).toBe(true);
  });

  it("keeps a choice stored before the move to companies, since the ids are the same", () => {
    sessionStorage.setItem(
      ACTIVE_CUSTOMER_STORAGE_KEY,
      JSON.stringify({ userId: admin.id, customerId: lumen.id }),
    );
    const view = renderActive();
    expect(view.result.current.customerId).toBe(lumen.id);
    expect(view.result.current.customer).toEqual(lumen);
    expect(view.result.current.isActingAs).toBe(true);
  });
});

describe("a deleted company", () => {
  beforeEach(() => {
    sessionStorage.clear();
    signIn(admin);
  });

  it("is hidden from the chooser and drops the admin's choice", () => {
    listLoaded(nordkust, lumen);
    const view = renderActive();
    act(() => view.result.current.setCustomerId(nordkust.id));
    expect(view.result.current.customers.map((c) => c.id)).toEqual([nordkust.id, lumen.id]);

    listLoaded({ ...nordkust, deleted_at: "2026-10-22T10:00:00Z" }, lumen);
    view.rerender();
    expect(view.result.current.customers.map((c) => c.id)).toEqual([lumen.id]);
    expect(view.result.current.customerId).toBeNull();
    expect(stored()).toBeNull();
  });
});
