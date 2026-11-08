import { describe, expect, it } from "vitest";
import type { TelemetryHistory } from "../types";
import { cellChartData, groupCellValues, insertNullGaps, packChartData, temperatureChartData } from "../components/telemetry/telemetryUtils";

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
  it("keeps 16 unique cell keys and maps Cell 01/16 to index 0/15", () => {
    const data = history();
    const cells = cellChartData(data);
    const keys = Object.keys(cells[0]).filter((key) => /^c\d+$/.test(key)).sort((left, right) => Number(left.slice(1)) - Number(right.slice(1)));
    expect(keys).toEqual(Array.from({ length: 16 }, (_, index) => `c${index + 1}`));
    expect(new Set(keys).size).toBe(16);
    expect(cells[0].c1).toBe(3280);
    expect(cells[0].c16).toBe(3280);
  });

  it("computes relative voltage from the same timestamp average", () => {
    const data = history();
    data.cells[0].avg_mv = [3278, 3280, 3280, 3280, 3280, 3280, 3280, 3280, 3280, 3280, 3280, 3280, 3280, 3280, 3280, 3280];
    const cells = cellChartData(data);
    expect(cells[0].r1).toBe(-1.88);
    expect(cells[0].r2).toBe(0.13);
    expect(cells[0].c1).toBe(3278);
  });

  it("groups identical voltages without dropping cell indices", () => {
    const groups = groupCellValues([3280, 3280, 3281, 3280, null, 3281, 3278]);
    expect(groups).toEqual([
      { value: 3278, indices: [6] },
      { value: 3280, indices: [0, 1, 3] },
      { value: 3281, indices: [2, 5] },
    ]);
  });

  it("maps all-identical and missing cell readings without inventing values", () => {
    const data = history();
    data.cells[0].avg_mv = Array.from({ length: 16 }, () => 3280);
    const identical = cellChartData(data);
    expect(identical[0].c1).toBe(3280);
    expect(identical[0].c16).toBe(3280);
    expect(identical[0].r1).toBe(0);

    data.cells[0].avg_mv[5] = null;
    const missing = cellChartData(data);
    expect(missing[0].c6).toBeNull();
    expect(missing[0].r6).toBeNull();
    expect(missing[0].c5).toBe(3280);
  });

  it("handles all-identical, distinct, missing and one-diverging cell readings", () => {
    const allIdentical = groupCellValues(Array.from({ length: 16 }, () => 3280));
    expect(allIdentical).toHaveLength(1);
    expect(allIdentical[0].indices).toHaveLength(16);

    const distinct = groupCellValues(Array.from({ length: 16 }, (_, index) => 3275 + index));
    expect(distinct).toHaveLength(16);

    const missing = groupCellValues([3280, null, undefined, 3281]);
    expect(missing).toEqual([
      { value: 3280, indices: [0] },
      { value: 3281, indices: [3] },
    ]);

    const oneDiverging = groupCellValues([...Array.from({ length: 15 }, () => 3280), 3278]);
    expect(oneDiverging).toHaveLength(2);
    expect(oneDiverging[1]).toEqual({ value: 3280, indices: Array.from({ length: 15 }, (_, index) => index) });
  });

});
