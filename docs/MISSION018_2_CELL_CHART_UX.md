# Mission 018.2 — 16-Cell Chart Visualization Verification

- **Status:** Development complete; not deployed to production.
- **Branch:** `mission-018.2-cell-chart-ux`
- **Draft PR:** https://github.com/PicoPiece/pinlab-batterylifecycleapp/pull/4
- **Production target investigated read-only:** https://pinlab-app.picopiece.com/batteries/17?tab=analytics

## 1. Root cause

The chart is not dropping series. Production data contains legitimate groups of
cells with identical voltages, so their lines overlap visually.

Latest production sample at investigation time (PostgreSQL row 536,
`GW-000001:boot25:375`):

```text
cell values:
[3280, 3280, 3280, 3280, 3281, 3280, 3281, 3281,
 3280, 3280, 3281, 3280, 3281, 3280, 3280, 3278]

groups:
3278 mV × 1
3280 mV × 10
3281 mV × 5

min 3278 mV · max 3281 mV · average 3280.19 mV · delta 3 mV
```

Therefore the chart displays three visible voltage bands even though all
sixteen series are mounted.

## 2. Data and chart mapping verification

Read-only production API verification:

- `battery_id=17`
- `source=REAL_BMS`
- `gateway_id=GW-000001`
- API latest `id` and `message_id` matched PostgreSQL row 536
- `cell_voltages_mv[0]` = Cell 01
- `cell_voltages_mv[15]` = Cell 16
- API cell array exactly matched PostgreSQL
- 16 cells present
- 5 temperatures present
- min/max/average/delta matched values computed directly from the array
- 1h history: 358 points; every returned cell point has 16 values
- 24h history: 19 points; every returned cell point has 16 values

Chart DOM verification before the UX change:

- 16 `.recharts-line` components in the Cell chart
- 17 total `.recharts-line` across the Cell tab: 16 cell series plus one
  cell-delta chart series
- 16 checkboxes and all 16 checked in All 16 mode
- source mapping is `c1 … c16` → array indices `0 … 15`
- no duplicate `dataKey` values

Before screenshot: `docs/mission018_2/before-all16-chart.png`.
Raw investigation evidence: `docs/mission018_2/investigation.json`.

## 3. UX improvements

Implemented in the existing Recharts chart:

1. **Highlight without hiding other series**
   - Clicking a current cell no longer switches to a one-cell custom chart.
   - It keeps All 16 mode, selects/highlights the cell, and retains all 16
     series.
   - The selected line is rendered above the others, with width `3.2` and
     full opacity.
   - Non-selected lines are dimmed to `stroke-opacity 0.22`.

2. **Synchronized cell tooltip**
   - Shows every visible cell ID and actual mV value, including identical
     values.
   - Marks the selected cell.
   - Shows min/max cells.
   - Shows duplicate groups, e.g. “10 cells at 3,280 mV”.
   - In relative mode, values remain actual mV and include the Δ from the
     current timestamp average.

3. **Overlap explanation**
   - A chart note reports the number of distinct voltage levels across the
     16 cells and explains that overlapping lines are real data, not missing
     series.

4. **Optional Relative Voltage mode**
   - Toggle “So với TB / Relative to avg”.
   - Chart series use `cell_voltage_mv - average_cell_voltage_mv` at the same
     timestamp.
   - Absolute cell voltage and relative delta are both preserved in the
     tooltip.
   - Absolute mode remains the default.

5. **Existing modes preserved**
   - Min/Max/Avg summary
   - All 16
   - Individual checkboxes/custom selection
   - Min/Max overlay for a selected absolute series
   - Cell delta chart
   - 1h / 24h / 7d ranges

6. **Mobile**
   - Controls wrap without horizontal overflow.
   - Tooltip is height-bounded and scrollable.
   - 360/390/430 px viewports verified at 0 px horizontal overflow; only one Overview chart is shown at a time on mobile.
- Cell selection is collapsed behind a `Cell (n/16)` control on mobile; all 16 current readings remain available.

No chart library was added and no animation loop was introduced.

## 4. Diagnostic evidence API (AI-ready foundation)

Added a read-only, authenticated, battery-authorized endpoint:

```text
GET /api/v1/batteries/{battery_id}/telemetry/evidence?range=1h|24h|7d
```

Contract version: `diagnostic-evidence-v1`.

The response contains:

- battery/asset/organization/classification metadata;
- Gateway/slot/source/protocol/time-quality provenance;
- bounded from/to range and expected 10-second interval;
- effective assignment-based monitoring window and completeness basis;
- sample count, expected sample count and data completeness;
- pack voltage/current/SOC/capacity min/max/avg/stddev and peak absolute current;
- per-cell min/max/avg/stddev with one-based cell indices;
- per-sample cell-delta statistics;
- per-temperature-sensor min/max/avg/stddev and overall temperature range;
- measurement gaps over a documented 30-second threshold, capped at 100;
- explicit limitations and verified-source-only flag.

All statistics are calculated in PostgreSQL for production; a bounded SQLite
fallback serves tests. No new database, vector store or AI service was added.
No long-term raw telemetry persistence was introduced.

Example sorted JSON: `docs/mission018_2/example-evidence.json` (clearly labelled
as an illustrative local-copy output, not a production evidence record).

### Completeness correction from review

