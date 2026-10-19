import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  DRAG_MOUSE_DISTANCE_PX,
  DRAG_TOUCH_DELAY_MS,
  DRAG_TOUCH_TOLERANCE_PX,
  STALE_CARD_DAYS,
} from "@/lib/constants";
import { useFormat } from "@/lib/format";
import { daysSince, STAGES } from "@/lib/stages";
import type { Application, Stage } from "@/types";

export interface BoardCard {
  app: Application;
  candidateName: string;
  jobTitle: string;
}

const DOT: Record<Stage, string> = {
  new: "bg-stage-new",
  screening: "bg-stage-screening",
  interview: "bg-stage-interview",
  offer: "bg-stage-offer",
  hired: "bg-stage-hired",
  rejected: "bg-stage-rejected",
};

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
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.app.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("cursor-grab touch-manipulation select-none", isDragging && "opacity-30")}
      onClick={() => onOpen(card)}
      {...listeners}
      {...attributes}
    >
      <CardBody card={card} />
    </div>
  );
}

function Column({
  stage,
  cards,
  onOpen,
}: {
  stage: Stage;
  cards: BoardCard[];
  onOpen: (c: BoardCard) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-kanban-column shrink-0 flex-col rounded-lg border bg-column transition-colors",
        isOver && "border-primary bg-accent",
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={cn("h-2 w-2 rounded-full", DOT[stage])} />
          {t(`stages.${stage}`)}
        </div>
        <span className="text-xs text-muted-foreground">{format.number(cards.length)}</span>
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
  cards,
  onMove,
  onOpen,
}: {
  cards: BoardCard[];
  onMove: (id: string, stage: Stage) => void;
  onOpen: (c: BoardCard) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: DRAG_MOUSE_DISTANCE_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: DRAG_TOUCH_DELAY_MS, tolerance: DRAG_TOUCH_TOLERANCE_PX },
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = cards.find((c) => c.app.id === activeId);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const card = cards.find((c) => c.app.id === active.id);
    const stage = over.id as Stage;
    if (card && card.app.stage !== stage) onMove(card.app.id, stage);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
        <div className="flex gap-3">
          {STAGES.map((s) => (
            <Column
              key={s}
              stage={s}
              cards={cards
                .filter((c) => c.app.stage === s)
                .sort((a, b) => a.app.position - b.app.position)}
              onOpen={onOpen}
            />
          ))}
        </div>
      </div>
      <DragOverlay>{active ? <CardBody card={active} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
