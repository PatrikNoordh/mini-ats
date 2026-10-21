// Demo data for the reviewers (ATS-15). Only obviously fake people and companies: emails on the
// reserved .test domain, phone numbers in 070-174 06 05–99 (reserved for fiction in Sweden) and
// no LinkedIn links, so nothing can point at a real person. scripts/seed-demo.ts writes it.
import type { JobStatus, Role, Stage } from "../src/types/index.ts";

export interface DemoAccount {
  /** Names the environment variable for a chosen password: DEMO_<KEY>_PASSWORD. */
  key: string;
  role: Role;
  email: string;
  full_name: string;
  company_name: string;
}

export interface DemoJob {
  key: string;
  title: string;
  location: string;
  description: string;
  status: JobStatus;
}

export interface DemoApplication {
  job: string;
  stage: Stage;
  /** Days since the card entered its stage, so the board shows ages and stale cards. */
  daysInStage: number;
}

export interface DemoCandidate {
  full_name: string;
  email: string;
  phone: string;
  notes: string;
  applications: DemoApplication[];
}

export interface DemoCustomer {
  account: DemoAccount;
  jobs: DemoJob[];
  candidates: DemoCandidate[];
}

export const DEMO_ADMIN: DemoAccount = {
  key: "ADMIN",
  role: "admin",
  email: "admin@mini-ats.test",
  full_name: "Demo Admin",
  company_name: "Mini-ATS",
};

/** The first customer is the reviewers' customer login; the second shows a customer's data stays apart. */
export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    account: {
      key: "EXEMPELBYGG",
      role: "customer",
      email: "kund@exempelbygg.test",
      full_name: "Erik Exempel",
      company_name: "Exempelbygg AB",
    },
    jobs: [
      {
        key: "platschef",
        title: "Platschef",
        location: "Göteborg",
        description: "Leder våra byggprojekt på plats. Demojobb, inget riktigt uppdrag.",
        status: "open",
      },
      {
        key: "snickare",
        title: "Snickare",
        location: "Borås",
        description: "Nybyggnation och renovering. Demojobb, inget riktigt uppdrag.",
        status: "open",
      },
      {
        key: "projektledare",
        title: "Projektledare",
        location: "Kungsbacka",
        description: "Planerar och följer upp projekt. Demojobb, inget riktigt uppdrag.",
        status: "open",
      },
      {
        key: "kalkylator",
        title: "Kalkylator",
        location: "Göteborg",
        description: "Tjänsten är tillsatt. Demojobb, inget riktigt uppdrag.",
        status: "closed",
      },
    ],
    candidates: [
      {
        full_name: "Alva Exempelsson",
        email: "alva@exempel.test",
        phone: "070-174 06 10",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "platschef", stage: "new", daysInStage: 1 }],
      },
      {
        full_name: "Bo Provsson",
        email: "bo@exempel.test",
        phone: "070-174 06 11",
        notes: "Påhittad demokandidat.",
        applications: [
          { job: "platschef", stage: "screening", daysInStage: 3 },
          { job: "projektledare", stage: "new", daysInStage: 2 },
        ],
      },
      {
        full_name: "Cecilia Testberg",
        email: "cecilia@exempel.test",
        phone: "070-174 06 12",
        notes: "Påhittad demokandidat. Har legat länge i intervjusteget.",
        applications: [{ job: "platschef", stage: "interview", daysInStage: 18 }],
      },
      {
        full_name: "David Demosson",
        email: "david@exempel.test",
        phone: "070-174 06 13",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "platschef", stage: "offer", daysInStage: 4 }],
      },
      {
        full_name: "Eva Fiktiv",
        email: "eva@exempel.test",
        phone: "070-174 06 14",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "snickare", stage: "hired", daysInStage: 9 }],
      },
      {
        full_name: "Filip Låtsasson",
        email: "filip@exempel.test",
        phone: "070-174 06 15",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "snickare", stage: "rejected", daysInStage: 6 }],
      },
      {
        full_name: "Greta Övningsdotter",
        email: "greta@exempel.test",
        phone: "070-174 06 16",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "snickare", stage: "screening", daysInStage: 15 }],
      },
      {
        full_name: "Hugo Prov",
        email: "hugo@exempel.test",
        phone: "",
        notes: "",
        applications: [{ job: "projektledare", stage: "interview", daysInStage: 2 }],
      },
      {
        full_name: "Ines Exempel",
        email: "ines@exempel.test",
        phone: "070-174 06 18",
        notes: "Påhittad demokandidat, inte kopplad till något jobb än.",
        applications: [],
      },
    ],
  },
  {
    account: {
      key: "STUDIO",
      role: "customer",
      email: "kund@studioexempel.test",
      full_name: "Sara Exempel",
      company_name: "Studio Exempel",
    },
    jobs: [
      {
        key: "designer",
        title: "UX-designer",
        location: "Stockholm",
        description: "Formger digitala tjänster. Demojobb, inget riktigt uppdrag.",
        status: "open",
      },
      {
        key: "utvecklare",
        title: "Frontendutvecklare",
        location: "Distans",
        description: "Bygger webbgränssnitt. Demojobb, inget riktigt uppdrag.",
        status: "open",
      },
      {
        key: "praktikant",
        title: "Praktikant",
        location: "Stockholm",
        description: "Praktik under en termin. Demojobb, inget riktigt uppdrag.",
        status: "open",
      },
    ],
    candidates: [
      {
        full_name: "Jonna Testsson",
        email: "jonna@exempel.test",
        phone: "070-174 06 20",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "designer", stage: "new", daysInStage: 0 }],
      },
      {
        full_name: "Karl Påhitt",
        email: "karl@exempel.test",
        phone: "070-174 06 21",
        notes: "Påhittad demokandidat.",
        applications: [
          { job: "designer", stage: "interview", daysInStage: 5 },
          { job: "utvecklare", stage: "screening", daysInStage: 5 },
        ],
      },
      {
        full_name: "Lina Exempeldotter",
        email: "lina@exempel.test",
        phone: "070-174 06 22",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "utvecklare", stage: "offer", daysInStage: 21 }],
      },
      {
        full_name: "Max Demo",
        email: "max@exempel.test",
        phone: "070-174 06 23",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "utvecklare", stage: "hired", daysInStage: 30 }],
      },
      {
        full_name: "Nora Prov",
        email: "nora@exempel.test",
        phone: "070-174 06 24",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "praktikant", stage: "new", daysInStage: 2 }],
      },
      {
        full_name: "Oskar Test",
        email: "oskar@exempel.test",
        phone: "070-174 06 25",
        notes: "Påhittad demokandidat.",
        applications: [{ job: "praktikant", stage: "rejected", daysInStage: 3 }],
      },
    ],
  },
];

export const DEMO_ACCOUNTS: DemoAccount[] = [DEMO_ADMIN, ...DEMO_CUSTOMERS.map((c) => c.account)];
