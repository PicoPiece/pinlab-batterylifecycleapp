/**
 * Future BLE Gateway boundary for the Android POC.
 *
 * This module is design-only. No BLE plugin, scan, pairing, ESP32/JK/PACE
 * protocol or BMS control is implemented in this POC. The adapter is kept
 * outside React components so a later native implementation can be injected
 * without changing screens or the existing FastAPI API.
 */

export type BleGatewayId = string;

export type ProvisioningState =
  | "unprovisioned"
  | "discovering"
  | "pairing"
  | "connected"
  | "error";

export interface GatewayDiscovery {
  gatewayId: BleGatewayId;
  displayName: string;
  rssi?: number;
  advertisedService?: string;
}

export interface GatewayIdentity {
  gatewayId: BleGatewayId;
  model: string;
  firmwareVersion: string;
  hardwareRevision?: string;
  serialNumber?: string;
}

export interface BatteryAssetMapping {
  gatewayId: BleGatewayId;
  assetId: string;
  assetSerialNumber?: string;
  mappedAt: string;
  source: "manual" | "provisioning" | "unknown";
}

export interface GatewayCapabilities {
  metrics: Array<"soc" | "soh" | "voltage" | "current" | "temperature">;
  readOnly: true;
  bmsControl: false;
  supportsProvisioning: boolean;
}

export interface GatewaySession {
  gatewayId: BleGatewayId;
  state: ProvisioningState;
  identity: GatewayIdentity;
  capabilities: GatewayCapabilities;
}

/**
 * Contract for a future native BLE bridge. Implementations must be injected
 * explicitly; the POC does not register or silently enable a BLE plugin.
 */
export interface BleGatewayAdapter {
  discover(): Promise<GatewayDiscovery[]>;
  connect(gatewayId: BleGatewayId): Promise<GatewaySession>;
  readIdentity(gatewayId: BleGatewayId): Promise<GatewayIdentity>;
  getCapabilities(gatewayId: BleGatewayId): Promise<GatewayCapabilities>;
  mapToBattery(gatewayId: BleGatewayId, assetId: string): Promise<BatteryAssetMapping>;
  beginPairing(gatewayId: BleGatewayId): Promise<void>;
  disconnect(gatewayId: BleGatewayId): Promise<void>;
}

export class BleGatewayUnavailableError extends Error {
  constructor() {
    super("BLE Gateway is not implemented in Android POC v0.1");
    this.name = "BleGatewayUnavailableError";
  }
}

/** Safe default until a native adapter is reviewed and approved. */
export class UnsupportedBleGatewayAdapter implements BleGatewayAdapter {
  async discover(): Promise<GatewayDiscovery[]> {
    throw new BleGatewayUnavailableError();
  }

  async connect(): Promise<GatewaySession> {
    throw new BleGatewayUnavailableError();
  }

  async readIdentity(): Promise<GatewayIdentity> {
    throw new BleGatewayUnavailableError();
  }

  async getCapabilities(): Promise<GatewayCapabilities> {
    throw new BleGatewayUnavailableError();
  }

  async mapToBattery(): Promise<BatteryAssetMapping> {
    throw new BleGatewayUnavailableError();
  }

  async beginPairing(): Promise<void> {
    throw new BleGatewayUnavailableError();
  }

  async disconnect(): Promise<void> {
    throw new BleGatewayUnavailableError();
  }
}
