import type { Application, Stage } from "@/types";
import { AppError } from "@/lib/errors";
import { clone, db, delay } from "./mockStore";

export async function listApplications(customerId: string): Promise<Application[]> {
  await delay();
  return clone(db().applications.filter((a) => a.customer_id === customerId));
}

/** Moves a card to a stage (appended last). Sets stage_changed_at to now when the stage changes. */
export async function moveApplication(
  customerId: string,
  id: string,
  stage: Stage,
): Promise<Application> {
  await delay();
  const s = db();
  const app = s.applications.find((a) => a.id === id && a.customer_id === customerId);
  if (!app) throw new AppError("card_not_found");
  const now = new Date().toISOString();
  if (app.stage !== stage) {
    const maxPos = Math.max(
      -1,
      ...s.applications
        .filter((a) => a.customer_id === customerId && a.stage === stage)
        .map((a) => a.position),
    );
    app.stage = stage;
    app.position = maxPos + 1;
    app.stage_changed_at = now;
  }
  app.updated_at = now;
  return clone(app);
}