The initial development version compared observed samples against the full
requested range. That incorrectly counted the time before the active Gateway
assignment (and any pre-monitoring period) as an outage.

Review fix:

- `monitoring_from_at = max(from_at, assigned_at)`
- `monitoring_to_at = min(to_at, unassigned_at or to_at)`
- `expected_sample_count` uses that effective window, not the raw range
- `completeness_basis = "active_gateway_assignment_window"` or an explicit
  no-window reason
- no active assignment yields zero expected samples and an explicit basis,
  rather than an artificial outage percentage
- raw retention remains bounded by the requested 1h/24h/7d range

### Definitions

- `cell_delta_mv(t) = max(cell_voltages_mv[t]) - min(cell_voltages_mv[t])`,
  calculated per raw timestamp before range statistics.
- `relative_cell_voltage_mv(t, i) = cell_voltage_mv(t, i) - mean(all cells at t)`.
- `peak_abs_current_a = max(abs(pack_current_a))`; polarity is not interpreted.
- `data_completeness_pct` compares observed samples with an expected 10-second
  cadence over the effective `monitoring_from_at`/`monitoring_to_at` window,
  capped at 100%; pre-assignment periods are not counted as outages.
- A gap is a consecutive measured-at interval greater than 30 seconds; no
  interpolation is performed.

## 5. Mobile technician-first changes

- Cell checkboxes are collapsed behind a `Cell (n/16)` control below 640px;
  all 16 current-value cards remain available.
- Overview switches to one selectable main chart at a time on mobile
  (SOC/voltage/current/delta); desktop retains the synchronized multi-chart
  overview.
- Health/connection card is ordered before the specification card on mobile.
- Touch targets are at least 40px for the primary controls.
- Tooltip height is bounded and scrollable; no horizontal overflow at 390px.
- History already uses grouped pack/cells/temperature panels.

## 6. Regression tests

Backend tests: **64 passed**.

Frontend tests: **14 passed**.

Covered:

- 16 unique `c1…c16` data keys
- Cell 01 / index 0 and Cell 16 / index 15 mapping
- all 16 identical voltages
- multiple voltage groups
- 16 distinct voltages
- missing cell values remain `null`, never synthesized
- one diverging cell
- relative voltage computed from the same timestamp average
- identical-value grouping

Mission 018.2 E2E: **5/5 passed**.

Covered:

- production All 16 chart renders 16 cell lines (+ 1 delta line)
- overlap explanation is visible
- clicking a cell keeps all 16 checked/rendered
- synchronized tooltip contains all visible IDs, actual values and duplicate
  explanation
- relative mode displays actual voltage + Δ in tooltip
- mobile cells tab has 0 horizontal overflow

Existing Mission 018 regression E2E **12/12** and Mission 018.1 regression E2E **4/4** remain intact.

## 7. Before / after evidence

- Before, production:
  - `docs/mission018_2/before-all16-chart.png`
  - `docs/mission018_2/before-all16-controls.png`
- After, local production-copy:
  - `docs/mission018_2/after-all16-chart.png`
  - `docs/mission018_2/after-all16-controls.png`
  - `docs/mission018_2/after-overlap-note.png`
  - `docs/mission018_2/after-highlight-chart.png`
  - `docs/mission018_2/after-tooltip-all-cells.png`
  - `docs/mission018_2/after-relative-tooltip.png`
  - `docs/mission018_2/after-mobile-cells.png`
  - `docs/mission018_2/after-mobile-overview-360.png`
  - `docs/mission018_2/after-mobile-overview-430.png`
- E2E result: `docs/mission018_2/e2e-result.json`
- Contract example: `docs/mission018_2/example-evidence.json`

The after chart intentionally still shows overlapping bands: absolute voltages
are preserved. The selected-line highlight, dimming, tooltip completeness and
relative mode make the overlap inspectable without fabricating vertical
offsets.

## 8. Performance and safety

Before/after implementation observations:

- No additional chart library.
- Telemetry chunk: ~388.0 KB before → ~394.5 KB after the UX, tooltip and
  evidence-panel code.
- All 16 series remain mounted; the Cell-tab total is 17 DOM lines before
  selection (16 cells + delta chart), and 18 after a selected cell adds its
  min/max overlays.
- Diagnostic evidence API on the local isolated copy:
  - 1h: ~82 ms / ~5.2 KB / 603 samples
  - 24h: ~437 ms / ~5.2 KB / 9,208 samples
  - 7d: ~2.5 s / ~5.2 KB / 61,048 samples
  - 60,480-sample synthetic benchmark: all stats bounded; ~2.5s on-demand
  - Query plans: pack scan ~47 ms; gap window ~70 ms using the measured-at
    index; 16-cell expansion/aggregation ~444 ms
- Browser production-copy navigation: ~2.2 s; 24h chart visible ~0.5 s.
- Server idle observations (local stack): backend ~80 MB, DB ~37 MB.
- Sensitive production data was read-only.
- No production schema, ingestion, ESP32, MQTT, Gateway assignment or data
  mutation occurred.
- No production deployment was performed for this mission.

## 9. Git

- Branch: `mission-018.2-cell-chart-ux`
- Draft PR: https://github.com/PicoPiece/pinlab-batterylifecycleapp/pull/4
- No production deployment until CTO approval.
