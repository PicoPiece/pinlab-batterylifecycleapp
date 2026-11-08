import type { ReactNode } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateTime, formatNumber } from "../../format";
import { useI18n } from "../../i18n";
import type { TelemetryRange } from "../../types";
import type { ChartPoint } from "./telemetryUtils";
import { groupCellValues } from "./telemetryUtils";

export interface SeriesSpec {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
  width?: number;
  opacity?: number;
}

interface TooltipEntry {
  name?: string;
  value?: number | string | null;
  color?: string;
  dataKey?: string | number;
  payload?: ChartPoint;
}

interface TelemetryTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  unit: string;
}

function TelemetryTooltip({ active, payload, label, unit }: TelemetryTooltipProps) {
  if (!active || !payload?.length || label === undefined) return null;
  const values = payload.filter((item) => item.value !== null && item.value !== undefined);
  if (!values.length) {
    return (
      <div className="telemetry-tooltip">
        <strong>{formatDateTime(new Date(Number(label)).toISOString())}</strong>
        <span className="muted">No data</span>
      </div>
    );
  }
  return (
    <div className="telemetry-tooltip">
      <strong>{formatDateTime(new Date(Number(label)).toISOString())}</strong>
      {values.map((item) => (
        <div className="telemetry-tooltip-row" key={String(item.dataKey ?? item.name)}>
          <span className="telemetry-tooltip-name">
            <i style={{ background: item.color }} />{item.name}
          </span>
          <b>{formatNumber(Number(item.value), unit ? ` ${unit}` : "")}</b>
        </div>
      ))}
    </div>
  );
}

interface CellTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  selectedCell: number | null;
  cellKeys?: number[];
  relativeMode?: boolean;
}

