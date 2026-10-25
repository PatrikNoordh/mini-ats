import { useState } from "react";
import { useMoveApplication } from "@/hooks/useApplications";
import { otherOpenApplications } from "@/lib/stages";
import type { Application, Stage } from "@/types";

/**
 * Moves cards on the board, and after a saved move to Hired opens the prompt about the
 * candidate's other open cards (ATS-31). The move is done either way; the prompt only offers to
 * reject the other cards, and a failed hire never opens it. `applications` is every card of the
 * customer, not the filtered board, so a card in another job counts too.
 */
export function useHiredPrompt(
  customerId: string,
  applications: readonly Application[] | undefined,
) {
  const move = useMoveApplication(customerId);
  const [hired, setHired] = useState<Application | null>(null);
  const othersOf = (card: Application) => otherOpenApplications(applications ?? [], card);
  // Read on every render: the prompt closes by itself if the other cards moved or went meanwhile.
  const others = hired ? othersOf(hired) : [];

  const onMove = (id: string, stage: Stage) => {
    const card = applications?.find((a) => a.id === id);
    const prompt = stage === "hired" && card && othersOf(card).length > 0;
    // The promise, not mutate's callbacks, which fire only for the last of several quick moves.
    move.mutateAsync({ id, stage }).then(
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
