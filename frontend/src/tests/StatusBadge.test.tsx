import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { I18nProvider } from "../i18n";
import { SpecBadge, StatusBadge } from "../components/StatusBadge";

function renderWithI18n(node: ReactNode) {
  return render(<I18nProvider>{node}</I18nProvider>);
}

describe("StatusBadge", () => {
  it("renders Vietnamese battery status label", () => {
    renderWithI18n(<StatusBadge status="inspecting" />);
    expect(screen.getByText("Đang kiểm tra")).toBeTruthy();
  });

  it("applies status-specific class", () => {
    const { container } = renderWithI18n(<StatusBadge status="second_life" />);
    expect(container.querySelector(".badge-second_life")).toBeTruthy();
  });
});

describe("SpecBadge", () => {
  it("renders unknown specification label", () => {
    renderWithI18n(<SpecBadge status="unknown" />);
    expect(screen.getByText("Chưa xác định")).toBeTruthy();
  });
});
