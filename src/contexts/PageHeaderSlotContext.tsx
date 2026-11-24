import { createContext, useContext } from "react";

/**
 * Where a page's header goes (ATS-67): the second row of the shell's top bar while the company
 * has a background image, so the title, its count and the main button sit in the white bar and
 * the image shows in the gap below it. Null otherwise, and the header stays in the page.
 */
export const PageHeaderSlotContext = createContext<HTMLElement | null>(null);

export function usePageHeaderSlot(): HTMLElement | null {
  return useContext(PageHeaderSlotContext);
}
