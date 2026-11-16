import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { AccountTable } from "@/components/accounts/AccountTable";
import { getI18n } from "@/lib/i18n";
import type { Profile } from "@/types";

const account = (id: string, fullName: string, email: string): Profile => ({
  id,
  role: "customer",
  full_name: fullName,
  company_id: "co",
  email,
  created_at: "2026-10-22T08:00:00Z",
  deleted_at: null,
});

function table(accounts: Profile[]) {
  const { container } = render(
    <I18nextProvider i18n={getI18n("en")}>
      <AccountTable accounts={accounts} onEdit={vi.fn()} />
    </I18nextProvider>,
  );
  const element = container.querySelector("table");
  if (!element) throw new Error("No table");
  return element;
}

describe("the account tables' columns (ATS-62)", () => {
  it("are fixed, with named widths for Role and Created, whatever the content", () => {
    const short = table([account("a", "Al", "a@x.test")]);
    const long = table([
      account("b", "Ett väldigt långt namn ".repeat(5), `${"lång".repeat(20)}@exempel.test`),
    ]);
    for (const t of [short, long]) {
      expect(t).toHaveClass("table-fixed");
      const headers = [...t.querySelectorAll("th")].map((th) => th.className);
      expect(headers[2]).toContain("w-account-role");
      expect(headers[3]).toContain("w-account-created");
      // Name and Email share the rest, so neither has a width of its own.
      expect(headers[0]).not.toMatch(/\bw-/);
      expect(headers[1]).not.toMatch(/\bw-/);
    }
  });

  it("wraps a long name and email instead of widening the column", () => {
    const email = `${"lång".repeat(20)}@exempel.test`;
    table([account("b", "Ett väldigt långt namn", email)]);
    for (const cell of screen.getAllByText(email))
      expect(cell.closest("td")).toHaveClass("wrap-anywhere");
  });

  it("takes its widths from tokens in styles.css", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/--width-account-role:\s*\S+;/);
    expect(css).toMatch(/--width-account-created:\s*\S+;/);
  });
});
