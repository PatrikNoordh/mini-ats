import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  MouseSensor,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  DRAG_MOUSE_DISTANCE_PX,
  DRAG_TOUCH_DELAY_MS,
  DRAG_TOUCH_TOLERANCE_PX,
  STALE_CARD_DAYS,
} from "@/lib/constants";
import { useFormat } from "@/lib/format";
import { daysSince, neighbourStageId, STAGE_DOT_CLASS, stageLabel } from "@/lib/stages";
import type { Application, PipelineStage } from "@/types";

export interface BoardCard {
  app: Application;
  candidateName: string;
  jobTitle: string;
}

/** Space picks a card up and drops it. Enter is left free to open the card. */
const KEYBOARD_CODES = {
  start: [KeyboardCode.Space],
  cancel: [KeyboardCode.Esc],
  end: [KeyboardCode.Space, KeyboardCode.Tab],
};

/**
 * How far each arrow key moves a picked-up card or column: one column left or right, never up or
 * down.
 */
const ARROW_STEPS: Partial<Record<string, -1 | 0 | 1>> = {
  [KeyboardCode.Left]: -1,
  [KeyboardCode.Right]: 1,
  [KeyboardCode.Up]: 0,
  [KeyboardCode.Down]: 0,
};

/**
 * Moves a picked-up card, or a picked-up column, to the middle of the next column instead of a few
 * pixels at a time. `stages` is the board's columns in order; each column's droppable id is its
 * stage id.
 */
function columnCoordinates(stages: readonly Pick<PipelineStage, "id">[]): KeyboardCoordinateGetter {
  return (event, { context, currentCoordinates }) => {
    const step = ARROW_STEPS[event.code];
    if (step === undefined) return undefined;
    event.preventDefault(); // the arrow keys must not scroll the page while a card is held
    const over = context.over?.id;
    const target =
      step && typeof over === "string" ? neighbourStageId(stages, over, step) : undefined;
    const rect = target && context.droppableRects.get(target);
    if (!rect || !context.collisionRect) return undefined;
    return {
      x: rect.left + (rect.width - context.collisionRect.width) / 2,
      y: currentCoordinates.y,
    };
  };
}

function CardBody({ card, dragging }: { card: BoardCard; dragging?: boolean }) {
  const { t } = useTranslation();
  const days = daysSince(card.app.stage_changed_at);
  return (
    <div
      className={cn(
        "rounded-md border bg-card px-3 py-2 shadow-xs",
        dragging && "shadow-lg ring-2 ring-primary",
      )}
    >
      <div className="truncate text-sm font-semibold">{card.candidateName}</div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{card.jobTitle}</span>
        <span
          className={cn("shrink-0 font-mono", days >= STALE_CARD_DAYS && "text-destructive")}
          title={t("pipeline.daysInStage")}
        >
          {t("pipeline.days", { count: days })}
        </span>
      </div>
    </div>
  );
}

function DraggableCard({ card, onOpen }: { card: BoardCard; onOpen: (c: BoardCard) => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.app.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "cursor-grab touch-manipulation select-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isDragging && "opacity-30",
      )}
      {...listeners}
      {...attributes}
      aria-label={t("pipeline.cardLabel", {
        name: card.candidateName,
        job: card.jobTitle,
        count: daysSince(card.app.stage_changed_at),
      })}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        listeners?.["onKeyDown"]?.(e);
        if (e.key === "Enter" && !isDragging) onOpen(card);
      }}
    >
      <CardBody card={card} />
    </div>
  );
}

/**
 * One column: a place to drop cards, and itself sortable by its header (ATS-41). The header is the
 * handle, so a card dragged inside the column never moves the column.
 */
