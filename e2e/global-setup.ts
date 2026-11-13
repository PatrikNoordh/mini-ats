import {
  appliedMigrations,
  assertMigrationsApplied,
  migrationVersions,
} from "../scripts/local-stack.ts";
import { seedE2e } from "../scripts/seed-e2e.ts";

/**
 * Every run starts from the same accounts and data in the local stack, and stops first if the
 * stack's database lacks a migration from supabase/migrations (ATS-61).
 */
export default async function globalSetup() {
  assertMigrationsApplied(appliedMigrations(), migrationVersions());
  await seedE2e();
}
