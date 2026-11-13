import { afterEach, describe, expect, it, vi } from "vitest";

import { localStack } from "../../scripts/local-stack";

/** The stack the E2E_* variables name, as CI sets them, so `npx supabase status` never runs. */
function stackAt(url: string) {
  vi.stubEnv("E2E_SUPABASE_URL", url);
  vi.stubEnv("E2E_ANON_KEY", "anon-key");
  vi.stubEnv("E2E_SERVICE_ROLE_KEY", "service-role-key");
  return localStack();
}

describe("the end-to-end tests' Supabase stack", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["http://127.0.0.1:54321", "http://localhost:54321"])(
    "accepts the local stack at %s",
    (url) => {
      expect(stackAt(url)).toEqual({
        url,
        anonKey: "anon-key",
        serviceRoleKey: "service-role-key",
      });
    },
  );

  it.each([
    "https://abcdefghijklmnop.supabase.co",
    "http://127.0.0.1.example.com:54321",
    "http://localhost.example.com:54321",
    "http://192.168.1.10:54321",
    "http://[::1]:54321",
    "http://0.0.0.0:54321",
  ])("refuses %s", (url) => {
    expect(() => stackAt(url)).toThrow(
      /^Refusing .*: the end-to-end tests only run against the local stack\.$/,
    );
  });
});
