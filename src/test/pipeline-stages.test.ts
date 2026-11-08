import { beforeEach, describe, expect, it, vi } from "vitest";

import { listStages, parseStageRow } from "@/lib/api/pipelineStages";
import { getT } from "@/lib/i18n";
import { firstStageOfKind, queryKeys, stageLabel, stageNamesInLanguages } from "@/lib/stages";
import { customStage, DEFAULT_TEST_STAGES, TEST_CUSTOMER } from "./stage-fixtures";

const { from, select, eq, order } = vi.hoisted(() => {
  const order = vi.fn();
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })), select, eq, order };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

const row = {
  id: "40000000-0000-0000-0000-0000000000a1",
  customer_id: TEST_CUSTOMER,
  name: null,
  default_key: "screening",
  position: 1,
  kind: "open",
  colour: "blue",
};

describe("a pipeline_stages row", () => {
  it("reads a default stage and a stage the customer named", () => {
    expect(parseStageRow(row)).toEqual(row);
    const named = { ...row, name: "Kodtest", default_key: null };
    expect(parseStageRow(named)).toEqual(named);
  });

  it("refuses a kind, colour or default key the app does not know", () => {
    expect(() => parseStageRow({ ...row, kind: "archived" })).toThrow();
    expect(() => parseStageRow({ ...row, colour: "purple" })).toThrow();
    expect(() => parseStageRow({ ...row, default_key: "phone_screen" })).toThrow();
  });
});

describe("listStages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the active customer's stages in board order", async () => {
    order.mockResolvedValue({ data: [row], error: null });
    await expect(listStages(TEST_CUSTOMER)).resolves.toEqual([row]);
    expect(from).toHaveBeenCalledWith("pipeline_stages");
    expect(select).toHaveBeenCalledWith(expect.stringContaining("default_key"));
    // An admin's RLS returns every customer's stages: only the active customer's are wanted.
    expect(eq).toHaveBeenCalledWith("customer_id", TEST_CUSTOMER);
    expect(order).toHaveBeenCalledWith("position");
  });

  it("passes a failed read on", async () => {
    const failure = new Error("network");
    order.mockResolvedValue({ data: null, error: failure });
    await expect(listStages(TEST_CUSTOMER)).rejects.toBe(failure);
  });
});

describe("stage names and kinds", () => {
  it("translates a default stage and shows a typed name as it is, in both languages", () => {
    const screening = DEFAULT_TEST_STAGES[1]!;
    expect(stageLabel(screening, getT("sv"))).toBe(getT("sv")("stages.screening"));
    expect(stageLabel(screening, getT("en"))).toBe("Screening");
    const renamed = { ...screening, name: "Telefonintervju" };
    expect(stageLabel(renamed, getT("en"))).toBe("Telefonintervju");
    expect(stageLabel(renamed, getT("sv"))).toBe("Telefonintervju");
  });

  it("lists a default stage's name in every language, and a typed name once", () => {
    const ts = [getT("sv"), getT("en")];
    const interview = DEFAULT_TEST_STAGES[2]!;
    expect(stageNamesInLanguages(interview, ts)).toEqual(["Intervju", "Interview"]);
    // Screening is the same word in both languages, so it is listed once.
    expect(stageNamesInLanguages(DEFAULT_TEST_STAGES[1]!, ts)).toEqual(["Screening"]);
    expect(stageNamesInLanguages({ ...interview, name: "Kodtest" }, ts)).toEqual(["Kodtest"]);
  });

  it("finds the first stage of a kind in board order", () => {
    const stages = [...DEFAULT_TEST_STAGES, customStage("no", "No thanks", 6, "rejected")];
    expect(firstStageOfKind(stages, "rejected")?.default_key).toBe("rejected");
    expect(firstStageOfKind(stages, "hired")?.kind).toBe("hired");
    expect(firstStageOfKind([], "rejected")).toBeUndefined();
  });

  it("keeps each customer's stages under its own query key", () => {
    expect(queryKeys.stages("c1")).toEqual(["stages", "c1"]);
    expect(queryKeys.stages("c2")).not.toEqual(queryKeys.stages("c1"));
  });
});
