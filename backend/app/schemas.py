from datetime import date, datetime
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models import (
    BatteryClassification,
    BatteryStatus,
    InspectionResult,
    LifecycleEventType,
    MeasurementMetric,
    MeasurementQuality,
    MeasurementSource,
    OrganizationKind,
    OrganizationRole,
    SpecificationStatus,
    UserRole,
)

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)
    confirm_password: str = Field(min_length=12, max_length=128)

    @model_validator(mode="after")
    def validate_confirmation(self) -> "ChangePasswordRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("Mật khẩu xác nhận không khớp")
        if self.new_password == self.current_password:
            raise ValueError("Mật khẩu mới phải khác mật khẩu hiện tại")
        return self


class UserRead(ORMModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    must_change_password: bool
    created_at: datetime


class AdminPasswordResetResponse(BaseModel):
    temporary_password: str
    user: UserRead


class AccessMembershipRead(BaseModel):
    id: int
    organization_id: int
    organization_name: str
    organization_slug: str
    role: OrganizationRole
    is_active: bool


class AccessRead(BaseModel):
    user: UserRead
    is_super_admin: bool
    is_manager: bool
    is_agency_admin: bool
    can_write: bool
    can_create_battery: bool
    can_manage_access: bool
    memberships: list[AccessMembershipRead]


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    role: UserRole = UserRole.viewer
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    role: UserRole | None = None
    is_active: bool | None = None


class BatteryBase(BaseModel):
    asset_id: str = Field(min_length=1, max_length=80)
    serial_number: str | None = Field(default=None, max_length=120)
    manufacturer: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    chemistry: str | None = Field(default=None, max_length=80)
    nominal_voltage_v: float | None = Field(default=None, ge=0)
    nominal_capacity_ah: float | None = Field(default=None, ge=0)
    initial_energy_kwh: float | None = Field(default=None, ge=0)
    status: BatteryStatus = BatteryStatus.received
    specification_status: SpecificationStatus = SpecificationStatus.unknown
    source: str | None = Field(default=None, max_length=160)
    received_at: date | None = None
    notes: str | None = None


class BatteryCreate(BatteryBase):
    organization_id: int | None = None


class BatteryUpdate(BaseModel):
    asset_id: str | None = Field(default=None, min_length=1, max_length=80)
    serial_number: str | None = Field(default=None, max_length=120)
    manufacturer: str | None = Field(default=None, max_length=120)
    model: str | None = Field(default=None, max_length=120)
    chemistry: str | None = Field(default=None, max_length=80)
    nominal_voltage_v: float | None = Field(default=None, ge=0)
    nominal_capacity_ah: float | None = Field(default=None, ge=0)
    initial_energy_kwh: float | None = Field(default=None, ge=0)
    status: BatteryStatus | None = None
    specification_status: SpecificationStatus | None = None
    source: str | None = Field(default=None, max_length=160)
    received_at: date | None = None
    notes: str | None = None
    organization_id: int | None = None


class BatteryClassificationUpdate(BaseModel):
    classification: BatteryClassification


class BatteryRead(BatteryBase, ORMModel):
    id: int
    classification: BatteryClassification | None = None
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    created_by_id: int
    updated_by_id: int
    organization_id: int | None = None


class MeasurementSnapshot(ORMModel):
    metric: MeasurementMetric
    value: float
    unit: str
    source: MeasurementSource
    quality: MeasurementQuality
    measured_at: datetime


class BatteryLatestMeasurements(BaseModel):
    soc: MeasurementSnapshot | None = None
    soh: MeasurementSnapshot | None = None
    voltage: MeasurementSnapshot | None = None
    current: MeasurementSnapshot | None = None
    temperature: MeasurementSnapshot | None = None


class BatteryPortfolioItem(BatteryRead):
    latest: BatteryLatestMeasurements = Field(default_factory=BatteryLatestMeasurements)
    latest_measurement_at: datetime | None = None
    last_inspection_at: datetime | None = None
    inspection_count: int = 0
    evidence_count: int = 0


class OrganizationRead(ORMModel):
    id: int
    slug: str
    name: str
    kind: OrganizationKind
    is_active: bool
    created_at: datetime


class OrganizationCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=2, max_length=160)
    kind: OrganizationKind = OrganizationKind.agency


class OrganizationMembershipRead(ORMModel):
    id: int
    user_id: int
    organization_id: int
    organization_name: str
    user_email: str
    user_full_name: str
    role: OrganizationRole
    is_active: bool
    created_at: datetime


class OrganizationMembershipCreate(BaseModel):
    user_id: int
    role: OrganizationRole


class OrganizationUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    role: OrganizationRole


class OrganizationMembershipUpdate(BaseModel):
    role: OrganizationRole | None = None
    is_active: bool | None = None


class BatteryAssignmentRead(ORMModel):
    id: int
    battery_id: int
    battery_asset_id: str
    user_id: int
    user_email: str
    user_full_name: str
    assigned_by_id: int
    is_active: bool
    created_at: datetime
    ended_at: datetime | None


class BatteryAssignmentCreate(BaseModel):
    user_id: int


class SecurityAuditEventRead(ORMModel):
    id: int
    actor_id: int
    actor_email: str
    actor_full_name: str
    organization_id: int | None
    action: str
    target_type: str
    target_id: int | None
    event_metadata: dict
    created_at: datetime


