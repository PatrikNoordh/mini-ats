import { describe, expect, it } from "vitest";

import { parseSearch, stringifySearch } from "@/lib/search-params";

describe("search params", () => {
  it("reads every value as the text in the URL", () => {
    expect(parseSearch("?q=1e3&job=abc&flag=true&empty=")).toEqual({
      q: "1e3",
      job: "abc",
      flag: "true",
      empty: "",
    });
    expect(parseSearch("")).toEqual({});
  });

  it("decodes encoded text and keeps the last of a repeated key", () => {
    expect(parseSearch("q=Anna%20Berg&q=%C3%85sa+%26+co")).toEqual({ q: "Åsa & co" });
  });

  it("writes text back and leaves out undefined and null", () => {
    expect(stringifySearch({ q: "Åsa & co", job: undefined, x: null })).toBe("?q=%C3%85sa+%26+co");
    expect(stringifySearch({})).toBe("");
  });

  it("round-trips what it writes", () => {
    const search = { q: "12.50", redirect: "/pipeline?job=a&q=b" };
    expect(parseSearch(stringifySearch(search))).toEqual(search);
  });
});
