import { describe, expect, it } from "vitest";
import { formatBytes, formatDate, formatNumber, formatDateTime } from "../format";

describe("format helpers", () => {
  it("handles empty date values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });

  it("formats numbers without inventing precision", () => {
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(400, " V")).toContain("400");
  });

  it("formats byte sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });
});
