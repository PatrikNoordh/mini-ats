import { describe, expect, it } from "vitest";

import { deleteConfirmText, isActive, purgeDate } from "@/lib/accounts";
import { ACCOUNT_DELETE_GRACE_DAYS } from "@/lib/constants";

describe("deleted accounts", () => {
  it("tells an active account from a deleted one", () => {
    expect(isActive({ deleted_at: null })).toBe(true);
    expect(isActive({ deleted_at: "2026-10-22T10:00:00Z" })).toBe(false);
  });

  it("is deleted for good the grace period after it was deleted", () => {
    expect(ACCOUNT_DELETE_GRACE_DAYS).toBe(30);
    expect(purgeDate("2026-10-22T10:00:00Z").toISOString()).toBe("2026-11-21T10:00:00.000Z");
  });

  it("asks for the company name, or the email for an admin or an account without one", () => {
    const customer = {
      role: "customer",
      company_name: "Exempelbygg AB",
      email: "kund@exempelbygg.test",
    } as const;
    expect(deleteConfirmText(customer)).toBe("Exempelbygg AB");
    expect(deleteConfirmText({ ...customer, company_name: "" })).toBe("kund@exempelbygg.test");
    expect(deleteConfirmText({ ...customer, role: "admin" })).toBe("kund@exempelbygg.test");
  });
});
