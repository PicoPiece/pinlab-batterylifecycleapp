import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpecBadge, StatusBadge } from "../components/StatusBadge";

describe("StatusBadge", () => {
  it("renders Vietnamese battery status label", () => {
    render(<StatusBadge status="inspecting" />);
    expect(screen.getByText("Đang kiểm tra")).toBeTruthy();
  });

  it("applies status-specific class", () => {
    const { container } = render(<StatusBadge status="second_life" />);
    expect(container.querySelector(".badge-second_life")).toBeTruthy();
  });
});

describe("SpecBadge", () => {
  it("renders unknown specification label", () => {
    render(<SpecBadge status="unknown" />);
    expect(screen.getByText("Chưa xác định")).toBeTruthy();
  });
});
