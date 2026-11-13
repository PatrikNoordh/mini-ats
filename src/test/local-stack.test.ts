import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertMigrationsApplied,
  localStack,
  migrationVersions,
  missingMigrations,
} from "../../scripts/local-stack";

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

describe("the local database's migrations", () => {
  it("reads each migration's version from its file name, oldest first", () => {
    const versions = migrationVersions();
    expect(versions[0]).toBe("20261006000000");
    expect(versions).toContain("20261113120000");
    expect([...versions].sort()).toEqual(versions);
    expect(versions.every((v) => /^\d{14}$/.test(v))).toBe(true);
  });

  it("names the migrations the database has not applied", () => {
    expect(missingMigrations(["1", "2"], ["1", "2", "3", "4"])).toEqual(["3", "4"]);
    expect(missingMigrations(["1", "2", "3"], ["1", "2", "3"])).toEqual([]);
  });

  it("stops with the fix when one is missing, and passes when none is", () => {
    expect(() => assertMigrationsApplied(["1"], ["1", "2"])).toThrow(
      "missing 1 migration(s): 2. npx supabase start restored it from its last backup and skipped them. " +
        "Run npx supabase stop --no-backup, then npx supabase start.",
    );
    expect(() => assertMigrationsApplied(["1", "2"], ["1", "2"])).not.toThrow();
  });
});
