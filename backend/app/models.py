from datetime import date, datetime, timezone
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, Enum):
    admin = "admin"
    technician = "technician"
    viewer = "viewer"


class OrganizationKind(str, Enum):
    pinlab = "pinlab"
    agency = "agency"


class OrganizationRole(str, Enum):
    pinlab_super_admin = "pinlab_super_admin"
    pinlab_manager = "pinlab_manager"
    pinlab_technician = "pinlab_technician"
    agency_admin = "agency_admin"
    agency_technician = "agency_technician"
    viewer = "viewer"


class BatteryStatus(str, Enum):
    received = "received"
    inspecting = "inspecting"
    tested = "tested"
    available = "available"
    in_service = "in_service"
    second_life = "second_life"
    retired = "retired"
    quarantined = "quarantined"


class SpecificationStatus(str, Enum):
    confirmed = "confirmed"
    partial = "partial"
    unknown = "unknown"


class BatteryClassification(str, Enum):
    """Authoritative Passport identity, independent of telemetry provenance."""

    real = "real"
    demo = "demo"


class MeasurementMetric(str, Enum):
    soc = "soc"
    soh = "soh"
    voltage = "voltage"
    current = "current"
    temperature = "temperature"


class MeasurementSource(str, Enum):
    manual = "manual"
    mock = "mock"
    bms_udan = "bms_udan"
    inverter_modbus = "inverter_modbus"


class MeasurementQuality(str, Enum):
    measured = "measured"
    estimated = "estimated"
    unknown = "unknown"


class InspectionResult(str, Enum):
    passed = "passed"
    failed = "failed"
    conditional = "conditional"
    inconclusive = "inconclusive"


