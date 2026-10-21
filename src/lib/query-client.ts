import { QueryClient } from "@tanstack/react-query";

/**
 * The app's TanStack Query client. By default TanStack pauses a mutation while the browser is
 * offline and runs it when the network is back, so a save showed "Sparar…" with no error and
 * could land much later. Mutations run at once instead: offline they fail like any other failed
 * request, and the form shows its error and keeps the input. Queries keep the default: paused
 * offline and refetched when the network is back.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { mutations: { networkMode: "always" } } });
}
