import type { TelemetryHistory } from "../../types";

export interface ChartPoint {
  t: number;
  [key: string]: number | null;
}

export const CELL_COLORS = [
  "#0f766e", "#2563eb", "#b45309", "#7c3aed", "#0891b2", "#be123c",
  "#4d7c0f", "#c2410c", "#4338ca", "#0e7490", "#a21caf", "#15803d",
  "#b91c1c", "#0369a1", "#854d0e", "#6d28d9",
];

export const PACK_COLORS = {
  soc: "#0f766e",
  voltage: "#2563eb",
  current: "#b45309",
  delta: "#be123c",
  cellMin: "#64748b",
  cellMax: "#7c3aed",
  cellAvg: "#0f766e",
};

export function epochMs(value: string): number {
  return new Date(value).getTime();
}

function gapStepMs(history: TelemetryHistory): number {
  if (history.bucket_seconds > 0) return history.bucket_seconds * 1000;
  // Production publishes about every 10 seconds. A 30-second gap is a real
  // missing-data gap rather than normal scheduling jitter.
  return 30_000;
}

/**
 * Recharts draws a continuous line when the API only returns samples that
 * exist. Insert one null row at the start of a missing window so the line
 * visibly breaks instead of inventing a straight interpolation.
 */
export function insertNullGaps(rows: ChartPoint[], keys: string[], stepMs: number): ChartPoint[] {
  if (rows.length < 2) return rows;
  const result: ChartPoint[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const previous = rows[index - 1];
    if (previous && row.t - previous.t > stepMs * 2.5) {
      const gap: ChartPoint = { t: previous.t + stepMs };
      for (const key of keys) gap[key] = null;
      result.push(gap);
    }
    result.push(row);
  }
  return result;
}

export function packChartData(history: TelemetryHistory): ChartPoint[] {
  const rows: ChartPoint[] = history.pack.map((point) => ({
    t: epochMs(point.measured_at),
    soc: point.soc_pct,
    voltage: point.pack_voltage_v,
    current: point.pack_current_a,
    delta: point.cell_delta_mv,
    cellMin: point.cell_min_mv,
    cellMax: point.cell_max_mv,
    cellAvg: point.cell_avg_mv,
  }));
  return insertNullGaps(rows, ["soc", "voltage", "current", "delta", "cellMin", "cellMax", "cellAvg"], gapStepMs(history));
}

export function cellChartData(history: TelemetryHistory): ChartPoint[] {
  const rows: ChartPoint[] = history.cells.map((point) => {
    const row: ChartPoint = { t: epochMs(point.measured_at) };
    const numeric = Array.from({ length: 16 }, (_, index) => point.avg_mv[index])
      .filter((value): value is number => typeof value === "number");
    const average = numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;
    for (let index = 0; index < 16; index += 1) {
      const value = point.avg_mv[index] ?? null;
      row[`c${index + 1}`] = value;
      row[`min${index + 1}`] = point.min_mv[index] ?? null;
      row[`max${index + 1}`] = point.max_mv[index] ?? null;
      row[`r${index + 1}`] = typeof value === "number" && average !== null
        ? Number((value - average).toFixed(2))
        : null;
    }
    return row;
  });
  const keys = Array.from({ length: 16 }, (_, index) => [`c${index + 1}`, `min${index + 1}`, `max${index + 1}`, `r${index + 1}`]).flat();
  return insertNullGaps(rows, keys, gapStepMs(history));
}

export interface CellValueGroup {
  value: number;
  indices: number[];
}

export function groupCellValues(values: Array<number | null | undefined>): CellValueGroup[] {
  const groups = new Map<number, number[]>();
  values.forEach((value, index) => {
    if (typeof value !== "number") return;
    const indices = groups.get(value) ?? [];
    indices.push(index);
    groups.set(value, indices);
  });
  return Array.from(groups, ([value, indices]) => ({ value, indices })).sort((left, right) => left.value - right.value);
}

export function temperatureChartData(history: TelemetryHistory): ChartPoint[] {
  const rows: ChartPoint[] = history.temperatures.map((point) => {
    const row: ChartPoint = { t: epochMs(point.measured_at) };
    for (let index = 0; index < 5; index += 1) {
      row[`t${index + 1}`] = point.values_c[index] ?? null;
    }
    return row;
  });
  return insertNullGaps(rows, ["t1", "t2", "t3", "t4", "t5"], gapStepMs(history));
}

export function rangeLabelKey(range: "1h" | "24h" | "7d"): string {
  return `telemetry.range${range}`;
}