class LifecycleEventType(str, Enum):
    received = "received"
    inspected = "inspected"
    tested = "tested"
    repaired = "repaired"
    reused_second_life = "reused_second_life"
    retired = "retired"
    status_changed = "status_changed"
    measurement_recorded = "measurement_recorded"
    note = "note"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    kind: Mapped[OrganizationKind] = mapped_column(
        SAEnum(OrganizationKind, native_enum=False, length=16),
        default=OrganizationKind.agency,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    memberships: Mapped[list["OrganizationMembership"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan", passive_deletes=True
    )
    batteries: Mapped[list["Battery"]] = relationship(back_populates="organization")
    ## p0-a: relationships are available to P0-B; no endpoint uses them yet.


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, native_enum=False, length=32), default=UserRole.viewer, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    batteries_created: Mapped[list["Battery"]] = relationship(
        back_populates="created_by", foreign_keys="Battery.created_by_id"
    )
    organization_memberships: Mapped[list["OrganizationMembership"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "organization_id", name="uq_organization_memberships_user_org"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[OrganizationRole] = mapped_column(
        SAEnum(OrganizationRole, native_enum=False, length=32), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="organization_memberships")
    organization: Mapped[Organization] = relationship(back_populates="memberships")

    @property
    def user_email(self) -> str:
        return self.user.email

    @property
    def user_full_name(self) -> str:
        return self.user.full_name

    @property
    def organization_name(self) -> str:
        return self.organization.name

    @property
    def organization_slug(self) -> str:
        return self.organization.slug


class Battery(Base):
    __tablename__ = "batteries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    serial_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    chemistry: Mapped[str | None] = mapped_column(String(80), nullable=True)
    nominal_voltage_v: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    nominal_capacity_ah: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    initial_energy_kwh: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    status: Mapped[BatteryStatus] = mapped_column(
        SAEnum(BatteryStatus, native_enum=False, length=32), default=BatteryStatus.received, nullable=False
    )
    specification_status: Mapped[SpecificationStatus] = mapped_column(
        SAEnum(SpecificationStatus, native_enum=False, length=32),
        default=SpecificationStatus.unknown,
        nullable=False,
    )
    # NULL means unclassified. There is deliberately no default: historical
    # production rows must be classified through the approved inventory rather
    # than silently treated as demo or real.
    classification: Mapped[BatteryClassification | None] = mapped_column(
        SAEnum(BatteryClassification, native_enum=False, length=16),
        nullable=True,
        index=True,
    )
    source: Mapped[str | None] = mapped_column(String(160), nullable=True)
    received_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    updated_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    organization_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id])
    updated_by: Mapped[User] = relationship(foreign_keys=[updated_by_id])
    organization: Mapped[Organization | None] = relationship(back_populates="batteries")
    assignments: Mapped[list["BatteryAssignment"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan", passive_deletes=True
    )
    measurements: Mapped[list["Measurement"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan", passive_deletes=True
    )
    inspections: Mapped[list["Inspection"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan", passive_deletes=True
    )
    lifecycle_events: Mapped[list["LifecycleEvent"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan", passive_deletes=True
    )
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="battery", cascade="all, delete-orphan", passive_deletes=True
    )


class BatteryAssignment(Base):
    __tablename__ = "battery_assignments"
    __table_args__ = (
        UniqueConstraint("battery_id", "user_id", name="uq_battery_assignments_battery_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    battery_id: Mapped[int] = mapped_column(
        ForeignKey("batteries.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    assigned_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    battery: Mapped[Battery] = relationship(back_populates="assignments")
    user: Mapped[User] = relationship(foreign_keys=[user_id])
    assigned_by: Mapped[User] = relationship(foreign_keys=[assigned_by_id])

    @property
    def user_email(self) -> str:
        return self.user.email

    @property
    def user_full_name(self) -> str:
        return self.user.full_name

    @property
    def battery_asset_id(self) -> str:
        return self.battery.asset_id


class Gateway(Base):
    __tablename__ = "gateways"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gateway_id: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    organization: Mapped[Organization] = relationship()
    assignments: Mapped[list["GatewayBatteryAssignment"]] = relationship(
        back_populates="gateway", cascade="all, delete-orphan", passive_deletes=True
    )


class GatewayBatteryAssignment(Base):
    __tablename__ = "gateway_battery_assignments"
    __table_args__ = (
        UniqueConstraint("gateway_id", "battery_slot", "assigned_at", name="uq_gateway_slot_assigned_at"),
        Index("ix_gateway_battery_assignment_lookup", "gateway_id", "battery_slot", "assigned_at", "unassigned_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gateway_id: Mapped[int] = mapped_column(
        ForeignKey("gateways.id", ondelete="CASCADE"), index=True, nullable=False
    )
    battery_slot: Mapped[int] = mapped_column(Integer, nullable=False)
    battery_id: Mapped[int] = mapped_column(
        ForeignKey("batteries.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    unassigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    gateway: Mapped[Gateway] = relationship(back_populates="assignments")
    battery: Mapped[Battery] = relationship()


class TelemetrySample(Base):
    __tablename__ = "telemetry_samples"
    __table_args__ = (
        UniqueConstraint("gateway_id", "message_id", name="uq_telemetry_gateway_message"),
        Index("ix_telemetry_battery_measured_at", "battery_id", "measured_at"),
        Index("ix_telemetry_org_measured_at", "organization_id", "measured_at"),
        Index("ix_telemetry_measured_at", "measured_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    gateway_id: Mapped[int] = mapped_column(
        ForeignKey("gateways.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    battery_id: Mapped[int] = mapped_column(
        ForeignKey("batteries.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    message_id: Mapped[str] = mapped_column(String(128), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    battery_slot: Mapped[int] = mapped_column(Integer, nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    time_quality: Mapped[str] = mapped_column(String(32), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False)
    pack_voltage_v: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    pack_current_a: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    soc_pct: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    soh_pct: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    capacity_remaining_ah: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    capacity_full_ah: Mapped[float] = mapped_column(Numeric(10, 3), nullable=False)
    cell_voltages_mv: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    temperatures_c: Mapped[list[float]] = mapped_column(JSON, nullable=False)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    gateway: Mapped[Gateway] = relationship()
    battery: Mapped[Battery] = relationship()
    organization: Mapped[Organization] = relationship()


class SecurityAuditEvent(Base):
    __tablename__ = "security_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    organization_id: Mapped[int | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(40), nullable=False)
    target_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    event_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    actor: Mapped[User] = relationship()
    organization: Mapped[Organization | None] = relationship()

    @property
    def actor_email(self) -> str:
        return self.actor.email

    @property
    def actor_full_name(self) -> str:
        return self.actor.full_name


class Measurement(Base):
    __tablename__ = "measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id", ondelete="CASCADE"), index=True)
    metric: Mapped[MeasurementMetric] = mapped_column(
        SAEnum(MeasurementMetric, native_enum=False, length=32), nullable=False
    )
    value: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[MeasurementSource] = mapped_column(
        SAEnum(MeasurementSource, native_enum=False, length=32),
        default=MeasurementSource.manual,
        nullable=False,
    )
    quality: Mapped[MeasurementQuality] = mapped_column(
        SAEnum(MeasurementQuality, native_enum=False, length=32),
        default=MeasurementQuality.measured,
        nullable=False,
    )
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    battery: Mapped[Battery] = relationship(back_populates="measurements")


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id", ondelete="CASCADE"), index=True)
    test_type: Mapped[str] = mapped_column(String(120), nullable=False)
    inspected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    technician_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    measured_parameters: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    result: Mapped[InspectionResult] = mapped_column(
        SAEnum(InspectionResult, native_enum=False, length=32), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    battery: Mapped[Battery] = relationship(back_populates="inspections")
    technician: Mapped[User] = relationship(foreign_keys=[technician_id])
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="inspection", cascade="all, delete-orphan", passive_deletes=True
    )


class LifecycleEvent(Base):
    __tablename__ = "lifecycle_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    battery_id: Mapped[int] = mapped_column(ForeignKey("batteries.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[LifecycleEventType] = mapped_column(
        SAEnum(LifecycleEventType, native_enum=False, length=40), nullable=False
    )
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    battery: Mapped[Battery] = relationship(back_populates="lifecycle_events")
    actor: Mapped[User] = relationship()


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    battery_id: Mapped[int | None] = mapped_column(
        ForeignKey("batteries.id", ondelete="CASCADE"), nullable=True, index=True
    )
    inspection_id: Mapped[int | None] = mapped_column(
        ForeignKey("inspections.id", ondelete="CASCADE"), nullable=True, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    battery: Mapped[Battery | None] = relationship(back_populates="attachments")
    inspection: Mapped[Inspection | None] = relationship(back_populates="attachments")
    uploaded_by: Mapped[User] = relationship()
