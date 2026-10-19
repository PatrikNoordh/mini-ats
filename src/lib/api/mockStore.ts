import { MOCK_DELAY_MS } from "@/lib/constants";
import type { Application, Candidate, Job, Profile, Stage } from "@/types";

// In-memory mock store. Replaced by Supabase later; only src/lib/api/* may import this.

interface Store {
  profiles: Profile[];
  passwords: Record<string, string>;
  jobs: Job[];
  candidates: Candidate[];
  applications: Application[];
}

export const DEMO_PASSWORD = "demo1234";

let store: Store | null = null;

export function db(): Store {
  if (!store) store = seed();
  return store;
}

export const delay = (ms = MOCK_DELAY_MS) => new Promise((r) => setTimeout(r, ms));

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const STAGE_ORDER: Stage[] = ["new", "screening", "interview", "offer", "hired", "rejected"];

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000 - 3_600_000).toISOString();
}

function slug(name: string) {
  return name
    .split(" ")[0]!
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function seed(): Store {
  const profiles: Profile[] = [
    {
      id: "p_admin",
      role: "admin",
      full_name: "Demo Admin",
      company_name: "Plattformen",
      email: "admin@demo.test",
      created_at: "2026-10-01T08:00:00.000Z",
    },
    {
      id: "p_nordkust",
      role: "customer",
      full_name: "Karin Exempel",
      company_name: "Nordkust Bygg AB",
      email: "karin@nordkust.test",
      created_at: "2026-10-02T08:00:00.000Z",
    },
    {
      id: "p_lumen",
      role: "customer",
      full_name: "Oskar Testsson",
      company_name: "Studio Lumen",
      email: "oskar@lumen.test",
      created_at: "2026-10-03T08:00:00.000Z",
    },
  ];
  const passwords = Object.fromEntries(profiles.map((p) => [p.id, DEMO_PASSWORD]));

  const jobDefs: Record<string, [string, string, Job["status"]][]> = {
    p_nordkust: [
      ["Platschef", "Göteborg", "open"],
      ["Arbetsledare mark", "Kungsbacka", "open"],
      ["Anläggningsarbetare", "Göteborg", "open"],
      ["Projektingenjör", "Varberg", "closed"],
    ],
    p_lumen: [
      ["UX-designer", "Stockholm", "open"],
      ["Frontendutvecklare", "Distans", "open"],
      ["Projektledare", "Stockholm", "open"],
      ["Copywriter", "Malmö", "closed"],
    ],
  };
  const names: Record<string, string[]> = {
    p_nordkust: [
      "Alva Provsson",
      "Bertil Demosson",
      "Cecilia Låtsas",
      "David Fiktiv",
      "Elin Exempelsdotter",
      "Filip Prototyp",
      "Greta Testberg",
      "Hugo Mockström",
      "Ida Påhittad",
      "Jonny Dummy",
      "Klara Skissén",
      "Lars Utkast",
      "Maja Placeholder",
      "Nils Fejkman",
      "Olivia Provberg",
    ],
    p_lumen: [
      "Petra Påhitt",
      "Quentin Testare",
      "Rut Mocksson",
      "Sven Skenbar",
      "Tove Exempel",
      "Ulf Utkastsson",
      "Vera Låtsasdotter",
      "Wilma Fiktivsson",
      "Axel Dummysson",
      "Bodil Prov",
      "Carl Placeholder",
      "Disa Demo",
      "Einar Fejk",
      "Frida Skiss",
      "Gustav Testlund",
    ],
  };

  const jobs: Job[] = [];
  const candidates: Candidate[] = [];
  const applications: Application[] = [];

  for (const customerId of ["p_nordkust", "p_lumen"]) {
    const cJobs = jobDefs[customerId]!.map(([title, location, status], i) => {
      const job: Job = {
        id: `${customerId}_job${i + 1}`,
        customer_id: customerId,
        title,
        description: `Vi söker en ${title.toLowerCase()} till vårt team i ${location}.`,
        location,
        status,
        created_at: daysAgo(40 - i * 3),
      };
      jobs.push(job);
      return job;
    });

    names[customerId]!.forEach((full_name, i) => {
      const cand: Candidate = {
        id: `${customerId}_cand${i + 1}`,
        customer_id: customerId,
        full_name,
        email: `${slug(full_name)}@exempel.test`,
        phone: `070-000 00 ${String(i + 10).padStart(2, "0")}`,
        linkedin_url: `https://www.linkedin.com/in/${slug(full_name)}-exempel`,
        notes:
          i % 3 === 0
            ? "Påhittad kandidat för demo. Stark referens från tidigare arbetsgivare."
            : "",
        created_at: daysAgo(30 - i),
      };
      candidates.push(cand);

      const links: [number, Stage][] = [[i % cJobs.length, STAGE_ORDER[i % 6]!]];
      if (i % 5 === 0) links.push([(i + 1) % cJobs.length, STAGE_ORDER[(i + 1) % 6]!]);
      links.forEach(([jobIdx, stage], k) => {
        const changed = daysAgo(((i * 7 + k * 3) % 24) + 1);
        applications.push({
          id: `${cand.id}_app${k + 1}`,
          customer_id: customerId,
          job_id: cJobs[jobIdx]!.id,
          candidate_id: cand.id,
          stage,
          position: i,
          stage_changed_at: changed,
          created_at: cand.created_at,
          updated_at: changed,
        });
      });
    });
  }

  return { profiles, passwords, jobs, candidates, applications };
}
