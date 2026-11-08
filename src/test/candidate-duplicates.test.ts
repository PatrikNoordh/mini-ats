import { describe, expect, it } from "vitest";

import { findLikelyDuplicate } from "@/lib/candidate-duplicates";
import type { Candidate } from "@/types";

function candidate(id: string, full_name: string, email: string): Candidate {
  return {
    id,
    customer_id: "00000000-0000-0000-0000-0000000000a1",
    full_name,
    email,
    phone: "",
    linkedin_url: "",
    notes: "",
    cv_path: null,
    cv_uploaded_at: null,
    created_at: "2026-11-01T08:00:00Z",
  };
}

const anna = candidate("c1", "Anna Svensson", "anna@firma.test");
const bo = candidate("c2", "Bo Ek", "");
const existing = [anna, bo];

describe("a likely duplicate candidate", () => {
  it("matches the same email, ignoring case and spaces", () => {
    expect(
      findLikelyDuplicate(existing, { full_name: "A. Svensson", email: " ANNA@firma.test " }),
    ).toEqual({ candidate: anna, match: "email" });
  });

  it("matches the same name, ignoring case and extra spaces", () => {
    expect(findLikelyDuplicate(existing, { full_name: "  bo   EK ", email: "" })).toEqual({
      candidate: bo,
      match: "name",
    });
  });

  it("prefers an email match to a name match", () => {
    const other = candidate("c3", "Bo Ek", "bo@firma.test");
    expect(
      findLikelyDuplicate([bo, other], { full_name: "Bo Ek", email: "bo@firma.test" }),
    ).toEqual({ candidate: other, match: "email" });
  });

  it("finds nothing for empty fields, a candidate without email, or new details", () => {
    expect(findLikelyDuplicate(existing, { full_name: "", email: "" })).toBeNull();
    expect(findLikelyDuplicate(existing, { full_name: "   ", email: "   " })).toBeNull();
    expect(
      findLikelyDuplicate(existing, { full_name: "Cia Holm", email: "cia@firma.test" }),
    ).toBeNull();
    expect(findLikelyDuplicate([], { full_name: "Anna Svensson", email: "" })).toBeNull();
  });
});
