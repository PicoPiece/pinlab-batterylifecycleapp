"""Provider adapter architecture.

No hardware control is implemented in this MVP. UDAN BMS and inverter/Modbus
providers are explicit placeholders and must remain unavailable until a
protocol, safety review and CTO approval exist.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ProviderInfo:
    name: str
    mode: str
    available: bool
    description: str


class BatteryDataProvider(Protocol):
    info: ProviderInfo

    def read_snapshot(self, asset_id: str) -> dict:
        ...


class ManualProvider:
    info = ProviderInfo(
        name="manual",
        mode="manual",
        available=True,
        description="Nhập tay từ kỹ thuật viên, có ghi nguồn và thời điểm.",
    )

    def read_snapshot(self, asset_id: str) -> dict:
        return {}


class MockProvider:
    info = ProviderInfo(
        name="mock",
        mode="demo",
        available=True,
        description="Dữ liệu mô phỏng DEMO/SIMULATED; không dùng cho vận hành thật.",
    )

    def read_snapshot(self, asset_id: str) -> dict:
        # Deterministic pseudo-values; explicitly simulated.
        seed = sum(ord(c) for c in asset_id)
        return {
            "soc": 40 + (seed % 51),
            "soh": 65 + (seed % 31),
            "voltage": 48.0 + (seed % 10) / 10,
            "temperature": 25.0 + (seed % 8) / 2,
            "simulated": True,
        }


class UdanBmsProvider:
    info = ProviderInfo(
        name="udan_bms",
        mode="bms",
        available=False,
        description="Adapter UDAN BMS chưa triển khai; cần datasheet/protocol và phê duyệt kỹ thuật.",
    )

    def read_snapshot(self, asset_id: str) -> dict:
        raise NotImplementedError("UDAN BMS adapter chưa được triển khai")


class InverterModbusProvider:
    info = ProviderInfo(
        name="inverter_modbus",
        mode="inverter",
        available=False,
        description="Adapter inverter/Modbus chưa triển khai; không gửi lệnh điều khiển.",
    )

    def read_snapshot(self, asset_id: str) -> dict:
        raise NotImplementedError("Inverter/Modbus adapter chưa được triển khai")


PROVIDERS: list[BatteryDataProvider] = [
    ManualProvider(),
    MockProvider(),
    UdanBmsProvider(),
    InverterModbusProvider(),
]
