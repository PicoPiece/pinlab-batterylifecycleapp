# PinLab Battery Lifecycle App — MVP

Web app quản lý vòng đời pin EV/ESS cho PinLab: battery registry, inspection, SOC/SOH, lifecycle history, evidence và dashboard.

> **Trạng thái:** MVP local, đang chờ CTO review. Chưa cấu hình Cloudflare/public hostname.
> **DEMO data:** mọi dữ liệu mẫu được ghi rõ `DEMO/SIMULATED`; không phải thông số đo thực tế.

## 1. Kiến trúc

```text
Browser
  │ HTTP 127.0.0.1:8890
  ▼
Nginx (frontend container)
  ├── /            → React SPA (Vite build)
  └── /api/        → FastAPI backend:8000
                         │
                         ├── PostgreSQL 17 (container nội bộ)
                         └── /data/uploads (named volume)
```

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, Recharts |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Auth | Argon2 password hash, JWT trong httpOnly cookie |
| Database | PostgreSQL 17 Alpine |
| Reverse proxy | Nginx Alpine |
| Runtime | Docker Compose project `pinlab-app` |
| Host bind | `127.0.0.1:8890` |
| Network | `pinlab-app-network` |
| Volumes | `pinlab_app_pgdata`, `pinlab_app_uploads` |

Không dùng Kubernetes, microservices, MQTT broker, ThingsBoard hoặc Docker socket.

## 2. Chức năng MVP

- Đăng nhập, phân quyền backend: `admin`, `technician`, `viewer`.
- Battery registry CRUD; trường chưa biết để trống, có `specification_status` (`confirmed/partial/unknown`).
- Battery detail: thông số, SOC/SOH mới nhất, lịch sử đo, inspection, lifecycle timeline, attachments.
- Inspection record: test type, thời điểm, kỹ thuật viên, measured parameters, kết quả, notes, evidence.
- Measurement: SOC/SOH/voltage/current/temperature; source & quality; mock data tự động gắn nhãn `SIMULATED`.
- Lifecycle event tự động cho đăng ký, đổi trạng thái, measurement, inspection.
- Dashboard từ database: tổng pin, phân bố trạng thái, SOC/SOH availability & distribution, inspection/event gần đây.
- Attachment: JPEG/PNG/WEBP/PDF, tối đa 20 MB, lưu ngoài DB.
- Provider adapter architecture: manual, mock, UDAN BMS (chưa triển khai), inverter/Modbus (chưa triển khai). Không điều khiển hardware.

## 3. Chạy local

### 3.1 Chuẩn bị env

```bash
cd ~/PinLab/Projects/BatteryLifecycleApp
cp .env.example .env
chmod 600 .env
# Sửa POSTGRES_PASSWORD, APP_SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
```

Không commit `.env`.

### 3.2 Build & start

```bash
docker compose build
docker compose up -d
docker compose ps
```

### 3.3 Seed admin + DEMO data

```bash
docker compose exec backend python -m app.seed
```

Seed idempotent: không tạo trùng battery `DEMO-*`. Không chạy seed tự động trong container start.

### 3.4 Truy cập

```text
http://127.0.0.1:8890
```

API docs:

```text
http://127.0.0.1:8890/api/docs
```

### 3.5 Dừng

```bash
docker compose stop
```

Không dùng `docker compose down -v`.

## 4. Kiểm thử

Backend (trong container):

```bash
docker compose run --rm \
  -e DATABASE_URL=sqlite:////tmp/test.db \
  -e SECRET_KEY=test-only-secret-key-32-bytes-minimum \
  -e UPLOAD_DIR=/tmp/uploads \
  backend python -m pytest -q
```

Frontend:

```bash
cd frontend
npm test
npm run build
```

## 5. Database migrations

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend alembic current
```

Migration đầu tiên: `alembic/versions/5e56d69bbfb0_initial_schema.py`.

## 6. API chính

| Method | Endpoint | Quyền |
|---|---|---|
| POST | `/api/v1/auth/login` | public |
| POST | `/api/v1/auth/logout` | authenticated |
| GET | `/api/v1/auth/me` | authenticated |
| GET/POST | `/api/v1/batteries` | view / admin+technician |
| GET/PATCH/DELETE | `/api/v1/batteries/{id}` | view / admin+technician / admin |
| GET/POST | `/api/v1/batteries/{id}/measurements` | view / admin+technician |
| GET/POST | `/api/v1/batteries/{id}/inspections` | view / admin+technician |
| GET/POST | `/api/v1/batteries/{id}/lifecycle-events` | view / admin+technician |
| GET/POST | `/api/v1/batteries/{id}/attachments` | view / admin+technician |
| GET | `/api/v1/dashboard` | authenticated |
| GET | `/api/v1/users` | admin |
| POST | `/api/v1/users` | admin |
| GET | `/api/v1/integrations/providers` | authenticated |

## 7. Bảo mật

### Production hardening

- `COOKIE_SECURE=true` khi chạy sau HTTPS.
- `ENVIRONMENT=production`.
- `ENABLE_DOCS=false` để tắt `/api/docs` và `/api/openapi.json`.
- `CORS_ORIGINS=https://pinlab-app.picopiece.com`.
- Login rate limit: 5 lần sai / 15 phút cho mỗi IP+email; khóa tạm 15 phút, không vĩnh viễn.
- CSRF origin guard cho POST/PATCH/DELETE khi browser gửi `Origin` khác allowed origin.
- Nginx giữ `X-Forwarded-Proto` từ Cloudflare và Uvicorn chạy với `--proxy-headers`.
- Template: `.env.production.example`.

### Baseline

- Không có default credentials; admin tạo từ env khi seed.
- Password hash Argon2; JWT httpOnly cookie; `secure` bật khi `COOKIE_SECURE=true`.
- Authorization kiểm tra backend, không chỉ frontend.
- Attachment giới hạn loại file và dung lượng; lưu ngoài DB.
- Không mount Docker socket; không privileged; DB không publish port.
- Log không ghi password/token.
- Backup: named volumes `pinlab_app_pgdata` + `pinlab_app_uploads`; chưa có backup automation trong MVP.

## 8. Giới hạn & việc chờ duyệt

- Chưa cấu hình Cloudflare/public hostname.
- Chưa có backup/restore automation cho app.
- Chưa có SSO/MFA; chỉ local auth.
- Rate limit là in-process; MVP chạy một backend process.
- Chưa tích hợp UDAN BMS/inverter thật.
- Chưa test cross-browser/mobile thực tế ngoài responsive CSS.
- Chưa có audit log chi tiết từng field; lifecycle timeline + audit metadata là baseline.
- Chưa có import CSV/bulk historical data.
- Production hardening (HTTPS cookie, secret manager, DB backup) chờ CTO duyệt.

## 9. Ownership

Source code MVP thuộc PinLab theo thỏa thuận riêng. Hạ tầng vật lý (server/UPS/Internet) thuộc CTO. Không đưa tài liệu lương/equity vào repo này.