function CellTooltip({ active, payload, label, selectedCell, cellKeys, relativeMode = false }: CellTooltipProps) {
  const { t } = useI18n();
  if (!active || !payload?.length || label === undefined) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const keys = cellKeys?.length ? cellKeys : Array.from({ length: 16 }, (_, index) => index);
  const values = keys
    .map((index) => ({ index, value: row[`c${index + 1}`] }))
    .filter((item): item is { index: number; value: number } => typeof item.value === "number");
  if (!values.length) {
    return (
      <div className="telemetry-tooltip">
        <strong>{formatDateTime(new Date(Number(label)).toISOString())}</strong>
        <span className="muted">{t("telemetry.noDataAtPoint")}</span>
      </div>
    );
  }
  const minimum = values.reduce((left, right) => (left.value <= right.value ? left : right));
  const maximum = values.reduce((left, right) => (left.value >= right.value ? left : right));
  const duplicateGroups = groupCellValues(values.map((item) => item.value)).filter((group) => group.indices.length > 1);
  return (
    <div className="telemetry-tooltip telemetry-tooltip-cell">
      <strong>{formatDateTime(new Date(Number(label)).toISOString())}</strong>
      {relativeMode ? <span className="telemetry-tooltip-note">{t("telemetry.relativeTooltipNote")}</span> : null}
      <div className="telemetry-tooltip-summary">
        <span>{t("telemetry.min")} · C{minimum.index + 1} <b>{formatNumber(minimum.value, " mV")}</b></span>
        <span>{t("telemetry.max")} · C{maximum.index + 1} <b>{formatNumber(maximum.value, " mV")}</b></span>
      </div>
      <div className="telemetry-tooltip-cell-list">
        {values.map(({ index, value }) => (
          <div className={`telemetry-tooltip-row${selectedCell === index ? " is-selected" : ""}`} key={index}>
            <span className="telemetry-tooltip-name"><i style={{ background: "#0f766e" }} />{t("telemetry.cellNumber", { n: String(index + 1).padStart(2, "0") })}</span>
            <b>{formatNumber(value, " mV")}{relativeMode ? ` (${formatNumber(row[`r${index + 1}`], " mV")} Δ)` : ""}</b>
          </div>
        ))}
      </div>
      {duplicateGroups.length ? (
        <div className="telemetry-tooltip-note">
          {duplicateGroups.map((group) => t("telemetry.overlapCount", {
            value: formatNumber(group.value, " mV"),
            n: group.indices.length,
          })).join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

function formatAxisTick(value: number, unit: string, span: number): string {
  if (!Number.isFinite(value)) return "";
  if (unit === "mV") return value.toFixed(span < 1 ? 2 : span < 10 ? 1 : 0);
  if (unit === "V") return value.toFixed(span < 0.01 ? 4 : 2);
  if (unit === "%") return value.toFixed(2);
  return value.toFixed(span < 0.1 ? 3 : 2);
}

function formatChartTick(value: number, range: TelemetryRange): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (range === "7d") {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

interface TelemetryChartProps {
  title: string;
  kicker?: string;
  unit: string;
  data: ChartPoint[];
  series: SeriesSpec[];
  range: TelemetryRange;
  syncId?: string;
  brush?: boolean;
  height?: number;
  cellTooltip?: boolean;
  selectedCell?: number | null;
  cellKeys?: number[];
  relativeMode?: boolean;
  footer?: ReactNode;
  showLegend?: boolean;
}

export function TelemetryChart({
  title,
  kicker,
  unit,
  data,
  series,
  range,
  syncId,
  brush = false,
  height = 240,
  cellTooltip = false,
  selectedCell = null,
  cellKeys,
  relativeMode = false,
  footer,
  showLegend = true,
}: TelemetryChartProps) {
  const numeric = data.flatMap((point) => series.map((item) => point[item.key]).filter((value): value is number => typeof value === "number"));
  const minimum = numeric.length ? Math.min(...numeric) : 0;
  const maximum = numeric.length ? Math.max(...numeric) : 1;
  const dataSpan = maximum - minimum;
  const span = dataSpan || Math.max(Math.abs(maximum) * 0.02, 1);
  const yDomain: [number, number] = [minimum - span * 0.08, maximum + span * 0.08];
  return (
    <section className="telemetry-chart-card">
      <div className="telemetry-chart-head">
        <div>
          {kicker ? <span className="eyebrow">{kicker}</span> : null}
          <h3>{title}</h3>
        </div>
        <span className="telemetry-chart-unit">{unit}</span>
      </div>
      {showLegend ? (
        <div className="telemetry-chart-legend" aria-label={title}>
          {series.slice(0, 8).map((item) => (
            <span key={item.key}>
              <i style={{ background: item.color }} />
              {item.name}
            </span>
          ))}
          {series.length > 8 ? <span className="muted">+{series.length - 8}</span> : null}
        </div>
      ) : null}
      <div className="telemetry-chart" style={{ height }}>
        {data.length === 0 ? (
          <div className="telemetry-chart-empty">No data in this range</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} syncId={syncId} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e8eef3" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value: number) => formatChartTick(value, range)}
                minTickGap={40}
                tick={{ fill: "#667085", fontSize: 10 }}
                axisLine={{ stroke: "#d9e2ea" }}
                tickLine={false}
              />
              <YAxis
                width={64}
                domain={yDomain}
                tickFormatter={(value: number) => formatAxisTick(value, unit, dataSpan)}
                tick={{ fill: "#667085", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickCount={5}
              />
              <Tooltip
                content={cellTooltip
                  ? <CellTooltip selectedCell={selectedCell} cellKeys={cellKeys} relativeMode={relativeMode} />
                  : <TelemetryTooltip unit={unit} />}
                cursor={{ stroke: "#98a2b3", strokeDasharray: "3 3" }}
                wrapperStyle={{ outline: "none" }}
              />
              {series.map((item) => (
                <Line
                  key={item.key}
                  type="linear"
                  dataKey={item.key}
                  name={item.name}
                  stroke={item.color}
                  strokeWidth={item.width ?? 1.6}
                  strokeOpacity={item.opacity ?? 1}
                  strokeDasharray={item.dashed ? "5 4" : undefined}
                  dot={false}
                  activeDot={cellTooltip ? false : { r: 3, strokeWidth: 0 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
              {brush ? (
                <Brush
                  dataKey="t"
                  height={20}
                  travellerWidth={6}
                  stroke="#98a2b3"
                  fill="#f8fafc"
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {footer ? <div className="telemetry-chart-foot">{footer}</div> : null}
    </section>
  );
}
