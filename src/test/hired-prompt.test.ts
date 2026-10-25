import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHiredPrompt } from "@/hooks/useHiredPrompt";
import type { Application, Stage } from "@/types";

const move = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useApplications", () => ({
  useMoveApplication: () => ({ mutateAsync: move }),
}));

const CUSTOMER = "00000000-0000-0000-0000-0000000000a1";
const card = (id: string, stage: Stage, candidate = "c1"): Application => ({
  id,
  customer_id: CUSTOMER,
  job_id: `job-${id}`,
  candidate_id: candidate,
  stage,
  position: 0,
  stage_changed_at: "2026-10-01T08:00:00.000Z",
  created_at: "2026-10-01T08:00:00.000Z",
  updated_at: "2026-10-01T08:00:00.000Z",
});
const cards = [card("a", "offer"), card("b", "new"), card("c", "screening", "c2")];

describe("when the reject prompt opens", () => {
  beforeEach(() => {
    move.mockReset();
  });

  it("opens after a saved move to Hired, with the candidate's other open cards", async () => {
    move.mockResolvedValue(card("a", "hired"));
    const { result } = renderHook(() => useHiredPrompt(CUSTOMER, cards));
    act(() => result.current.onMove("a", "hired"));
    await waitFor(() => expect(result.current.hired?.id).toBe("a"));
    expect(result.current.others.map((a) => a.id)).toEqual(["b"]);
    expect(move).toHaveBeenCalledWith({ id: "a", stage: "hired" });
  });

  it("never opens after a failed move to Hired", async () => {
    move.mockRejectedValue(new Error("card_not_found"));
    const { result } = renderHook(() => useHiredPrompt(CUSTOMER, cards));
    act(() => result.current.onMove("a", "hired"));
    await waitFor(() => expect(move).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current.hired).toBeNull();
  });

  it("does not open for another stage, or without other open cards", async () => {
    move.mockResolvedValue(undefined);
    const { result } = renderHook(() => useHiredPrompt(CUSTOMER, cards));
    act(() => result.current.onMove("a", "interview"));
    act(() => result.current.onMove("c", "hired"));
    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(result.current.hired).toBeNull();
  });

  it("closes by itself when the other cards are no longer open, and on close", async () => {
    move.mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ apps }) => useHiredPrompt(CUSTOMER, apps), {
      initialProps: { apps: cards },
    });
    act(() => result.current.onMove("a", "hired"));
    await waitFor(() => expect(result.current.hired?.id).toBe("a"));
    rerender({ apps: [card("a", "hired"), card("b", "rejected")] });
    expect(result.current.hired).toBeNull();

    rerender({ apps: cards });
    expect(result.current.hired?.id).toBe("a");
    act(() => result.current.close());
    expect(result.current.hired).toBeNull();
  });
});
