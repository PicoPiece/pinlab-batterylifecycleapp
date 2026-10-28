import type { BatteryStatus, SpecificationStatus } from "../types";
import { batteryStatusLabels, specificationLabels } from "../format";

export function StatusBadge({ status }: { status: BatteryStatus }) {
  return <span className={`badge badge-${status}`}>{batteryStatusLabels[status]}</span>;
}

export function SpecBadge({ status }: { status: SpecificationStatus }) {
  return <span className={`badge badge-spec-${status}`}>{specificationLabels[status]}</span>;
}
