import type { BatteryStatus, SpecificationStatus } from "../types";
import { useI18n } from "../i18n";

export function StatusBadge({ status }: { status: BatteryStatus }) {
  const { t } = useI18n();
  return <span className={`badge badge-${status}`}>{t(`status.${status}`)}</span>;
}

export function SpecBadge({ status }: { status: SpecificationStatus }) {
  const { t } = useI18n();
  return <span className={`badge badge-spec-${status}`}>{t(`spec.${status}`)}</span>;
}
