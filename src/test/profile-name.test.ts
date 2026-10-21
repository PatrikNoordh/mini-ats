import { describe, expect, it } from "vitest";

import { displayName, initials } from "@/lib/profile-name";

describe("displayName", () => {
  it("shows the full name when there is one", () => {
    expect(displayName({ full_name: "Anna Berg", email: "anna@test.local" })).toBe("Anna Berg");
  });

  it("falls back to the email when the full name is empty or blank", () => {
    expect(displayName({ full_name: "", email: "anna@test.local" })).toBe("anna@test.local");
    expect(displayName({ full_name: "   ", email: "anna@test.local" })).toBe("anna@test.local");
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Anna Berg")).toBe("AB");
    expect(initials("anna maria  berg")).toBe("AM");
    expect(initials("Örjan")).toBe("Ö");
  });

  it("uses the part of an email before the @", () => {
    expect(initials("anna.berg@test.local")).toBe("AB");
    expect(initials("a@test.local")).toBe("A");
    expect(initials("jan_erik-olsson@test.local")).toBe("JE");
  });
});
