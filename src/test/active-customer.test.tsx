import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveCustomerProvider, useActiveCustomer } from "@/contexts/ActiveCustomerContext";
import { ACTIVE_CUSTOMER_STORAGE_KEY } from "@/lib/active-customer-storage";
import type { Profile } from "@/types";

function account(id: string, role: Profile["role"]): Profile {
  return {
    id,
    role,
    full_name: id,
    company_name: `${id} AB`,
    email: `${id}@test.local`,
    created_at: "2026-10-01T08:00:00Z",
  };
}

const admin = account("admin", "admin");
const otherAdmin = account("admin2", "admin");
const nordkust = account("nordkust", "customer");
const lumen = account("lumen", "customer");

const state = vi.hoisted(() => ({
  auth: { profile: null as Profile | null, isLoading: false },
  profiles: { data: undefined as Profile[] | undefined, isPending: true },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state.auth }));
vi.mock("@/hooks/useProfiles", () => ({ useProfiles: () => state.profiles }));

const wrapper = ({ children }: { children: ReactNode }) => (
  <ActiveCustomerProvider>{children}</ActiveCustomerProvider>
);
const renderActive = () => renderHook(() => useActiveCustomer(), { wrapper });

const signIn = (profile: Profile | null) => (state.auth = { profile, isLoading: false });
const listLoaded = (...profiles: Profile[]) =>
  (state.profiles = { data: profiles, isPending: false });
const stored = () => sessionStorage.getItem(ACTIVE_CUSTOMER_STORAGE_KEY);

describe("the admin's chosen customer", () => {
  beforeEach(() => {
    sessionStorage.clear();
    signIn(admin);
    listLoaded(admin, nordkust, lumen);
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

  it("waits for the customer list instead of dropping the stored choice", () => {
    sessionStorage.setItem(
      ACTIVE_CUSTOMER_STORAGE_KEY,
      JSON.stringify({ userId: admin.id, customerId: lumen.id }),
    );
    state.profiles = { data: undefined, isPending: true };
    const view = renderActive();
    expect(view.result.current.customerId).toBeNull();
    expect(view.result.current.isRestoring).toBe(true);

    listLoaded(admin, nordkust, lumen);
    view.rerender();
    expect(view.result.current.customerId).toBe(lumen.id);
    expect(view.result.current.isRestoring).toBe(false);
  });

  it("ignores and removes a stored id that is not one of the customers", () => {
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
    listLoaded(otherAdmin, nordkust, lumen);
    view.rerender();
    expect(view.result.current.customerId).toBeNull();
  });

  it("keeps the choice while auth is still loading after a reload", () => {
    sessionStorage.setItem(
      ACTIVE_CUSTOMER_STORAGE_KEY,
      JSON.stringify({ userId: admin.id, customerId: nordkust.id }),
    );
    state.auth = { profile: null, isLoading: true };
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

describe("a customer account", () => {
  beforeEach(() => sessionStorage.clear());

  it("is always its own customer and never reads or writes the stored choice", () => {
    sessionStorage.setItem(
      ACTIVE_CUSTOMER_STORAGE_KEY,
      JSON.stringify({ userId: nordkust.id, customerId: lumen.id }),
    );
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    signIn(nordkust);
    const view = renderActive();
    act(() => view.result.current.setCustomerId(lumen.id));
    expect(view.result.current.customerId).toBe(nordkust.id);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
