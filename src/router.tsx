import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { searchSerializer } from "./lib/search-params";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    ...searchSerializer,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
