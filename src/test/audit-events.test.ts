import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { listAuditActors, parseAuditEventRow } from "@/lib/api/auditEvents";

const row = {
  id: 7,
  customer_id: "co",
  actor_id: null,
  action: "update",
  table_name: "applications",
  row_id: "card",
  candidate_id: "cand",
  fields: ["stage_id"],
  before: { job_id: "j", candidate_id: "cand", stage_id: "s1" },
  after: { job_id: "j", candidate_id: "cand", stage_id: "s2" },
  created_at: "2026-11-16T10:00:00Z",
};

describe("audit events", () => {
  it("parses an event and refuses an action or table the app does not know", () => {
    expect(parseAuditEventRow(row)).toEqual(row);
    expect(() => parseAuditEventRow({ ...row, action: "truncate" })).toThrow();
    expect(() => parseAuditEventRow({ ...row, table_name: "profiles" })).toThrow();
  });

  it("looks up the actors' names only when there are any", async () => {
    expect(await listAuditActors([])).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: [{ id: "u1", full_name: null, is_admin: true }], error: null });
    expect(await listAuditActors(["u1"])).toEqual([{ id: "u1", full_name: null, is_admin: true }]);
    expect(rpc).toHaveBeenCalledWith("audit_actor_names", { actor_ids: ["u1"] });
  });
});
