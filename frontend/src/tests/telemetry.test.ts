import { describe, expect, it } from "vitest";
import type { TelemetryHistory } from "../types";
import { cellChartData, insertNullGaps, packChartData, temperatureChartData } from "../components/telemetry/telemetryUtils";

function history(overrides: Partial<TelemetryHistory> = {}): TelemetryHistory {
  const start = Date.UTC(2026, 10, 8, 12, 0, 0);
  return {
    battery_id: 17,
    asset_id: "PL-APESS-0001",
    range: "1h",
    from_at: new Date(start).toISOString(),
    to_at: new Date(start + 3600_000).toISOString(),
    bucket_seconds: 0,
    point_count: 2,
    pack: [
      {
        measured_at: new Date(start).toISOString(),
        pack_voltage_v: 52.53,
        pack_current_a: 0,
        soc_pct: 35.45,
        capacity_remaining_ah: 35.45,
        capacity_full_ah: 100,
        cell_min_mv: 3278,
        cell_max_mv: 3281,
        cell_avg_mv: 3280.38,
        cell_delta_mv: 3,
      },
      {
        measured_at: new Date(start + 90_000).toISOString(),
        pack_voltage_v: 52.53,
        pack_current_a: 0,
        soc_pct: 35.45,
        capacity_remaining_ah: 35.45,
        capacity_full_ah: 100,
        cell_min_mv: 3278,
        cell_max_mv: 3281,
        cell_avg_mv: 3280.38,
        cell_delta_mv: 3,
      },
    ],
    cells: [
      {
        measured_at: new Date(start).toISOString(),
        avg_mv: Array.from({ length: 16 }, () => 3280),
        min_mv: Array.from({ length: 16 }, () => 3278),
        max_mv: Array.from({ length: 16 }, () => 3281),
      },
      {
        measured_at: new Date(start + 90_000).toISOString(),
        avg_mv: Array.from({ length: 16 }, () => 3280),
        min_mv: Array.from({ length: 16 }, () => 3278),
        max_mv: Array.from({ length: 16 }, () => 3281),
      },
    ],
    temperatures: [
      { measured_at: new Date(start).toISOString(), values_c: [32.3, 29, 28.9, 29, 29.2] },
      { measured_at: new Date(start + 90_000).toISOString(), values_c: [32.4, 29.1, 29, 29.1, 29.3] },
    ],
    generated_at: new Date(start + 3600_000).toISOString(),
    ...overrides,
  };
}

describe("telemetry chart transforms", () => {
  it("inserts a null gap instead of interpolating missing data", () => {
    const rows = [
      { t: 0, value: 1 },
      { t: 120_000, value: 2 },
    ];
    const result = insertNullGaps(rows, ["value"], 30_000);
    expect(result).toHaveLength(3);
    expect(result[1]).toEqual({ t: 30_000, value: null });
  });

  it("builds 16 cell series and 5 temperature series", () => {
    const data = history();
    const cells = cellChartData(data);
    const temperatures = temperatureChartData(data);
    expect(cells[0].c1).toBe(3280);
    expect(cells[0].c16).toBe(3280);
    expect(cells[0].min5).toBe(3278);
    expect(temperatures[0].t1).toBe(32.3);
    expect(temperatures[0].t5).toBe(29.2);
  });

  it("carries pack delta and capacity into overview rows", () => {
    const data = packChartData(history());
    expect(data[0].delta).toBe(3);
    expect(data[0].voltage).toBe(52.53);
    expect(data[0].current).toBe(0);
  });
});
