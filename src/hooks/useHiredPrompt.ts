import { useState } from "react";
import { useMoveApplication } from "@/hooks/useApplications";
import { otherOpenApplications } from "@/lib/stages";
import type { Application, PipelineStage } from "@/types";

/**
 * Moves cards on the board, and after a saved move to the Hired stage opens the prompt about the
 * candidate's other open cards (ATS-31). The move is done either way; the prompt only offers to
 * reject the other cards, and a failed hire never opens it. `applications` is every card of the
 * customer, not the filtered board, so a card in another job counts too. A stage counts by its
 * kind, not its name, so a renamed Hired stage still opens the prompt.
 */
export function useHiredPrompt(
  customerId: string,
  applications: readonly Application[] | undefined,
  stages: readonly PipelineStage[] | undefined,
) {
  const move = useMoveApplication(customerId);
  const [hired, setHired] = useState<Application | null>(null);
  const othersOf = (card: Application) =>
    otherOpenApplications(applications ?? [], card, stages ?? []);
  // Read on every render: the prompt closes by itself if the other cards moved or went meanwhile.
  const others = hired ? othersOf(hired) : [];

  const onMove = (id: string, stageId: string) => {
    const card = applications?.find((a) => a.id === id);
    const toHired = stages?.find((s) => s.id === stageId)?.kind === "hired";
    const prompt = toHired && card && othersOf(card).length > 0;
    // The promise, not mutate's callbacks, which fire only for the last of several quick moves.
    move.mutateAsync({ id, stageId }).then(
      () => {
        if (prompt) setHired(card);
      },
      () => {}, // The hook already shows the error and puts the card back.
    );
  };

  return {
    onMove,
    /** The card just hired while the prompt is open, or null. */
    hired: others.length > 0 ? hired : null,
    /** The candidate's other open cards, the ones the prompt offers to reject. */
    others,
    close: () => setHired(null),
  };
}