class MeasurementCreate(BaseModel):
    metric: MeasurementMetric
    value: float
    unit: str = Field(min_length=1, max_length=20)
    source: MeasurementSource = MeasurementSource.manual
    quality: MeasurementQuality = MeasurementQuality.measured
    measured_at: datetime | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_metric(self) -> "MeasurementCreate":
        if self.metric in (MeasurementMetric.soc, MeasurementMetric.soh) and not (0 <= self.value <= 100):
            raise ValueError("SOC/SOH phải nằm trong khoảng 0–100")
        if self.metric in (MeasurementMetric.soc, MeasurementMetric.soh) and self.unit != "%":
            raise ValueError("Đơn vị SOC/SOH phải là %")
        if self.source == MeasurementSource.mock:
            prefix = "SIMULATED — "
            if not (self.notes or "").startswith(prefix):
                self.notes = prefix + (self.notes or "Dữ liệu mô phỏng, không phải đo thực tế.")
        return self


class MeasurementRead(MeasurementCreate, ORMModel):
    id: int
    battery_id: int
    created_by_id: int
    created_at: datetime
    measured_at: datetime


class InspectionCreate(BaseModel):
    test_type: str = Field(min_length=1, max_length=120)
    inspected_at: datetime | None = None
    measured_parameters: dict[str, Any] = Field(default_factory=dict)
    result: InspectionResult
    notes: str | None = None


class InspectionRead(InspectionCreate, ORMModel):
    id: int
    battery_id: int
    technician_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    inspected_at: datetime


class LifecycleEventCreate(BaseModel):
    event_type: LifecycleEventType
    event_at: datetime | None = None
    notes: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class LifecycleEventRead(ORMModel):
    id: int
    battery_id: int
    event_type: LifecycleEventType
    event_at: datetime
    actor_id: int
    notes: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, validation_alias="event_metadata")
    created_at: datetime


class AttachmentRead(ORMModel):
    id: int
    battery_id: int | None
    inspection_id: int | None
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by_id: int
    created_at: datetime


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class TelemetryConnectivityRead(BaseModel):
    status: Literal["online", "stale", "offline", "unknown"]
    last_seen_at: datetime | None
    freshness_seconds: int | None
    online_after_seconds: int
    stale_after_seconds: int


class TelemetryGatewayRead(BaseModel):
    gateway_id: str
    name: str
    battery_slot: int
    organization_id: int
    assigned_at: datetime | None
    connectivity: TelemetryConnectivityRead


class TelemetrySampleRead(BaseModel):
    id: int
    message_id: str
    source: str
    protocol: str
    time_quality: str
    measured_at: datetime
    received_at: datetime
    pack_voltage_v: float
    pack_current_a: float
    soc_pct: float
    soh_pct: float | None
    capacity_remaining_ah: float
    capacity_full_ah: float
    cell_voltages_mv: list[int]
    cell_min_mv: int
    cell_max_mv: int
    cell_avg_mv: float
    cell_delta_mv: int
    cell_min_index: int
    cell_max_index: int
    temperatures_c: list[float]


class TelemetryLatestRead(BaseModel):
    battery_id: int
    asset_id: str
    battery_classification: BatteryClassification | None
    has_real_telemetry: bool
    telemetry_source: str | None
    latest_any_source: str | None
    latest_any_at: datetime | None
    gateway: TelemetryGatewayRead | None
    sample: TelemetrySampleRead | None
    server_time: datetime


class TelemetryPackPoint(BaseModel):
    measured_at: datetime
    pack_voltage_v: float
    pack_current_a: float
    soc_pct: float
    capacity_remaining_ah: float
    capacity_full_ah: float
    cell_min_mv: float
    cell_max_mv: float
    cell_avg_mv: float
    cell_delta_mv: float


class TelemetryCellPoint(BaseModel):
    measured_at: datetime
    avg_mv: list[float | None]
    min_mv: list[float | None]
    max_mv: list[float | None]


class TelemetryTemperaturePoint(BaseModel):
    measured_at: datetime
    values_c: list[float | None]


class TelemetryHistoryRead(BaseModel):
    battery_id: int
    asset_id: str
    range: Literal["1h", "24h", "7d"]
    from_at: datetime
    to_at: datetime
    bucket_seconds: int
    point_count: int
    pack: list[TelemetryPackPoint]
    cells: list[TelemetryCellPoint]
    temperatures: list[TelemetryTemperaturePoint]
    generated_at: datetime


class StatusCount(BaseModel):
    status: BatteryStatus
    count: int


class BucketCount(BaseModel):
    bucket: str
    count: int


class RecentInspection(BaseModel):
    id: int
    battery_id: int
    asset_id: str
    test_type: str
    result: InspectionResult
    inspected_at: datetime
    technician: str


class RecentEvent(BaseModel):
    id: int
    battery_id: int
    asset_id: str
    event_type: LifecycleEventType
    event_at: datetime
    actor: str


class AttentionBattery(BaseModel):
    battery_id: int
    asset_id: str
    reasons: list[str]
    severity: str = "review"


class FleetHealth(BaseModel):
    score: float
    weighted_soh: float | None
    data_coverage: float
    inspection_currency: float
    formula: str


class InspectionSummary(BaseModel):
    id: int
    battery_id: int
    asset_id: str
    test_type: str
    result: InspectionResult
    inspected_at: datetime
    technician: str
    notes: str | None = None
    evidence_count: int = 0


class DashboardSummary(BaseModel):
    total_batteries: int
    real_batteries: int = 0
    demo_batteries: int = 0
    unclassified_batteries: int = 0
    by_status: list[StatusCount]
    soc_available: int
    soh_available: int
    soc_distribution: list[BucketCount]
    soh_distribution: list[BucketCount]
    needs_attention: list[AttentionBattery]
    recent_inspections: list[RecentInspection]
    recent_events: list[RecentEvent]
    fleet_health: FleetHealth


class ProviderInfo(BaseModel):
    name: str
    mode: str
    available: bool
    description: str


class HealthResponse(BaseModel):
    status: str
    database: str
    version: str
