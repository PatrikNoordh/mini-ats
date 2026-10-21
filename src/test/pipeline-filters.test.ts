import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { MAX_SEARCH_LENGTH } from "@/lib/constants";
import { searchSerializer } from "@/lib/search-params";
import { routeTree } from "@/routeTree.gen";

// Reads the filters through the pipeline route's validateSearch and writes them
// with buildLocation, without loading or rendering the page.
function pipelineRouter(href = "/pipeline") {
  return createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
    ...searchSerializer,
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

  it("reads a value that looks like JSON as text instead of failing", () => {
    const search = readFilters('/pipeline?job={"a":1}&q=Anna');
    expect(search?.job).toBe('{"a":1}');
    expect(search?.q).toBe("Anna");
  });

  it("keeps a hand-typed search exactly as text", () => {
    for (const q of ["123", "0", "1e3", "12.50", "true", "false", "null", '"quoted"', "-5"]) {
      expect(readFilters(`/pipeline?q=${encodeURIComponent(q)}`)?.q, q).toBe(q);
    }
  });

  it("round-trips a search that looks like a number, boolean or null", () => {
    for (const q of ["1e3", "12.50", "true", "null"]) {
      const location = pipelineRouter().buildLocation({ to: "/pipeline", search: { q } });
      expect(location.searchStr).toBe(`?q=${q}`);
      expect(readFilters(location.href)?.q).toBe(q);
    }
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
