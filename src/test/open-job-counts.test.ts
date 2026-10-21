import { beforeEach, describe, expect, it, vi } from "vitest";

import { countOpenJobsByCustomer, parseOpenJobCounts } from "@/lib/api/profiles";

const { from, select, eq } = vi.hoisted(() => {
  const eq = vi.fn();
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })), select, eq };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

describe("open jobs per customer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the embedded count, and 0 for a customer without open jobs", () => {
    const counts = parseOpenJobCounts([
      { id: "a", jobs: [{ count: 2 }] },
      { id: "b", jobs: [{ count: 0 }] },
      { id: "c", jobs: [] },
    ]);
    expect([...counts]).toEqual([
      ["a", 2],
      ["b", 0],
      ["c", 0],
    ]);
  });

  it("asks for the counts of open jobs only, in one request", async () => {
    const result = { data: [{ id: "a", jobs: [{ count: 3 }] }], error: null };
    const statusEq = vi.fn().mockResolvedValue(result);
    eq.mockReturnValueOnce({ eq: statusEq });
    const counts = await countOpenJobsByCustomer();
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("id, jobs(count)");
    expect(eq).toHaveBeenCalledWith("role", "customer");
    expect(statusEq).toHaveBeenCalledWith("jobs.status", "open");
    expect(counts.get("a")).toBe(3);
  });

  it("throws when the request fails", async () => {
    const failure = { data: null, error: new Error("network") };
    eq.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue(failure) });
    await expect(countOpenJobsByCustomer()).rejects.toThrow("network");
  });
});
