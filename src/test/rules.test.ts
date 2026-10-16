import { describe, expect, it } from "vitest";
import { daysSince, isLinkedInUrl, queryKeys, resolveJobFilter } from "@/lib/stages";

describe("business rules", () => {
  it("customer query keys include the customer id", () => {
    expect(queryKeys.jobs("c1")).toEqual(["jobs", "c1"]);
    expect(queryKeys.applications("c2")).not.toEqual(queryKeys.applications("c1"));
  });
  it("days in stage counts whole days", () => {
    expect(daysSince("2026-10-01T00:00:00Z", new Date("2026-10-04T12:00:00Z"))).toBe(3);
  });
  describe("LinkedIn URL matches the database check", () => {
    it.each([
      "https://www.linkedin.com/in/x",
      "https://se.linkedin.com/in/x",
      "https://linkedin.com/in/x",
      "http://linkedin.com/",
      "HTTPS://WWW.LINKEDIN.COM/in/x",
    ])("accepts %s", (url) => {
      expect(isLinkedInUrl(url)).toBe(true);
    });

    it.each([
      "https://linkedin.com",
      "https://a.b.linkedin.com/in/x",
      "https://linkedin.com.evil.test/in/x",
      "https://evillinkedin.com/in/x",
      "linkedin.com/in/x",
      "ftp://linkedin.com/in/x",
      "",
    ])("rejects %s", (url) => {
      expect(isLinkedInUrl(url)).toBe(false);
    });
  });
  describe("job filter", () => {
    const jobs = [{ id: "c1_job1" }, { id: "c1_job2" }];
    it("keeps a job of the active customer", () => {
      expect(resolveJobFilter("c1_job2", jobs)).toBe("c1_job2");
    });
    it("drops a job of another customer", () => {
      expect(resolveJobFilter("c2_job1", jobs)).toBeUndefined();
    });
    it("keeps the filter while jobs are loading", () => {
      expect(resolveJobFilter("c2_job1", undefined)).toBe("c2_job1");
    });
    it("stays empty when no job is chosen", () => {
      expect(resolveJobFilter(undefined, jobs)).toBeUndefined();
    });
  });
});
