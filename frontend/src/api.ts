import type {
  Attachment,
  Battery,
  DashboardSummary,
  Inspection,
  LifecycleEvent,
  Measurement,
  Page,
  ProviderInfo,
  Role,
  User,
} from "./types";

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

function formatDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "Đã có lỗi xảy ra";
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String(item.msg);
        return "";
      })
      .filter(Boolean)
      .join("; ");
  }
  return "Đã có lỗi xảy ra";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // ignore
    }
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("pinlab:unauthorized"));
    }
    throw new ApiError(response.status, formatDetail(payload));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<User>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<User>("/auth/me"),

  dashboard: () => request<DashboardSummary>("/dashboard"),

  listBatteries: (params: { search?: string; status?: string; page?: number; pageSize?: number }) => {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.status) query.set("status", params.status);
    query.set("page", String(params.page ?? 1));
    query.set("page_size", String(params.pageSize ?? 20));
    return request<Page<Battery>>(`/batteries?${query.toString()}`);
  },
  getBattery: (id: number) => request<Battery>(`/batteries/${id}`),
  createBattery: (payload: Record<string, unknown>) =>
    request<Battery>("/batteries", { method: "POST", body: JSON.stringify(payload) }),
  updateBattery: (id: number, payload: Record<string, unknown>) =>
    request<Battery>(`/batteries/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteBattery: (id: number) => request<void>(`/batteries/${id}`, { method: "DELETE" }),

  getMeasurements: (batteryId: number, pageSize = 100) =>
    request<Page<Measurement>>(`/batteries/${batteryId}/measurements?page_size=${pageSize}`),
  latestMeasurements: (batteryId: number) =>
    request<Record<string, Measurement | null>>(`/batteries/${batteryId}/measurements/latest`),
  createMeasurement: (batteryId: number, payload: Record<string, unknown>) =>
    request<Measurement>(`/batteries/${batteryId}/measurements`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getInspections: (batteryId: number, pageSize = 100) =>
    request<Page<Inspection>>(`/batteries/${batteryId}/inspections?page_size=${pageSize}`),
  createInspection: (batteryId: number, payload: Record<string, unknown>) =>
    request<Inspection>(`/batteries/${batteryId}/inspections`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getLifecycle: (batteryId: number, pageSize = 100) =>
    request<Page<LifecycleEvent>>(`/batteries/${batteryId}/lifecycle-events?page_size=${pageSize}`),
  createLifecycleEvent: (batteryId: number, payload: Record<string, unknown>) =>
    request<LifecycleEvent>(`/batteries/${batteryId}/lifecycle-events`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getAttachments: (batteryId: number) => request<Attachment[]>(`/batteries/${batteryId}/attachments`),
  uploadAttachment: (batteryId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Attachment>(`/batteries/${batteryId}/attachments`, {
      method: "POST",
      body: form,
    });
  },
  uploadInspectionAttachment: (inspectionId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Attachment>(`/inspections/${inspectionId}/attachments`, {
      method: "POST",
      body: form,
    });
  },
  downloadUrl: (attachmentId: number) => `${BASE}/attachments/${attachmentId}/download`,

  getUsers: () => request<User[]>("/users"),
  createUser: (payload: { email: string; full_name: string; role: Role; password: string }) =>
    request<User>("/users", { method: "POST", body: JSON.stringify(payload) }),

  getProviders: () => request<ProviderInfo[]>("/integrations/providers"),
};
