import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSessionCheckOnNavigation } from "@/hooks/useSessionCheckOnNavigation";

const checkSession = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ checkSession }) }));

function Layout() {
  useSessionCheckOnNavigation();
  return <Outlet />;
}

/** A router with the layout and two pages, starting on /pipeline. */
function renderRouter() {
  const root = createRootRoute({ component: Layout });
  const page = (path: string) =>
    createRoute({ getParentRoute: () => root, path, component: () => <p>{path}</p> });
  const router = createRouter({
    routeTree: root.addChildren([page("/pipeline"), page("/jobs")]),
    history: createMemoryHistory({ initialEntries: ["/pipeline"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("checking the session on page changes", () => {
  it("does not check the first page, and checks each page change after it", async () => {
    const router = renderRouter();
    await screen.findByText("/pipeline");
    expect(checkSession).not.toHaveBeenCalled();

    await act(() => router.navigate({ to: "/jobs" }));
    await screen.findByText("/jobs");
    await waitFor(() => expect(checkSession).toHaveBeenCalledOnce());
  });
});
