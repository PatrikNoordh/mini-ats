import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCustomerTheme } from "@/hooks/useCustomerTheme";
import { queryKeys } from "@/lib/stages";
import { THEMED_TOKENS } from "@/lib/theme";
import type { CustomerBranding } from "@/types";

const active = vi.hoisted(() => ({ customerId: null as string | null }));
const branding = vi.hoisted(() => ({
  byCustomer: new Map<string, { data: CustomerBranding | null | undefined }>(),
  askedFor: [] as (string | null)[],
}));

vi.mock("@/contexts/ActiveCustomerContext", () => ({
  useActiveCustomer: () => ({ customerId: active.customerId }),
}));
vi.mock("@/hooks/useBranding", () => ({
  useBranding: (customerId: string | null) => {
    branding.askedFor.push(customerId);
    return (customerId && branding.byCustomer.get(customerId)) ?? { data: undefined };
  },
}));

function theme(customerId: string, accent: string | null): { data: CustomerBranding } {
  return {
    data: {
      customer_id: customerId,
      accent_colour: accent,
      logo_path: null,
      background_path: null,
      background_dim: "medium",
      background_floor: null,
      surface_opacity: null,
      updated_at: "2026-11-19T08:00:00Z",
    },
  };
}

const root = () => document.documentElement.style;
const applied = () => THEMED_TOKENS.filter((token) => root().getPropertyValue(token) !== "");

describe("the customer's theme on the app shell", () => {
  beforeEach(() => {
    active.customerId = null;
    branding.byCustomer.clear();
    branding.askedFor = [];
  });
  afterEach(() => {
    for (const token of THEMED_TOKENS) root().removeProperty(token);
  });

  it("reads the theme under the active customer's key", () => {
    expect(queryKeys.branding("nordkust")).toEqual(["branding", "nordkust"]);
    active.customerId = "nordkust";
    renderHook(() => useCustomerTheme());
    expect(branding.askedFor).toEqual(["nordkust"]);
  });

  it("sets every themed token on <html> for a customer with a readable accent", () => {
    active.customerId = "nordkust";
    branding.byCustomer.set("nordkust", theme("nordkust", "#1d4ed8"));
    renderHook(() => useCustomerTheme());
    expect(applied()).toEqual([...THEMED_TOKENS]);
    expect(root().getPropertyValue("--primary")).toBe("#1d4ed8");
  });

  it("removes the tokens when the shell goes, so the sign-in page has the Mini-ATS theme", () => {
    active.customerId = "nordkust";
    branding.byCustomer.set("nordkust", theme("nordkust", "#1d4ed8"));
    const { unmount } = renderHook(() => useCustomerTheme());
    unmount();
    expect(applied()).toEqual([]);
  });

  it("changes with the customer an admin acts for, and goes when the admin acts for nobody", () => {
    branding.byCustomer.set("nordkust", theme("nordkust", "#1d4ed8"));
    branding.byCustomer.set("lumen", theme("lumen", "#b91c1c"));
    active.customerId = "nordkust";
    const { rerender } = renderHook(() => useCustomerTheme());
    active.customerId = "lumen";
    rerender();
    expect(root().getPropertyValue("--primary")).toBe("#b91c1c");
    active.customerId = null;
    rerender();
    expect(applied()).toEqual([]);
  });

  it("keeps the Mini-ATS theme without a theme, without an accent, while loading and for an unreadable accent", () => {
    branding.byCustomer.set("none", { data: null });
    branding.byCustomer.set("logo-only", theme("logo-only", null));
    branding.byCustomer.set("unreadable", theme("unreadable", "#facc15"));
    for (const customerId of ["none", "logo-only", "loading", "unreadable"]) {
      active.customerId = customerId;
      const { unmount } = renderHook(() => useCustomerTheme());
      expect(applied()).toEqual([]);
      unmount();
    }
  });
});
