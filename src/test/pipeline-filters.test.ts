import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { MAX_SEARCH_LENGTH } from "@/lib/constants";
import { routeTree } from "@/routeTree.gen";

// Reads the filters through the pipeline route's validateSearch and writes them
// with buildLocation, without loading or rendering the page.
function pipelineRouter(href = "/pipeline") {
  return createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: [href] }),
  });
}

function readFilters(href: string) {
  const router = pipelineRouter(href);
  return router.matchRoutes(router.latestLocation).at(-1)?.search;
}

describe("pipeline filters in the URL", () => {
  it("reads job and q from ?job=&q=", () => {
    expect(readFilters("/pipeline?job=c1_job1&q=Anna")).toMatchObject({
      job: "c1_job1",
      q: "Anna",
    });
  });

  it("reads no filters from a bare URL", () => {
    const search = readFilters("/pipeline");
    expect(search?.job).toBeUndefined();
    expect(search?.q).toBeUndefined();
  });

  it("drops a filter value that is not a string instead of failing", () => {
    const search = readFilters('/pipeline?job={"a":1}&q=Anna');
    expect(search?.job).toBeUndefined();
    expect(search?.q).toBe("Anna");
  });

  it("keeps a hand-typed numeric search as text", () => {
    expect(readFilters("/pipeline?q=123")?.q).toBe("123");
    expect(readFilters("/pipeline?q=0")?.q).toBe("0");
  });

  it("cuts a very long search to the longest the field allows", () => {
    const search = readFilters(`/pipeline?q=${"a".repeat(MAX_SEARCH_LENGTH + 50)}`);
    expect(search?.q).toHaveLength(MAX_SEARCH_LENGTH);
  });

  it("round-trips a numeric search typed into the field", () => {
    const location = pipelineRouter().buildLocation({ to: "/pipeline", search: { q: "123" } });
    expect(readFilters(location.href)?.q).toBe("123");
  });

  it("writes job and q to the URL", () => {
    const location = pipelineRouter().buildLocation({
      to: "/pipeline",
      search: { job: "c1_job1", q: "Anna Berg" },
    });
    const params = new URLSearchParams(location.searchStr);
    expect(location.pathname).toBe("/pipeline");
    expect(params.get("job")).toBe("c1_job1");
    expect(params.get("q")).toBe("Anna Berg");
  });

  it("removes a cleared filter from the URL", () => {
    const location = pipelineRouter().buildLocation({
      to: "/pipeline",
      search: { job: undefined, q: "Anna" },
    });
    expect(location.searchStr).not.toContain("job=");
  });

  it("round-trips: what is written is read back unchanged", () => {
    const filters = { job: "c2_job3", q: "Åsa Öberg & co" };
    const location = pipelineRouter().buildLocation({ to: "/pipeline", search: filters });
    expect(readFilters(location.href)).toMatchObject(filters);
  });
});