function Column({
  stage,
  cards,
  onOpen,
  menu,
  cardDragging,
  instructionsId,
}: {
  stage: PipelineStage;
  cards: BoardCard[];
  onOpen: (c: BoardCard) => void;
  menu: ReactNode;
  /** A card, not a column, is being dragged: only then does the column light up under it. */
  cardDragging: boolean;
  /** The column move instructions, read with the header. */
  instructionsId: string;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isOver,
    isDragging,
  } = useSortable({ id: stage.id });
  const headingId = useId();
  const label = stageLabel(stage, t);
  return (
    // Named after its stage, so a screen reader says which column a card is in.
    <div
      ref={setNodeRef}
      role="group"
      aria-labelledby={headingId}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex w-kanban-column shrink-0 flex-col rounded-lg border bg-column transition-colors",
        isOver && cardDragging && "border-primary bg-accent",
        isDragging && "relative z-10 shadow-lg ring-2 ring-primary",
      )}
    >
      <div className="flex items-center justify-between gap-1 px-3 py-2.5">
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("pipeline.columnHandle", { stage: label })}
          aria-describedby={instructionsId}
          className="flex min-w-0 flex-1 cursor-grab touch-manipulation select-none items-center gap-2 rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn("h-2 w-2 shrink-0 rounded-full", STAGE_DOT_CLASS[stage.colour])}
            aria-hidden="true"
          />
          <span id={headingId} className="truncate">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">{format.number(cards.length)}</span>
          {menu}
        </div>
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-1.5 px-2 pb-2">
        {cards.map((c) => (
          <DraggableCard key={c.app.id} card={c} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

export function Board({
  stages,
  cards,
  onMove,
  onOpen,
  onReorder,
  columnMenu,
}: {
  /** The customer's columns, in board order. */
  stages: readonly PipelineStage[];
  cards: BoardCard[];
  onMove: (id: string, stageId: string) => void;
  onOpen: (c: BoardCard) => void;
  /** Saves the columns in a new order, as stage ids (ATS-41). */
  onReorder: (stageIds: string[]) => void;
  /** The menu on each column header, for editing the columns (ATS-40). */
  columnMenu?: ((stage: PipelineStage) => ReactNode) | undefined;
}) {
  const { t } = useTranslation();
  const instructionsId = useId();
  const coordinateGetter = useMemo(() => columnCoordinates(stages), [stages]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_MOUSE_DISTANCE_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: DRAG_TOUCH_DELAY_MS, tolerance: DRAG_TOUCH_TOLERANCE_PX },
    }),
    useSensor(KeyboardSensor, {
      keyboardCodes: KEYBOARD_CODES,
      coordinateGetter,
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = cards.find((c) => c.app.id === activeId);

  const cardOf = (id: UniqueIdentifier) => cards.find((c) => c.app.id === id);
  const nameOf = (id: UniqueIdentifier) => cardOf(id)?.candidateName ?? "";
  const stageOf = (id: UniqueIdentifier | undefined) => stages.find((s) => s.id === id);
  const stageName = (id: UniqueIdentifier | undefined) => {
    const stage = stageOf(id);
    return stage ? stageLabel(stage, t) : "";
  };
  /** Where a column is or would land, counted from 1, for the announcements. */
  const place = (column: UniqueIdentifier, at: UniqueIdentifier | undefined = column) => ({
    stage: stageName(column),
    position: stages.findIndex((s) => s.id === at) + 1,
    count: stages.length,
  });
  const cancelled = (id: UniqueIdentifier) =>
    stageOf(id)
      ? t("pipeline.announceColumn.cancelled", place(id))
      : t("pipeline.announce.cancelled", {
          name: nameOf(id),
          stage: stageName(cardOf(id)?.app.stage_id),
        });
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      stageOf(active.id)
        ? t("pipeline.announceColumn.pickedUp", place(active.id))
        : t("pipeline.announce.pickedUp", {
            name: nameOf(active.id),
            stage: stageName(cardOf(active.id)?.app.stage_id),
          }),
    onDragOver: ({ active, over }) => {
      if (stageOf(active.id)) {
        return over ? t("pipeline.announceColumn.over", place(active.id, over.id)) : undefined;
      }
      return over
        ? t("pipeline.announce.over", { name: nameOf(active.id), stage: stageName(over.id) })
        : t("pipeline.announce.notOver", { name: nameOf(active.id) });
    },
    onDragEnd: ({ active, over }) => {
      if (!over) return cancelled(active.id);
      return stageOf(active.id)
        ? t("pipeline.announceColumn.dropped", place(active.id, over.id))
        : t("pipeline.announce.dropped", { name: nameOf(active.id), stage: stageName(over.id) });
    },
    onDragCancel: ({ active }) => cancelled(active.id),
  };

  // A column snaps to the nearest column; a card drops on the column it overlaps most.
  const collisionDetection: CollisionDetection = (args) =>
    stageOf(args.active.id) ? closestCenter(args) : rectIntersection(args);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const ids = stages.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    if (from !== -1) {
      const to = over ? ids.indexOf(String(over.id)) : -1;
      if (to !== -1 && to !== from) onReorder(arrayMove(ids, from, to));
      return;
    }
    const card = cardOf(active.id);
    const stage = stageOf(over?.id);
    if (card && stage && card.app.stage_id !== stage.id) onMove(card.app.id, stage.id);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("pipeline.dragInstructions") },
      }}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <p id={instructionsId} className="sr-only">
        {t("pipeline.columnInstructions")}
      </p>
      <div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
        <SortableContext items={stages.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-3">
            {stages.map((s) => (
              <Column
                key={s.id}
                stage={s}
                cards={cards
                  .filter((c) => c.app.stage_id === s.id)
                  .sort((a, b) => a.app.position - b.app.position)}
                onOpen={onOpen}
                menu={columnMenu?.(s)}
                cardDragging={!!active}
                instructionsId={instructionsId}
              />
            ))}
          </div>
        </SortableContext>
      </div>
      <DragOverlay>{active ? <CardBody card={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
