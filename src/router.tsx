import { createRouter } from "@tanstack/react-router";
import { createQueryClient } from "./lib/query-client";
import { searchSerializer } from "./lib/search-params";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    ...searchSerializer,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
