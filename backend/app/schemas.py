from datetime import date, datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models import (
    BatteryStatus,
    InspectionResult,
    LifecycleEventType,
    MeasurementMetric,
    MeasurementQuality,
    MeasurementSource,
    SpecificationStatus,
    UserRole,
)

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserRead(ORMModel):
    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime


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
    pass


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


class BatteryRead(BatteryBase, ORMModel):
    id: int
    is_deleted: bool
    created_at: datetime
    updated_at: datetime
    created_by_id: int
    updated_by_id: int


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


class DashboardSummary(BaseModel):
    total_batteries: int
    by_status: list[StatusCount]
    soc_available: int
    soh_available: int
    soc_distribution: list[BucketCount]
    soh_distribution: list[BucketCount]
    needs_attention: list[AttentionBattery]
    recent_inspections: list[RecentInspection]
    recent_events: list[RecentEvent]


class ProviderInfo(BaseModel):
    name: str
    mode: str
    available: bool
    description: str


class HealthResponse(BaseModel):
    status: str
    database: str
    version: str
