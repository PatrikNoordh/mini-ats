import { describe, expect, it, vi } from "vitest";

import { listApplications } from "@/lib/api/applications";
import { updateCandidate } from "@/lib/api/candidates";
import { db } from "@/lib/api/mockStore";

vi.mock("@/lib/api/mockStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/mockStore")>()),
  delay: () => Promise.resolve(),
}));

const CUSTOMER = "p_nordkust";
const CANDIDATE = `${CUSTOMER}_cand1`;
const input = {
  full_name: "Test Person",
  email: "test@example.com",
  phone: "",
  linkedin_url: "",
  notes: "",
};

async function linkedJobIds() {
  const apps = await listApplications(CUSTOMER);
  return apps.filter((a) => a.candidate_id === CANDIDATE).map((a) => a.job_id);
}

describe("editing a candidate's job links", () => {
  it("never removes an existing link", async () => {
    const before = await linkedJobIds();
    expect(before.length).toBeGreaterThan(0);

    await updateCandidate(CUSTOMER, CANDIDATE, input, []);

    expect(await linkedJobIds()).toEqual(before);
  });

  it("adds a new link in the new stage and keeps the old ones", async () => {
    const before = await linkedJobIds();
    // Jobs are on Supabase since ATS-9; the mock candidates still link to the mock jobs.
    const jobs = db().jobs.filter((j) => j.customer_id === CUSTOMER);
    const newJob = jobs.map((j) => j.id).find((id) => !before.includes(id));
    if (!newJob) throw new Error("fixture: candidate is already linked to every job");

    await updateCandidate(CUSTOMER, CANDIDATE, input, [newJob]);

    const apps = await listApplications(CUSTOMER);
    const added = apps.find((a) => a.candidate_id === CANDIDATE && a.job_id === newJob);
    expect(added?.stage).toBe("new");
    expect(await linkedJobIds()).toEqual(expect.arrayContaining([...before, newJob]));
  });

  it("links a job that only exists in Supabase", async () => {
    const supabaseJob = "10000000-0000-0000-0000-0000000000a1";

    await updateCandidate(CUSTOMER, CANDIDATE, input, [supabaseJob]);

    expect(await linkedJobIds()).toContain(supabaseJob);
  });
});
