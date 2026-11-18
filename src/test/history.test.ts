import { describe, expect, it } from "vitest";

import { HISTORY_LIMIT } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";
import { formatList } from "@/lib/format";
import {
  actorIds,
  actorLabel,
  describeEvent,
  historyPage,
  referencedIds,
  type HistoryNames,
} from "@/lib/history";
import type { AuditActor, AuditEvent } from "@/types";

const sv = getI18n("sv").t;
const en = getI18n("en").t;
const svList = (items: readonly string[]) => formatList(items, "sv");
const enList = (items: readonly string[]) => formatList(items, "en");

function event(extra: Partial<AuditEvent>): AuditEvent {
  return {
    id: 1,
    customer_id: "co",
    actor_id: "u1",
    action: "insert",
    table_name: "applications",
    row_id: "card",
    candidate_id: "cand",
    fields: null,
    before: null,
    after: null,
    created_at: "2026-11-16T10:00:00Z",
    ...extra,
  };
}

const names: HistoryNames = {
  job: (id) => ({ job: "Snickare" })[id],
  candidate: (id) => ({ cand: "Anna Berg" })[id],
  stage: (id) => ({ s1: "Screening", s2: "Intervju" })[id],
};
const card = { job_id: "job", candidate_id: "cand", stage_id: "s1" };

describe("describeEvent", () => {
  it("describes a card linked, moved and removed", () => {
    expect(describeEvent(event({ after: card }), names, sv, svList)).toBe(
      "Kopplade Anna Berg till Snickare",
    );
    const move = event({
      action: "update",
      fields: ["stage_id"],
      before: card,
      after: { ...card, stage_id: "s2" },
    });
    expect(describeEvent(move, names, sv, svList)).toBe(
      "Flyttade Anna Berg från Screening till Intervju i Snickare",
    );
    expect(describeEvent(move, names, en, enList)).toBe(
      "Moved Anna Berg from Screening to Intervju in Snickare",
    );
    expect(describeEvent(event({ action: "delete", before: card }), names, en, enList)).toBe(
      "Removed Anna Berg from Snickare",
    );
  });

  it("names a removed job, column or candidate as removed", () => {
    const move = event({
      action: "update",
      fields: ["stage_id"],
      before: { job_id: "gone", candidate_id: "gone", stage_id: "gone" },
      after: { job_id: "gone", candidate_id: "gone", stage_id: "s2" },
    });
    expect(describeEvent(move, names, en, enList)).toBe(
      "Moved a removed candidate from a removed column to Intervju in a removed job",
    );
  });

  it("names the changed fields of a candidate, never a value", () => {
    const edit = event({
      table_name: "candidates",
      row_id: "cand",
      action: "update",
      fields: ["email", "notes", "cv_path"],
    });
    expect(describeEvent(edit, names, sv, svList)).toBe(
      "Ändrade e-post, anteckningar och CV för Anna Berg",
    );
    expect(describeEvent({ ...edit, action: "insert", fields: null }, names, en, enList)).toBe(
      "Added Anna Berg",
    );
    expect(
      describeEvent({ ...edit, row_id: "gone", action: "delete", fields: null }, names, en, enList),
    ).toBe("Deleted a candidate");
    expect(
      describeEvent({ ...edit, row_id: "gone", action: "delete", fields: null }, names, sv, svList),
    ).toBe("Tog bort en kandidat");
  });

  it("names a card's removed candidate without saying removed twice when the card goes too", () => {
    const gone = { job_id: "job", candidate_id: "gone", stage_id: "s1" };
    expect(describeEvent(event({ action: "delete", before: gone }), names, sv, svList)).toBe(
      "Tog bort en kandidat från Snickare",
    );
    expect(describeEvent(event({ after: gone }), names, sv, svList)).toBe(
      "Kopplade en borttagen kandidat till Snickare",
    );
  });

  it("names a job by the title it keeps, also after the job is deleted", () => {
    const job = { title: "Snickare", location: null, status: "open" };
    const base = event({ table_name: "jobs", row_id: "job", candidate_id: null });
    expect(describeEvent({ ...base, after: job }, names, sv, svList)).toBe(
      "Skapade jobbet Snickare",
    );
    expect(
      describeEvent(
        {
          ...base,
          action: "update",
          fields: ["status"],
          before: job,
          after: { ...job, status: "closed" },
        },
        names,
        sv,
        svList,
      ),
    ).toBe("Stängde jobbet Snickare");
    expect(
      describeEvent(
        {
          ...base,
          action: "update",
          fields: ["status"],
          before: { ...job, status: "closed" },
          after: job,
        },
        names,
        en,
        enList,
      ),
    ).toBe("Reopened the job Snickare");
    expect(
      describeEvent(
        {
          ...base,
          action: "update",
          fields: ["title", "description"],
          before: job,
          after: { ...job, title: "Murare" },
        },
        names,
        en,
        enList,
      ),
    ).toBe("Changed title and description for the job Murare");
    expect(describeEvent({ ...base, action: "delete", before: job }, names, en, enList)).toBe(
      "Deleted the job Snickare",
    );
  });

  it("leaves out a field it does not know", () => {
    const edit = event({
      table_name: "candidates",
      row_id: "cand",
      action: "update",
      fields: ["email", "something_new"],
    });
    expect(describeEvent(edit, names, en, enList)).toBe("Changed email for Anna Berg");
  });
});

