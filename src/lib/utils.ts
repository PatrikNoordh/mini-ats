import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only drops a conflicting class (like shadcn's `w-full`) when it knows the
 * other one is the same kind. Register the size tokens from styles.css so they win.
 * src/test/theme-tokens.test.ts fails if a token in styles.css is missing here.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      w: [{ w: ["kanban-column", "filter", "filter-compact", "search"] }],
      "max-h": [{ "max-h": ["dialog"] }],
      "font-size": [{ text: ["nav"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
