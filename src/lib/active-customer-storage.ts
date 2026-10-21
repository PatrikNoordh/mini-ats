import { z } from "zod";

/** sessionStorage key for an admin's chosen customer, so a reload in the same tab keeps it. */
export const ACTIVE_CUSTOMER_STORAGE_KEY = "mini-ats.activeCustomer";

/** Stored with the admin's own id, so another account signing in on this tab never uses it. */
const storedSchema = z.object({ userId: z.string(), customerId: z.string() });

/** The tab's sessionStorage, or null where it is blocked (private mode, disabled storage). */
function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The customer this admin chose earlier in this tab, or null. */
export function readStoredCustomer(userId: string): string | null {
  try {
    const raw = storage()?.getItem(ACTIVE_CUSTOMER_STORAGE_KEY);
    const stored = storedSchema.safeParse(raw ? JSON.parse(raw) : null);
    return stored.success && stored.data.userId === userId ? stored.data.customerId : null;
  } catch {
    return null;
  }
}

/** Remembers the admin's choice for this tab. */
export function storeCustomer(userId: string, customerId: string): void {
  try {
    storage()?.setItem(ACTIVE_CUSTOMER_STORAGE_KEY, JSON.stringify({ userId, customerId }));
  } catch {
    // Storage full or blocked: the choice just does not survive a reload.
  }
}

/** Forgets the stored choice: after logout, leaving customer mode or a stale id. */
export function clearStoredCustomer(): void {
  try {
    storage()?.removeItem(ACTIVE_CUSTOMER_STORAGE_KEY);
  } catch {
    // Blocked storage holds nothing to clear.
  }
}
