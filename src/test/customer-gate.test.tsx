import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerGate } from "@/components/layout/CustomerGate";
import { getI18n } from "@/lib/i18n";
import type { Profile } from "@/types";

const { activeCustomer, profiles, counts } = vi.hoisted(() => ({
  activeCustomer: vi.fn(),
  profiles: vi.fn(),
  counts: vi.fn(),
}));

vi.mock("@/contexts/ActiveCustomerContext", () => ({ useActiveCustomer: activeCustomer }));
vi.mock("@/hooks/useProfiles", () => ({ useProfiles: profiles, useOpenJobCounts: counts }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

function customer(id: string, company: string): Profile {
  return {
    id,
    role: "customer",
    full_name: "",
    company_name: company,
    email: "",
    created_at: "2026-10-01T08:00:00.000Z",
    deleted_at: null,
  };
}

const nordkust = customer("a", "Nordkust Bygg AB");
const lumen = customer("b", "Studio Lumen");
const setCustomerId = vi.fn();

function query<T>(state: Partial<{ data: T; isLoading: boolean; isError: boolean }>) {
  return { data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...state };
}

let root: Root | null = null;
let container: HTMLElement;

function render(node: ReactNode) {
  act(() => {
    root ??= createRoot(container);
    root.render(<I18nextProvider i18n={getI18n("sv")}>{node}</I18nextProvider>);
  });
}

function chooser() {
  return <CustomerGate>{(id) => <Page id={id} />}</CustomerGate>;
}

/** A page with local state, like the pipeline's open side panel. */
function Page({ id }: { id: string }) {
  const [opened, setOpened] = useState(false);
  return (
    <button onClick={() => setOpened(true)}>
      {id}:{opened ? "open" : "closed"}
    </button>
  );
}

function acting(customerId: string | null, customers: Profile[] = [nordkust, lumen]) {
  activeCustomer.mockReturnValue({ customerId, customers, setCustomerId });
}

describe("the admin's customer chooser", () => {
  beforeEach(() => {
    container = document.body.appendChild(document.createElement("div"));
    profiles.mockReturnValue(query({ data: [nordkust, lumen] }));
    counts.mockReturnValue(query({ data: new Map([["a", 2]]) }));
    acting(null);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows each customer's number of open jobs, and 0 for none", () => {
    counts.mockReturnValue(
      query({
        data: new Map([
          ["a", 2],
          ["b", 0],
        ]),
      }),
    );
    render(chooser());
    expect(container.textContent).toContain("Nordkust Bygg AB2 öppna jobb");
    expect(container.textContent).toContain("Studio Lumen0 öppna jobb");
  });

  it("shows an error with a retry when the counts fail, and the customers can still be picked", () => {
    const failed = query<Map<string, number>>({ isError: true });
    counts.mockReturnValue(failed);
    render(chooser());
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Antalet öppna jobb kunde inte hämtas.");
    expect(container.textContent).not.toContain("…");
    expect(container.textContent).toContain("Antal jobb saknas");
    act(() => alert?.querySelector("button")?.click());
    expect(failed.refetch).toHaveBeenCalled();
    const card = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Studio Lumen"),
    );
    act(() => card?.click());
    expect(setCustomerId).toHaveBeenCalledWith("b");
  });

  it("shows an error with a retry when the customers fail to load", () => {
    const failed = query<Profile[]>({ isError: true });
    profiles.mockReturnValue(failed);
    acting(null, []);
    render(chooser());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Försök igen");
    act(() => container.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());
    expect(failed.refetch).toHaveBeenCalled();
  });

  it("points to the accounts page when there are no customers", () => {
    acting(null, []);
    render(chooser());
    expect(container.textContent).toContain("Det finns inga kunder än");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/admin/accounts");
  });

  it("starts the page afresh when the admin switches customer", () => {
    acting("a");
    render(chooser());
    act(() => container.querySelector("button")?.click());
    expect(container.textContent).toBe("a:open");
    acting("b");
    render(chooser());
    expect(container.textContent).toBe("b:closed");
    acting("a");
    render(chooser());
    expect(container.textContent).toBe("a:closed");
  });
});
