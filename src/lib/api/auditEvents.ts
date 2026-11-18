import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { AuditActor, AuditEvent } from "@/types";
import { HISTORY_LIMIT } from "@/lib/constants";
import { historyPage, type HistoryPage } from "@/lib/history";

const AUDIT_EVENT_COLUMNS =
  "id, customer_id, actor_id, action, table_name, row_id, candidate_id, fields, before, after, created_at";

const valuesSchema = z.record(z.string(), z.string().nullable()).nullable();

const auditEventRowSchema = z.object({
  id: z.number(),
  customer_id: z.string(),
  actor_id: z.string().nullable(),
  action: z.enum(["insert", "update", "delete"]),
  table_name: z.enum(["jobs", "candidates", "applications"]),
  row_id: z.string(),
  candidate_id: z.string().nullable(),
  fields: z.array(z.string()).nullable(),
  before: valuesSchema,
  after: valuesSchema,
  created_at: z.string(),
});

/** An `audit_events` row as the app's AuditEvent. Throws on an action or table it does not know. */
export function parseAuditEventRow(row: unknown): AuditEvent {
  return auditEventRowSchema.parse(row);
}

const auditActorRowSchema = z.object({
  id: z.string(),
  full_name: z.string().nullable(),
  is_admin: z.boolean(),
});

/**
 * A candidate's history: its own events and its cards', newest first, at most HISTORY_LIMIT.
 * The filter on customer_id matters for admins: RLS returns every company's events to them.
 */
export async function listCandidateHistory(
  customerId: string,
  candidateId: string,
): Promise<HistoryPage> {
  const { data, error } = await supabase
    .from("audit_events")
    .select(AUDIT_EVENT_COLUMNS)
    .eq("customer_id", customerId)
    .eq("candidate_id", candidateId)
    .order("id", { ascending: false })
    // One more than shown, to know whether there are more (ATS-63 AC4).
    .limit(HISTORY_LIMIT + 1);
  if (error) throw error;
  return historyPage(data.map(parseAuditEventRow), HISTORY_LIMIT);
}

/**
 * What one account did, in every company, newest first, at most HISTORY_LIMIT (ATS-48 AC2).
 * Admin only: RLS gives a customer only their own company's events.
 */
export async function listAccountHistory(accountId: string): Promise<HistoryPage> {
  const { data, error } = await supabase
    .from("audit_events")
    .select(AUDIT_EVENT_COLUMNS)
    .eq("actor_id", accountId)
    .order("id", { ascending: false })
    // One more than shown, to know whether there are more (ATS-63 AC4).
    .limit(HISTORY_LIMIT + 1);
  if (error) throw error;
  return historyPage(data.map(parseAuditEventRow), HISTORY_LIMIT);
}

/**
 * The names of the actors the reader may see: those in the reader's own company's events, and
 * every one for an admin. An admin comes back without a name to a customer, and a purged user not
 * at all (audit_actor_names(), ATS-48).
 */
export async function listAuditActors(actorIds: readonly string[]): Promise<AuditActor[]> {
  if (actorIds.length === 0) return [];
  const { data, error } = await supabase.rpc("audit_actor_names", { actor_ids: [...actorIds] });
  if (error) throw error;
  return z.array(auditActorRowSchema).parse(data);
}
