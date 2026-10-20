import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { Field } from "@/components/Field";
import { getI18n } from "@/lib/i18n";
import type { ValidationKey } from "@/lib/validation";

/** Renders a Field around an input and returns the input. */
function renderField(props: { hint?: string; error?: ValidationKey }) {
  document.body.innerHTML = renderToStaticMarkup(
    <I18nextProvider i18n={getI18n("en")}>
      <Field id="f-title" label="Title" {...props}>
        {(control) => <input {...control} />}
      </Field>
    </I18nextProvider>,
  );
  const input = document.querySelector("input");
  if (!input) throw new Error("Field did not render the control");
  return input;
}

/** The text of the elements aria-describedby points at, in order. */
function description(input: HTMLInputElement) {
  return (input.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent);
}

describe("Field", () => {
  it("labels the control and marks nothing when there is no hint or error", () => {
    const input = renderField({});
    expect(document.querySelector("label")?.getAttribute("for")).toBe("f-title");
    expect(input.id).toBe("f-title");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("links the error to the control and marks it invalid", () => {
    const input = renderField({ error: "title_required" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(description(input)).toEqual(["Enter a title."]);
  });

  it("links both the hint and the error", () => {
    const input = renderField({ hint: "At least 8 characters.", error: "title_required" });
    expect(description(input)).toEqual(["At least 8 characters.", "Enter a title."]);
  });
});
