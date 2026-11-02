import { describe, expect, it } from "vitest";

import { stageWriteError } from "@/lib/api/pipelineStages";
import { errorCode } from "@/lib/errors";
import { cardCountsByStage, resetBlocked, stageRemoveBlock, unusedColour } from "@/lib/stages";
import { stageNameSchema } from "@/lib/validation";
import { customStage, DEFAULT_TEST_STAGES, stageId } from "./stage-fixtures";

const stages = DEFAULT_TEST_STAGES;
const byKey = (key: string) => stages.find((s) => s.id === stageId(key))!;
const noCards = new Map<string, number>();

describe("removing a column", () => {
  it("is blocked while the column has cards, counted over every card", () => {
    const counts = cardCountsByStage([
      { stage_id: stageId("screening") },
      { stage_id: stageId("screening") },
      { stage_id: stageId("offer") },
    ]);
    expect(counts.get(stageId("screening"))).toBe(2);
    expect(stageRemoveBlock(byKey("screening"), stages, counts)).toBe("stage_has_cards");
    expect(stageRemoveBlock(byKey("interview"), stages, counts)).toBeNull();
  });

  it("is blocked for the only Hired, the last Rejected and the last open column", () => {
    expect(stageRemoveBlock(byKey("hired"), stages, noCards)).toBe("stage_hired_required");
    expect(stageRemoveBlock(byKey("rejected"), stages, noCards)).toBe("stage_rejected_required");
    const oneOpen = stages.filter((s) => s.kind !== "open" || s.default_key === "new");
    expect(stageRemoveBlock(byKey("new"), oneOpen, noCards)).toBe("stage_open_required");
    const twoRejected = [...stages, customStage("no", "No thanks", 6, "rejected")];
    expect(stageRemoveBlock(byKey("rejected"), twoRejected, noCards)).toBeNull();
  });
});

describe("resetting the columns", () => {
  const own = customStage("refs", "Referenser", 6);

  it("is blocked while a column it would remove has cards", () => {
    const withOwn = [...stages, own];
    expect(resetBlocked(withOwn, noCards)).toBe(false);
    expect(resetBlocked(withOwn, new Map([[own.id, 1]]))).toBe(true);
  });

  it("is not blocked by cards in default columns, which keep their cards", () => {
    expect(resetBlocked(stages, new Map([[stageId("new"), 5]]))).toBe(false);
  });
});

describe("a new column's colour", () => {
  it("is the first palette colour no column uses, and grey once all are used", () => {
    expect(unusedColour(stages)).toBe("teal");
    const all = ["grey", "blue", "teal", "violet", "pink", "amber", "green", "red"] as const;
    expect(unusedColour(all.map((colour) => ({ colour })))).toBe("grey");
  });
});

describe("a column name", () => {
  const schema = stageNameSchema(["Ny", "Intervju", "Kodtest"]);

  it("is trimmed and kept up to the limit", () => {
    expect(schema.parse("  Referenser  ")).toBe("Referenser");
    expect(schema.safeParse("x".repeat(50)).success).toBe(true);
  });

  it("is refused when empty, too long, or another column's name in any case", () => {
    const issue = (value: string) => schema.safeParse(value).error?.issues[0]?.message;
    expect(issue("   ")).toBe("name_required");
    expect(issue("x".repeat(51))).toBe("too_long");
    expect(issue(" intervju ")).toBe("stage_name_taken");
    expect(issue("KODTEST")).toBe("stage_name_taken");
  });
});

describe("a refused column write", () => {
  it("names the reason the UI shows", () => {
    const code = (error: { code: string; message: string }) => errorCode(stageWriteError(error));
    expect(code({ code: "23503", message: "violates foreign key" })).toBe("stage_has_cards");
    expect(code({ code: "23505", message: "pipeline_stages_name_key" })).toBe("stage_name_taken");
    expect(code({ code: "P0001", message: "stage_rejected_required" })).toBe(
      "stage_rejected_required",
    );
    expect(code({ code: "P0001", message: "stage_limit_reached" })).toBe("stage_limit_reached");
    expect(
      code({ code: "23514", message: 'violates check constraint "pipeline_stages_name_length"' }),
    ).toBe("text_too_long");
  });
});
