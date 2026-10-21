import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BoardFilters } from "@/components/pipeline/BoardFilters";
import { MAX_SEARCH_LENGTH } from "@/lib/constants";
import { getI18n } from "@/lib/i18n";

let root: Root | null = null;

function renderFilters(q?: string) {
  const onChange = vi.fn();
  const container = document.body.appendChild(document.createElement("div"));
  act(() => {
    root = createRoot(container);
    root.render(
      <I18nextProvider i18n={getI18n("sv")}>
        <BoardFilters jobs={[]} job={undefined} q={q} onChange={onChange} />
      </I18nextProvider>,
    );
  });
  return { container, onChange };
}

/** The control a label points at, through its `for` attribute. */
function controlFor(container: HTMLElement, text: string) {
  const label = [...container.querySelectorAll("label")].find((l) => l.textContent === text);
  if (!label?.htmlFor) throw new Error(`no label "${text}" with a for attribute`);
  return document.getElementById(label.htmlFor);
}

/** Types into a controlled input. React tracks the value itself, so set it the way typing does. */
function typeInto(input: HTMLElement | null, value: string) {
  if (!(input instanceof HTMLInputElement)) throw new Error("not an input");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("board filters", () => {
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = "";
  });

  it("gives the job filter and the search a label of their own, not only an aria-label", () => {
    const { container } = renderFilters();
    const jobFilter = controlFor(container, "Filtrera på jobb");
    const search = controlFor(container, "Sök kandidatnamn");
    expect(jobFilter).toHaveAttribute("role", "combobox");
    expect(search?.tagName).toBe("INPUT");
    expect(jobFilter).not.toHaveAttribute("aria-label");
    expect(search).not.toHaveAttribute("aria-label");
  });

  it("limits the search to the longest the URL keeps", () => {
    const { container } = renderFilters("Anna");
    const search = controlFor(container, "Sök kandidatnamn");
    expect(search).toHaveAttribute("maxlength", String(MAX_SEARCH_LENGTH));
    expect(search).toHaveValue("Anna");
  });

  it("filters as you type", () => {
    const { container, onChange } = renderFilters();
    typeInto(controlFor(container, "Sök kandidatnamn"), "An");
    expect(onChange).toHaveBeenLastCalledWith({ q: "An" });
  });

  it("removes the search from the URL when the field is emptied", () => {
    const { container, onChange } = renderFilters("Anna");
    typeInto(controlFor(container, "Sök kandidatnamn"), "");
    expect(onChange).toHaveBeenLastCalledWith({ q: undefined });
  });
});
