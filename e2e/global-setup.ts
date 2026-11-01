import { seedE2e } from "../scripts/seed-e2e.ts";

/** Every run starts from the same accounts and data in the local stack. */
export default async function globalSetup() {
  await seedE2e();
}
