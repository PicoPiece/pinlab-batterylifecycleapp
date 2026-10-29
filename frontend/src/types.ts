export type Role = "admin" | "technician" | "viewer";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export type BatteryStatus =
  | "received"
  | "inspecting"
  | "tested"
  | "available"
  | "in_service"
  | "second_life"
  | "retired"
  | "quarantined";

export type SpecificationStatus = "confirmed" | "partial" | "unknown";
export type MeasurementMetric = "soc" | "soh" | "voltage" | "current" | "temperature";
export type MeasurementSource = "manual" | "mock" | "bms_udan" | "inverter_modbus";
export type MeasurementQuality = "measured" | "estimated" | "unknown";
export type InspectionResult = "passed" | "failed" | "conditional" | "inconclusive";
export type EventType =
  | "received"
  | "inspected"
  | "tested"
  | "repaired"
  | "reused_second_life"
  | "retired"
  | "status_changed"
  | "measurement_recorded"
  | "note";

export interface Battery {
  id: number;
  asset_id: string;
  serial_number: string | null;
  manufacturer: string | null;
  model: string | null;
  chemistry: string | null;
  nominal_voltage_v: number | null;
  nominal_capacity_ah: number | null;
  initial_energy_kwh: number | null;
  status: BatteryStatus;
  specification_status: SpecificationStatus;
  source: string | null;
  received_at: string | null;
  notes: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  created_by_id: number;
  updated_by_id: number;
}

export interface Measurement {
  id: number;
  battery_id: number;
  metric: MeasurementMetric;
  value: number;
  unit: string;
  source: MeasurementSource;
  quality: MeasurementQuality;
  measured_at: string;
  notes: string | null;
  created_by_id: number;
  created_at: string;
}

export interface Inspection {
  id: number;
  battery_id: number;
  test_type: string;
  inspected_at: string;
  technician_id: number;
  measured_parameters: Record<string, unknown>;
  result: InspectionResult;
  notes: string | null;
  created_by_id: number;
  created_at: string;
  updated_at: string;
}

export interface LifecycleEvent {
  id: number;
  battery_id: number;
  event_type: EventType;
  event_at: string;
  actor_id: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Attachment {
  id: number;
  battery_id: number | null;
  inspection_id: number | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_id: number;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface StatusCount {
  status: BatteryStatus;
  count: number;
}

export interface BucketCount {
  bucket: string;
  count: number;
}

export interface RecentInspection {
  id: number;
  battery_id: number;
  asset_id: string;
  test_type: string;
  result: InspectionResult;
  inspected_at: string;
  technician: string;
}

export interface RecentEvent {
  id: number;
  battery_id: number;
  asset_id: string;
  event_type: EventType;
  event_at: string;
  actor: string;
}

export interface AttentionBattery {
  battery_id: number;
  asset_id: string;
  reasons: string[];
  severity: "high" | "review" | "data";
}

export interface FleetHealth {
  score: number;
  weighted_soh: number | null;
  data_coverage: number;
  inspection_currency: number;
  formula: string;
}

export interface DashboardSummary {
  total_batteries: number;
  by_status: StatusCount[];
  soc_available: number;
  soh_available: number;
  soc_distribution: BucketCount[];
  soh_distribution: BucketCount[];
  needs_attention: AttentionBattery[];
  recent_inspections: RecentInspection[];
  recent_events: RecentEvent[];
  fleet_health: FleetHealth;
}

export interface MeasurementSnapshot {
  metric: MeasurementMetric;
  value: number;
  unit: string;
  source: MeasurementSource;
  quality: MeasurementQuality;
  measured_at: string;
}

export interface BatteryLatestMeasurements {
  soc: MeasurementSnapshot | null;
  soh: MeasurementSnapshot | null;
  voltage: MeasurementSnapshot | null;
  current: MeasurementSnapshot | null;
  temperature: MeasurementSnapshot | null;
}

export interface BatteryPortfolioItem extends Battery {
  latest: BatteryLatestMeasurements;
  latest_measurement_at: string | null;
  last_inspection_at: string | null;
  inspection_count: number;
  evidence_count: number;
}

export interface InspectionSummary {
  id: number;
  battery_id: number;
  asset_id: string;
  test_type: string;
  result: InspectionResult;
  inspected_at: string;
  technician: string;
  notes: string | null;
  evidence_count: number;
}

export interface AdminPasswordResetResponse {
  temporary_password: string;
  user: User;
}

export interface ProviderInfo {
  name: string;
  mode: string;
  available: boolean;
  description: string;
}
