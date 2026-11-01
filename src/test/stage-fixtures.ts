import type { DefaultStageKey, PipelineStage, StageColour, StageKind } from "@/types";

export const TEST_CUSTOMER = "00000000-0000-0000-0000-0000000000a1";

const DEFAULTS: [DefaultStageKey, StageKind, StageColour][] = [
  ["new", "open", "grey"],
  ["screening", "open", "blue"],
  ["interview", "open", "violet"],
  ["offer", "open", "amber"],
  ["hired", "hired", "green"],
  ["rejected", "rejected", "red"],
];

/** The id a test stage gets: `stage-<key>`, so a test can name a default stage by its key. */
export const stageId = (key: string) => `stage-${key}`;

/** The six default stages of a new account, in board order, as the database creates them. */
export const DEFAULT_TEST_STAGES: PipelineStage[] = DEFAULTS.map(
  ([key, kind, colour], position) => ({
    id: stageId(key),
    customer_id: TEST_CUSTOMER,
    name: null,
    default_key: key,
    position,
    kind,
    colour,
  }),
);

/** A stage the customer added, with a name of its own (ATS-40). */
export function customStage(
  key: string,
  name: string,
  position: number,
  kind: StageKind = "open",
): PipelineStage {
  return {
    id: stageId(key),
    customer_id: TEST_CUSTOMER,
    name,
    default_key: null,
    position,
    kind,
    colour: "teal",
  };
}
