import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { safeRedirect } from "@/lib/redirect";
import { routeTree } from "@/routeTree.gen";

describe("safeRedirect", () => {
  it("keeps a path inside the app with its search and hash", () => {
    expect(safeRedirect("/jobs")).toBe("/jobs");
    expect(safeRedirect("/pipeline?job=abc&q=anna")).toBe("/pipeline?job=abc&q=anna");
    expect(safeRedirect("/candidates#top")).toBe("/candidates#top");
  });

  it("rejects URLs to other sites", () => {
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "///evil.test",
      "/\\evil.test",
      "\\\\evil.test",
      "javascript:alert(1)",
      " /jobs",
      "/\t/evil.test",
      "jobs",
    ]) {
      expect(safeRedirect(value), value).toBeUndefined();
    }
  });

  it("rejects the login page itself and anything that is not a string", () => {
    expect(safeRedirect("/login")).toBeUndefined();
    expect(safeRedirect("/login?redirect=/jobs")).toBeUndefined();
    expect(safeRedirect(undefined)).toBeUndefined();
    expect(safeRedirect(42)).toBeUndefined();
    expect(safeRedirect("")).toBeUndefined();
  });
});

// Reads ?redirect= through the login route's validateSearch, without rendering the page.
function loginRouter(href = "/login") {
  return createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [href] }),
  });
}

function readRedirect(href: string) {
  const router = loginRouter(href);
  return router.matchRoutes(router.latestLocation).at(-1)?.search.redirect;
}

describe("?redirect= on the login page", () => {
  it("round-trips the page the user asked for", () => {
    const target = "/pipeline?job=c1_job1&q=Anna%20Berg";
    const location = loginRouter().buildLocation({ to: "/login", search: { redirect: target } });
    expect(readRedirect(location.href)).toBe(target);
  });

  it("brings the pipeline filters back unchanged", () => {
    // RequireAuth sends the router's own href for the page, as it was typed.
    const page = loginRouter("/pipeline?job=c1_job1&q=Anna%20Berg").latestLocation.href;
    const login = loginRouter().buildLocation({ to: "/login", search: { redirect: page } });
    const target = readRedirect(login.href);
    expect(target).toBeDefined();
    const router = loginRouter(target);
    expect(router.matchRoutes(router.latestLocation).at(-1)?.search).toMatchObject({
      job: "c1_job1",
      q: "Anna Berg",
    });
  });

  it("drops a URL to another site", () => {
    expect(readRedirect("/login?redirect=https%3A%2F%2Fevil.test")).toBeUndefined();
    expect(readRedirect("/login?redirect=%2F%2Fevil.test")).toBeUndefined();
    expect(readRedirect("/login")).toBeUndefined();
  });
});
