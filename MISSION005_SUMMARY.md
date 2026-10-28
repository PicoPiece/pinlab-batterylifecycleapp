# Mission 005 — Battery Lifecycle MVP Summary

- **Ngày:** 2026-10-28
- **Project:** `pinlab-sw-001 — PinLab Battery Lifecycle App`
- **Trạng thái:** MVP local, isolated Docker Compose; **chưa public deployment**
- **Source:** `~/PinLab/Projects/BatteryLifecycleApp`
- **Local URL:** `http://127.0.0.1:8890`
- **Git:** local branch `main`; chưa có remote, chưa push

---

## 1. Scope MVP

- Đăng nhập và phân quyền backend: `admin`, `technician`, `viewer`.
- Battery registry CRUD.
- Battery detail: thông số, SOC/SOH mới nhất, measurement history, inspection, lifecycle timeline, attachments.
- Inspection & testing với measured parameters và evidence.
- Lifecycle events tự động.
- Dashboard từ database.
- Provider adapter architecture, không điều khiển hardware.

Không có Kubernetes, microservices, MQTT broker, ThingsBoard hoặc Docker socket.

---

## 2. Architecture

```text
Browser → Nginx :8890
            ├── React SPA
            └── /api/ → FastAPI :8000
                           ├── PostgreSQL 17
                           └── /data/uploads volume
```

| Thành phần | Công nghệ |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, Recharts |
| Backend | FastAPI, SQLAlchemy 2, Pydantic 2, Alembic |
| Auth | Argon2 + JWT httpOnly cookie |
| Database | PostgreSQL 17 Alpine |
| Proxy | Nginx 1.27 Alpine |
| Compose | `pinlab-app` |
| Network | `pinlab-app-network` |
| Volumes | `pinlab_app_pgdata`, `pinlab_app_uploads` |
| Host bind | `127.0.0.1:8890` |

---

## 3. Implemented modules

### Backend

- Auth: login/logout/me; role enforcement.
- Users admin CRUD.
- Battery registry CRUD, soft delete.
- Measurements: SOC/SOH/voltage/current/temperature; source/quality.
- Inspections: test type, parameters, result, notes, attachments.
- Lifecycle events: received, inspected, tested, status change, measurement, note.
- Attachments: JPEG/PNG/WEBP/PDF, max 20 MB.
- Dashboard aggregates.
- Provider interface: manual, mock, UDAN BMS (disabled), inverter/Modbus (disabled).
- Health endpoint; structured request logging.
- Alembic initial migration.

### Frontend

- Login, dashboard, battery list/detail/form, inspection form, users admin.
- Vietnamese-first UI.
- Responsive layout.
- Loading/empty/error states.
- SOC/SOH charts from real DB.

---

## 4. Tests & verification

| Kiểm tra | Kết quả |
|---|---|
| Backend pytest | 13 passed |
| Frontend Vitest | 6 passed |
| Frontend production build | Pass |
| Alembic | `5e56d69bbfb0 (head)` |
| Compose health | 3/3 healthy |
| API health via Nginx | 200 |
| Login | 200 |
| E2E CRUD | Pass |
| Restart persistence | Pass |
| Secret scan | Pass |
| npm audit | 0 vulnerabilities |
| pip check | No broken requirements |
| OpenProject health | 200, unchanged |

### Resource usage

| Service | RAM | CPU |
|---|---:|---:|
| backend | ~69 MB | 0.11% |
| frontend | ~40 MB | 0.00% |
| db | ~26 MB | 0.02% |

---

## 5. Security

- Không có default credentials; admin seed từ `.env`.
- `.env` quyền `600`, không tracked Git.
- Password hash Argon2; cookie httpOnly, SameSite=Lax.
- Backend authorization; không chỉ frontend.
- DB/backend không publish port.
- Không privileged container, không Docker socket.
- Attachment giới hạn loại file/dung lượng.
- Nginx security headers.

---

## 6. Known limitations

- Chưa test browser automation; không có Chromium/Playwright trên host.
- Pytest dùng SQLite; Postgres đã test qua live stack nhưng chưa chạy test suite trên Postgres.
- Frontend bundle ~677 KB (203 KB gzip); Vite cảnh báo chunk size.
- Chưa có CSRF token riêng; dùng SameSite=Lax + same-origin.
- Chưa có backup/restore automation cho app.
- Chưa có SSO/MFA, rate limiting, antivirus scan.
- Chưa tích hợp UDAN BMS/inverter thật.
- Chưa có Cloudflare/public hostname.
- Chưa có CSV import/bulk historical data.

---

## 7. Deployment gate — chờ CTO duyệt

1. Set production env:
   - `ENVIRONMENT=production`
   - `COOKIE_SECURE=true`
   - `CORS_ORIGINS=https://pinlab-app.picopiece.com`
2. `docker compose up -d --build`
3. Cloudflare:
   - Dùng tunnel hiện có `cloudflared-pinlab` nếu feasible.
   - Route `pinlab-app.picopiece.com` → `http://127.0.0.1:8890`.
   - Không tạo tunnel mới nếu không cần.
4. Backup volumes trước khi public.
5. Rollback: xóa route; `docker compose stop`; giữ volume.

**Chưa thực hiện thay đổi Cloudflare/DNS.**

---

## 8. GitHub gate

- Local repo: `~/PinLab/Projects/BatteryLifecycleApp`
- Branch: `main`
- Chưa có remote; chưa push.
- Không dùng lại `pinlab-infrastructure`.
- Cần CTO xác nhận owner/URL/branch trước khi push.

---

## 9. Task mapping

| WP | Nội dung | Trạng thái MVP |
|---|---|---|
| S1 | MVP scope & user roles | Auth/roles backend implemented |
| S2 | Battery registry requirements | CRUD implemented |
| S3 | Lifecycle history requirements | Events + timeline implemented |
| S4 | SOC/SOH data requirements | Measurements + latest + distribution |
| S5 | Device integration requirements | Adapter skeleton; real BMS/Modbus disabled |
| S6 | Web dashboard/reporting requirements | Dashboard from DB |
| S7 | MVP logical architecture & data model | Implemented + Alembic |
| S8 | API/integration boundaries | REST/OpenAPI + auth |
| S9 | MVP acceptance criteria & test plan | Tests/E2E executed; browser automation missing |
| S10 | MVP specification & ADR index | README + this summary |
| S11 | Missing information register | Still open |

Không thay đổi trạng thái WP trong Mission 005.
