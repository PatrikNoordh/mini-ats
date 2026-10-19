import { describe, expect, it } from "vitest";

import { parseSupabaseConfig } from "@/integrations/supabase/config";

describe("Supabase config", () => {
  it("reads the URL and the anon key", () => {
    expect(
      parseSupabaseConfig({
        VITE_SUPABASE_URL: "https://abc.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
        MODE: "test",
      }),
    ).toEqual({ url: "https://abc.supabase.co", anonKey: "anon" });
  });

  it("names every missing value", () => {
    expect(() => parseSupabaseConfig({})).toThrow(/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/);
  });

  it("rejects an empty key and a URL that is not a URL", () => {
    expect(() =>
      parseSupabaseConfig({ VITE_SUPABASE_URL: "abc.supabase", VITE_SUPABASE_ANON_KEY: "" }),
    ).toThrow(/VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/);
  });
});
