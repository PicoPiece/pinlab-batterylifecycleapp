import type {
  BatteryStatus,
  EventType,
  InspectionResult,
  MeasurementMetric,
  Role,
  SpecificationStatus,
} from "./types";

export const batteryStatusLabels: Record<BatteryStatus, string> = {
  received: "Đã tiếp nhận",
  inspecting: "Đang kiểm tra",
  tested: "Đã kiểm thử",
  available: "Sẵn sàng",
  in_service: "Đang vận hành",
  second_life: "Tái sử dụng",
  retired: "Đã nghỉ",
  quarantined: "Cách ly",
};

export const specificationLabels: Record<SpecificationStatus, string> = {
  confirmed: "Đã xác nhận",
  partial: "Một phần",
  unknown: "Chưa xác định",
};

export const inspectionResultLabels: Record<InspectionResult, string> = {
  passed: "Đạt",
  failed: "Không đạt",
  conditional: "Có điều kiện",
  inconclusive: "Chưa kết luận",
};

export const metricLabels: Record<MeasurementMetric, string> = {
  soc: "SOC",
  soh: "SOH",
  voltage: "Điện áp",
  current: "Dòng điện",
  temperature: "Nhiệt độ",
};

export const eventLabels: Record<EventType, string> = {
  received: "Tiếp nhận",
  inspected: "Kiểm tra",
  tested: "Kiểm thử",
  repaired: "Sửa chữa",
  reused_second_life: "Tái sử dụng",
  retired: "Nghỉ hưu",
  status_changed: "Đổi trạng thái",
  measurement_recorded: "Ghi nhận đo",
  note: "Ghi chú",
};

export const roleLabels: Record<Role, string> = {
  admin: "Quản trị",
  technician: "Kỹ thuật viên",
  viewer: "Chỉ xem",
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (value === null || value === undefined) return "—";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