describe("actorLabel", () => {
  const actors = new Map<string, AuditActor>([
    ["member", { id: "member", full_name: "Cecilia", is_admin: false }],
    ["admin", { id: "admin", full_name: null, is_admin: true }],
    ["named-admin", { id: "named-admin", full_name: "Ada Admin", is_admin: true }],
    ["unnamed", { id: "unnamed", full_name: null, is_admin: false }],
  ]);

  it("shows a name, an admin a customer may not name, the system and a removed user", () => {
    expect(actorLabel("member", actors, en)).toBe("Cecilia");
    expect(actorLabel("admin", actors, sv)).toBe("Admin");
    expect(actorLabel("named-admin", actors, en)).toBe("Ada Admin");
    expect(actorLabel("unnamed", actors, en)).toBe("A user without a name");
    expect(actorLabel(null, actors, sv)).toBe("Systemet");
    expect(actorLabel("purged", actors, sv)).toBe("En borttagen användare");
  });
});

describe("the ids a history looks up", () => {
  it("lists each actor once, and the jobs, candidates and columns of the cards", () => {
    const events = [
      event({ actor_id: "u1", after: card }),
      event({
        actor_id: "u1",
        action: "update",
        fields: ["stage_id"],
        before: card,
        after: { ...card, stage_id: "s2" },
      }),
      event({
        actor_id: null,
        table_name: "jobs",
        candidate_id: null,
        after: { title: "T", location: null, status: "open" },
      }),
      event({ actor_id: "u2", table_name: "candidates", row_id: "c2", candidate_id: "c2" }),
    ];
    expect(actorIds(events)).toEqual(["u1", "u2"]);
    expect(referencedIds(events)).toEqual({
      jobs: ["job"],
      candidates: ["cand", "c2"],
      stages: ["s1", "s2"],
    });
  });
});

describe("a history page (ATS-63 AC4)", () => {
  const rows = (count: number) => Array.from({ length: count }, (_, i) => event({ id: count - i }));

  it.each([
    [0, 0, false],
    [HISTORY_LIMIT - 1, HISTORY_LIMIT - 1, false],
    [HISTORY_LIMIT, HISTORY_LIMIT, false],
    [HISTORY_LIMIT + 1, HISTORY_LIMIT, true],
  ])("of %i rows shows %i, cut off: %s", (count, shown, truncated) => {
    const page = historyPage(rows(count), HISTORY_LIMIT);
    expect(page.events).toHaveLength(shown);
    expect(page.truncated).toBe(truncated);
    expect(page.events[0]?.id).toBe(count === 0 ? undefined : count);
  });
});
