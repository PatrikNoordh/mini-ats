import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { CustomerPicker } from "@/components/layout/CustomerPicker";
import { getI18n } from "@/lib/i18n";

const refetch = vi.fn();
vi.mock("@/contexts/ActiveCustomerContext", () => ({
  useActiveCustomer: () => ({ customers: [], customerId: null, setCustomerId: vi.fn() }),
}));
vi.mock("@/hooks/useProfiles", () => ({
  useProfiles: () => ({ isError: true, refetch }),
}));

describe("the header customer picker", () => {
  it("shows an error with a retry when the customer list fails", () => {
    render(
      <I18nextProvider i18n={getI18n("en")}>
        <CustomerPicker />
      </I18nextProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the customers.");
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
