import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { STAGE_DOT_CLASS, stageColourSchema, type StageRemoveBlock } from "@/lib/stages";
import type { StageColour } from "@/types";

/**
 * The menu on a column header (ATS-40): rename, pick a colour from the palette, and remove. While
 * the column cannot be removed, the remove item does nothing and says why, in the menu itself, so
 * it reads the same on a phone and to a screen reader.
 */
export function StageMenu({
  label,
  colour,
  removeBlock,
  onRename,
  onColour,
  onRemove,
}: {
  /** The column's name on screen. */
  label: string;
  colour: StageColour;
  removeBlock: StageRemoveBlock | null;
  onRename: () => void;
  onColour: (colour: StageColour) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  // Dialogs open after the menu has closed, so the menu does not take the focus back.
  const later = (action: () => void) => () => setTimeout(action, 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("stageEditor.menu", { stage: label })}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={later(onRename)}>
          <Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> {t("stageEditor.rename")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          {t("stageEditor.colour")}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={colour}
          onValueChange={(value) => {
            const picked = stageColourSchema.safeParse(value);
            if (picked.success && picked.data !== colour) onColour(picked.data);
          }}
        >
          {stageColourSchema.options.map((c) => (
            <DropdownMenuRadioItem key={c} value={c}>
              <span
                className={cn("mr-2 h-2.5 w-2.5 rounded-full", STAGE_DOT_CLASS[c])}
                aria-hidden="true"
              />
              {t(`stageColours.${c}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {/* Not `disabled`: Radix skips disabled items, and the keyboard must reach the hint. */}
        <DropdownMenuItem
          aria-disabled={removeBlock !== null}
          aria-describedby={removeBlock ? hintId : undefined}
          onSelect={(event) => {
            if (removeBlock) event.preventDefault();
            else later(onRemove)();
          }}
          className={cn(
            "text-destructive focus:text-destructive",
            removeBlock && "cursor-not-allowed opacity-50",
          )}
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> {t("stageEditor.remove")}
        </DropdownMenuItem>
        {removeBlock && (
          <p id={hintId} className="px-2 pb-1.5 text-xs text-muted-foreground">
            {t(`errors.${removeBlock}`)}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
