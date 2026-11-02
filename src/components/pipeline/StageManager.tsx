import { Plus, RotateCcw } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { StageMenu } from "@/components/pipeline/StageMenu";
import { StageNameDialog } from "@/components/pipeline/StageNameDialog";
import { useErrorToast } from "@/hooks/useErrorToast";
import {
  useAddStage,
  useRemoveStage,
  useRenameStage,
  useResetStages,
  useSetStageColour,
} from "@/hooks/useStages";
import { MAX_PIPELINE_STAGES } from "@/lib/constants";
import { useFormat } from "@/lib/format";
import { resetBlockers, stageLabel, stageRemoveBlock, unusedColour } from "@/lib/stages";
import type { PipelineStage } from "@/types";

/**
 * Editing the customer's columns from the board (ATS-40): Add column and Reset columns above the
 * board, a menu on each column header, and the dialogs they open. An admin edits the active
 * customer's columns, the same way. Each button that cannot be used now says why, under it.
 *
 * `children` renders the board, and gets the menu for each column header.
 */
export function StageManager({
  customerId,
  stages,
  cardCounts,
  children,
}: {
  customerId: string;
  /** The customer's columns, in board order. */
  stages: readonly PipelineStage[];
  /** Every card of the customer per column, not the filtered board. */
  cardCounts: ReadonlyMap<string, number>;
  children: (columnMenu: (stage: PipelineStage) => ReactNode) => ReactNode;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const errorToast = useErrorToast();
  const add = useAddStage(customerId);
  const rename = useRenameStage(customerId);
  const setColour = useSetStageColour(customerId);
  const remove = useRemoveStage(customerId);
  const reset = useResetStages(customerId);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<PipelineStage | null>(null);
  const [removing, setRemoving] = useState<PipelineStage | null>(null);
  const [resetting, setResetting] = useState(false);
  const limitHintId = useId();
  const resetHintId = useId();

  const label = (stage: PipelineStage) => stageLabel(stage, t);
  const namesBut = (stage: PipelineStage | null) =>
    stages.filter((s) => s.id !== stage?.id).map(label);
  const atLimit = stages.length >= MAX_PIPELINE_STAGES;
  const blockers = resetBlockers(stages, cardCounts);
  const cannotReset = blockers.length > 0;

  const onRemove = async () => {
    if (!removing) return;
    try {
      await remove.mutateAsync(removing.id);
      toast.success(t("stageEditor.removed", { stage: label(removing) }));
    } catch (err) {
      errorToast(t("stageEditor.removeFailed"), err);
    } finally {
      setRemoving(null);
    }
  };

  const onReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success(t("stageEditor.resetDone"));
    } catch (err) {
      errorToast(t("stageEditor.resetFailed"), err);
    } finally {
      setResetting(false);
    }
  };

  const columnMenu = (stage: PipelineStage) => (
    <StageMenu
      label={label(stage)}
      colour={stage.colour}
      removeBlock={stageRemoveBlock(stage, stages, cardCounts)}
      onRename={() => setRenaming(stage)}
      onColour={(colour) =>
        setColour
          .mutateAsync({ id: stage.id, colour })
          .catch((err: unknown) => errorToast(t("stageEditor.colourFailed"), err))
      }
      onRemove={() => setRemoving(stage)}
    />
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={atLimit}
            aria-describedby={atLimit ? limitHintId : undefined}
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("stageEditor.add")}
          </Button>
          {atLimit && (
            <p id={limitHintId} className="mt-1 text-xs text-muted-foreground">
              {t("stageEditor.limitHint", { max: MAX_PIPELINE_STAGES })}
            </p>
          )}
        </div>
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={cannotReset}
            aria-describedby={cannotReset ? resetHintId : undefined}
            onClick={() => setResetting(true)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("stageEditor.reset")}
          </Button>
          {cannotReset && (
            <p id={resetHintId} className="mt-1 text-xs text-muted-foreground">
              {t("stageEditor.resetBlocked", {
                count: blockers.length,
                stages: format.list(blockers.map(label)),
              })}
            </p>
          )}
        </div>
      </div>

      {children(columnMenu)}

      <StageNameDialog
        open={adding}
        onOpenChange={setAdding}
        title={t("stageEditor.addTitle")}
        hint={t("stageEditor.addPlacement")}
        initialName=""
        takenNames={namesBut(null)}
        failedTitle={t("stageEditor.addFailed")}
        onSave={async (name) => {
          await add.mutateAsync({ name, colour: unusedColour(stages) });
          toast.success(t("stageEditor.added", { stage: name }));
        }}
      />
      <StageNameDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title={t("stageEditor.renameTitle")}
        initialName={renaming ? label(renaming) : ""}
        takenNames={namesBut(renaming)}
        failedTitle={t("stageEditor.renameFailed")}
        onSave={async (name) => {
          if (!renaming || name === label(renaming)) return;
          await rename.mutateAsync({ id: renaming.id, name });
          toast.success(t("stageEditor.renamed", { stage: name }));
        }}
      />
      <ConfirmDeleteDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("stageEditor.removeTitle")}
        description={t("stageEditor.removeDescription", {
          stage: removing ? label(removing) : "",
        })}
        busy={remove.isPending}
        onConfirm={onRemove}
      />
      <ConfirmDeleteDialog
        open={resetting}
        onOpenChange={setResetting}
        title={t("stageEditor.resetTitle")}
        description={t("stageEditor.resetDescription")}
        confirmLabel={reset.isPending ? t("stageEditor.resetting") : t("stageEditor.resetConfirm")}
        busy={reset.isPending}
        onConfirm={onReset}
      />
    </>
  );
}
