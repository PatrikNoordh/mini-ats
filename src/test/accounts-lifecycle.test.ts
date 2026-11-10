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

  it("asks for the account's email, which names one login, never the company's name", () => {
    expect(deleteConfirmText({ email: "kund@exempelbygg.test" })).toBe("kund@exempelbygg.test");
  });
});
