import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { Logo } from "@/components/layout/Logo";
import { getI18n } from "@/lib/i18n";

function renderLogo() {
  return render(
    <I18nextProvider i18n={getI18n("sv")}>
      <Logo />
    </I18nextProvider>,
  );
}

describe("Logo", () => {
  it("shows the product name once, with the mark hidden from screen readers", () => {
    const { container } = renderLogo();
    expect(screen.getByText("Mini-ATS")).toBeTruthy();
    const mark = container.querySelector("svg");
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toBe("Mini-ATS");
  });

  it("draws the mark in theme colours, never hex", () => {
    const { container } = renderLogo();
    const shapes = [...container.querySelectorAll("rect")];
    expect(shapes).toHaveLength(10);
    for (const shape of shapes) {
      expect(shape.getAttribute("fill")).toBeNull();
      expect(shape.getAttribute("class")).toMatch(/^fill-primary(-foreground(\/\d+)?)?$/);
    }
  });
});
