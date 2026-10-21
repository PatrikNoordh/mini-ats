import { describe, expect, it } from "vitest";

import { DEMO_ACCOUNTS, DEMO_ADMIN, DEMO_CUSTOMERS } from "../../scripts/demo-data";
import { STALE_CARD_DAYS } from "@/lib/constants";
import { STAGES } from "@/lib/stages";
import { accountInputSchema, candidateInputSchema, jobInputSchema } from "@/lib/validation";

const candidates = DEMO_CUSTOMERS.flatMap((c) => c.candidates);
const applications = candidates.flatMap((c) => c.applications);
/** 070-174 06 05 to 070-174 06 99 is reserved for fiction in Sweden. */
const FICTIONAL_PHONE = /^070-174 06 (0[5-9]|[1-9]\d)$/;

describe("demo data", () => {
  it("has an admin and two customers, about 15 candidates in all", () => {
    expect(DEMO_ADMIN.role).toBe("admin");
    expect(DEMO_CUSTOMERS).toHaveLength(2);
    expect(DEMO_CUSTOMERS.every((c) => c.account.role === "customer")).toBe(true);
    expect(candidates.length).toBeGreaterThanOrEqual(12);
    expect(candidates.length).toBeLessThanOrEqual(18);
  });

  it("puts the reviewers' customer in every stage, with a stale card", () => {
    const first = DEMO_CUSTOMERS[0]!.candidates.flatMap((c) => c.applications);
    expect(new Set(first.map((a) => a.stage))).toEqual(new Set(STAGES));
    expect(first.some((a) => a.daysInStage >= STALE_CARD_DAYS)).toBe(true);
  });

  it("uses only fake emails and phone numbers, and no LinkedIn links", () => {
    const emails = [...DEMO_ACCOUNTS.map((a) => a.email), ...candidates.map((c) => c.email)];
    expect(emails.every((e) => e.endsWith(".test"))).toBe(true);
    expect(new Set(emails).size).toBe(emails.length);
    expect(candidates.every((c) => c.phone === "" || FICTIONAL_PHONE.test(c.phone))).toBe(true);
  });

  it("passes the same rules as the forms", () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(accountInputSchema.safeParse({ ...account, password: "long-enough" }).success).toBe(
        true,
      );
    }
    for (const job of DEMO_CUSTOMERS.flatMap((c) => c.jobs)) {
      expect(jobInputSchema.safeParse(job).success, job.title).toBe(true);
    }
    for (const candidate of candidates) {
      const result = candidateInputSchema.safeParse({ ...candidate, linkedin_url: "" });
      expect(result.success, candidate.full_name).toBe(true);
    }
  });

  it("links every card to one of its own customer's jobs, once per job", () => {
    for (const customer of DEMO_CUSTOMERS) {
      const jobs = new Set(customer.jobs.map((j) => j.key));
      expect(jobs.size).toBe(customer.jobs.length);
      for (const candidate of customer.candidates) {
        const linked = candidate.applications.map((a) => a.job);
        expect(
          linked.every((job) => jobs.has(job)),
          candidate.full_name,
        ).toBe(true);
        expect(new Set(linked).size).toBe(linked.length);
      }
    }
    expect(applications.every((a) => a.daysInStage >= 0)).toBe(true);
  });
});
