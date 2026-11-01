/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

import { localStack } from "./scripts/local-stack.ts";

// End-to-end tests (ATS-36): the built app in Chromium against the local Supabase stack. Start the
// stack first with `npx supabase start`; e2e/global-setup.ts seeds it before every run.
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;
/** The build and the server start take about half a minute; CI runners can be slower. */
const WEB_SERVER_TIMEOUT_MS = 180_000;
const isCI = !!process.env["CI"];

// Read once here. The workers get the values through the environment, without asking the CLI again.
const stack = localStack();
process.env["E2E_SUPABASE_URL"] = stack.url;
process.env["E2E_ANON_KEY"] = stack.anonKey;
process.env["E2E_SERVICE_ROLE_KEY"] = stack.serviceRoleKey;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // The tests share one database, so they run one at a time.
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "sv-SE",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, served by Node instead of the Vercel or Cloudflare preset. The VITE_*
    // variables here win over .env.local, so the build talks to the local stack, never the project.
    command: "npm run build && node .output/server/index.mjs",
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: WEB_SERVER_TIMEOUT_MS,
    env: {
      NITRO_PRESET: "node-server",
      HOST: "127.0.0.1",
      PORT: String(PORT),
      VITE_SUPABASE_URL: stack.url,
      VITE_SUPABASE_ANON_KEY: stack.anonKey,
    },
  },
});
