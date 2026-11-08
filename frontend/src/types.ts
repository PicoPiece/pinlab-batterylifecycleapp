export type Role = "admin" | "technician" | "viewer";

export type OrganizationRole =
  | "pinlab_super_admin"
  | "pinlab_manager"
  | "pinlab_technician"
  | "agency_admin"
  | "agency_technician"
  | "viewer";

export interface AccessMembership {
  id: number;
  organization_id: number;
  organization_name: string;
  organization_slug: string;
  role: OrganizationRole;
  is_active: boolean;
}

export interface AccessInfo {
  user: User;
  is_super_admin: boolean;
  is_manager: boolean;
  is_agency_admin: boolean;
  can_write: boolean;
  can_create_battery: boolean;
  can_manage_access: boolean;
  memberships: AccessMembership[];
}

export interface Organization {
  id: number;
  slug: string;
  name: string;
  kind: "pinlab" | "agency";
  is_active: boolean;
  created_at: string;
}

export interface Membership {
  id: number;
  user_id: number;
  organization_id: number;
  organization_name: string;
  user_email: string;
  user_full_name: string;
  role: OrganizationRole;
  is_active: boolean;
  created_at: string;
}

export interface BatteryAssignment {
  id: number;
  battery_id: number;
  battery_asset_id: string;
  user_id: number;
  user_email: string;
  user_full_name: string;
  assigned_by_id: number;
  is_active: boolean;
  created_at: string;
  ended_at: string | null;
}

export interface SecurityAuditEvent {
  id: number;
  actor_id: number;
  actor_email: string;
  actor_full_name: string;
  organization_id: number | null;
  action: string;
  target_type: string;
  target_id: number | null;
  event_metadata: Record<string, unknown>;
  created_at: string;
}

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
export type BatteryClassification = "real" | "demo";
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
  classification: BatteryClassification | null;
  source: string | null;
  received_at: string | null;
  notes: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  created_by_id: number;
  updated_by_id: number;
  organization_id: number | null;
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
  real_batteries: number;
  demo_batteries: number;
  unclassified_batteries: number;
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

export type TelemetryRange = "1h" | "24h" | "7d";
export type TelemetryConnectivityStatus = "online" | "stale" | "offline" | "unknown";

export interface TelemetryConnectivity {
  status: TelemetryConnectivityStatus;
  last_seen_at: string | null;
  freshness_seconds: number | null;
  online_after_seconds: number;
  stale_after_seconds: number;
}

export interface TelemetryGateway {
  gateway_id: string;
  name: string;
  battery_slot: number;
  organization_id: number;
  assigned_at: string | null;
  connectivity: TelemetryConnectivity;
}

export interface TelemetrySample {
  id: number;
  message_id: string;
  source: string;
  protocol: string;
  time_quality: string;
  measured_at: string;
  received_at: string;
  pack_voltage_v: number;
  pack_current_a: number;
  soc_pct: number;
  soh_pct: number | null;
  capacity_remaining_ah: number;
  capacity_full_ah: number;
  cell_voltages_mv: number[];
  cell_min_mv: number;
  cell_max_mv: number;
  cell_avg_mv: number;
  cell_delta_mv: number;
  cell_min_index: number;
  cell_max_index: number;
  temperatures_c: number[];
}

export interface TelemetryLatest {
  battery_id: number;
  asset_id: string;
  battery_classification: BatteryClassification | null;
  has_real_telemetry: boolean;
  telemetry_source: string | null;
  latest_any_source: string | null;
  latest_any_at: string | null;
  gateway: TelemetryGateway | null;
  sample: TelemetrySample | null;
  server_time: string;
}

export interface TelemetryPackPoint {
  measured_at: string;
  pack_voltage_v: number;
  pack_current_a: number;
  soc_pct: number;
  capacity_remaining_ah: number;
  capacity_full_ah: number;
  cell_min_mv: number;
  cell_max_mv: number;
  cell_avg_mv: number;
  cell_delta_mv: number;
}

export interface TelemetryCellPoint {
  measured_at: string;
  avg_mv: Array<number | null>;
  min_mv: Array<number | null>;
  max_mv: Array<number | null>;
}

export interface TelemetryTemperaturePoint {
  measured_at: string;
  values_c: Array<number | null>;
}

export interface TelemetryHistory {
  battery_id: number;
  asset_id: string;
  range: TelemetryRange;
  from_at: string;
  to_at: string;
  bucket_seconds: number;
  point_count: number;
  pack: TelemetryPackPoint[];
  cells: TelemetryCellPoint[];
  temperatures: TelemetryTemperaturePoint[];
  generated_at: string;
}
