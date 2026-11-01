// Test data for the end-to-end tests (ATS-36), written to the local stack by seed-e2e.ts. Kept
// apart from the demo data, so a change to the demo never breaks a test. Two customers, so the
// tests can check that one never sees the other's rows. Only fake people on the reserved .test
// domain. The password is the same for every account and only ever exists in the local stack.
import type { DemoAccount, DemoCustomer } from "./demo-data.ts";

export const E2E_PASSWORD = "e2e-local-stack-only";

export const E2E_ADMIN: DemoAccount = {
  key: "E2E_ADMIN",
  role: "admin",
  email: "admin@e2e.test",
  full_name: "E2E Admin",
  company_name: "Mini-ATS",
};

export const E2E_CUSTOMER_A: DemoCustomer = {
  account: {
    key: "E2E_CUSTOMER_A",
    role: "customer",
    email: "kund-a@e2e.test",
    full_name: "Anna A-kund",
    company_name: "Kund A AB",
  },
  jobs: [
    {
      key: "lagerchef",
      title: "Lagerchef A",
      location: "Malmö",
      description: "Testjobb för kund A.",
      status: "open",
    },
    {
      key: "truckforare",
      title: "Truckförare A",
      location: "Lund",
      description: "Testjobb för kund A.",
      status: "open",
    },
  ],
  candidates: [
    {
      full_name: "Astrid Atest",
      email: "astrid@e2e.test",
      phone: "",
      notes: "",
      applications: [{ job: "lagerchef", stage: "new", daysInStage: 1 }],
    },
    {
      full_name: "Arvid Atest",
      email: "arvid@e2e.test",
      phone: "",
      notes: "",
      applications: [
        { job: "lagerchef", stage: "screening", daysInStage: 4 },
        { job: "truckforare", stage: "new", daysInStage: 2 },
      ],
    },
    {
      full_name: "Agnes Atest",
      email: "agnes@e2e.test",
      phone: "",
      notes: "",
      applications: [{ job: "truckforare", stage: "interview", daysInStage: 9 }],
    },
  ],
};

export const E2E_CUSTOMER_B: DemoCustomer = {
  account: {
    key: "E2E_CUSTOMER_B",
    role: "customer",
    email: "kund-b@e2e.test",
    full_name: "Bertil B-kund",
    company_name: "Kund B AB",
  },
  jobs: [
    {
      key: "ekonom",
      title: "Ekonom B",
      location: "Umeå",
      description: "Testjobb för kund B.",
      status: "open",
    },
  ],
  candidates: [
    {
      full_name: "Bodil Btest",
      email: "bodil@e2e.test",
      phone: "",
      notes: "",
      applications: [{ job: "ekonom", stage: "new", daysInStage: 3 }],
    },
    {
      full_name: "Björn Btest",
      email: "bjorn@e2e.test",
      phone: "",
      notes: "",
      applications: [{ job: "ekonom", stage: "offer", daysInStage: 6 }],
    },
  ],
};

export const E2E_CUSTOMERS: DemoCustomer[] = [E2E_CUSTOMER_A, E2E_CUSTOMER_B];

export const E2E_ACCOUNTS: DemoAccount[] = [E2E_ADMIN, ...E2E_CUSTOMERS.map((c) => c.account)];
