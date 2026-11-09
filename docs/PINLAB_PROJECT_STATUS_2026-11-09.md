# PINLAB — BÁO CÁO TIẾN ĐỘ NỀN TẢNG QUẢN LÝ & GIÁM SÁT PIN

**Ngày báo cáo:** 09/11/2026
**Giai đoạn:** Production Pilot — 1 bộ pin APESS thực tế
**Phụ trách kỹ thuật:** CTO / Engineering Team
**Phạm vi:** IoT Gateway, Battery Lifecycle Platform, Battery Analytics
**Nguồn tổng hợp:** Mission 017, 018, 018.1, 018.2 và Production evidence.
**OpenProject:** Work package `#86` — https://pinlab-pm.picopiece.com/work_packages/86

## 1. Tóm tắt điều hành

PinLab đã hoàn thành giai đoạn phát triển và triển khai thử nghiệm nền tảng quản lý vòng đời pin, kết hợp giám sát dữ liệu BMS thực tế qua Internet.

Hệ thống hiện có khả năng:

- Quản lý Battery Passport và thông tin tài sản pin.
- Thu thập dữ liệu BMS thực tế bằng IoT Gateway ESP32-S3.
- Truyền dữ liệu an toàn qua Wi-Fi, MQTT over TLS và Cloudflare Tunnel.
- Lưu dữ liệu vào PostgreSQL Production.
- Hiển thị tình trạng pin và biểu đồ lịch sử trên Web và Android.
- Phân tích điện áp từng cell, độ lệch cell, nhiệt độ, dòng điện và SOC.
- Cung cấp API dữ liệu chẩn đoán có cấu trúc để phục vụ AI Agent trong tương lai.

**Kết quả nổi bật:** Đã kiểm chứng thành công toàn bộ chuỗi dữ liệu từ BMS vật lý đến Dashboard Production với dữ liệu thực, không sử dụng dữ liệu mô phỏng để nghiệm thu.

Hệ thống đạt mức **Production Pilot — Functional PASS**, nhưng chưa hoàn thành audit bảo mật, độ tin cậy dài hạn và khả năng mở rộng thương mại.

---

## 2. Kiến trúc hệ thống

**Lớp thiết bị — Firmware & Hardware**

- Thiết bị: Waveshare ESP32-S3-RS485-CAN.
- Firmware: ESP-IDF 5.4.4.
- Battery thử nghiệm: APESS ES-LV-5, LiFePO4 51.2V / 100Ah / 5.12kWh.
- BMS: PACE P16S100A.
- Giao thức: RS485 / PYLON_485, 9600 baud.
- Đọc dữ liệu: pack voltage, current, SOC, capacity, 16 cell voltages và 5 cảm biến nhiệt độ.
- Cấu hình Wi-Fi qua SoftAP/Web UI, thông tin lưu NVS.
- MQTT WSS, TLS certificate/hostname verification và QoS 1.
- Tự kết nối lại Wi-Fi/MQTT sau khi reboot.

**Lớp truyền thông — IoT Connectivity**

- ESP32 gửi dữ liệu qua Wi-Fi và Internet.
- Cloudflare Tunnel tiếp nhận kết nối WSS.
- Mosquitto MQTT Broker xác thực Gateway và kiểm soát topic.
- Python MQTT Consumer kiểm tra cấu trúc dữ liệu, phân quyền Gateway/Battery và lưu PostgreSQL.
- Message ID hỗ trợ chống lưu trùng bản tin.

**Lớp nền tảng — Backend & Database**

- Backend: Python / FastAPI.
- Database: PostgreSQL 17.
- Data model: Battery Passport, Organization, Gateway, Gateway Assignment, Telemetry, Inspection, Warranty và các dữ liệu quản lý vòng đời.
- RBAC: phân quyền theo tổ chức và quyền truy cập Battery.
- Raw telemetry retention: 7 ngày.
- Diagnostic Evidence API: thống kê dữ liệu kỹ thuật để hỗ trợ phân tích và chẩn đoán.

**Lớp ứng dụng — Web & Mobile**

- React/TypeScript.
- Recharts cho biểu đồ time-series.
- Android thông qua Capacitor WebView.
- Web và Android sử dụng chung giao diện triển khai từ server.
- Hiển thị SOC, điện áp, dòng điện, nhiệt độ và lịch sử vận hành.
- Biểu đồ lịch sử 16 cells, cell min/max/average, cell delta và Relative Voltage.
- Phân biệt Battery Passport thật/demo và nguồn telemetry REAL_BMS/SIMULATED.

---

## 3. Các hạng mục đã hoàn thành

| Hạng mục | Kết quả | Trạng thái |
|---|---|---|
| ESP32 Gateway firmware | Đọc BMS thật, cấu hình Wi-Fi, gửi MQTT | PASS |
| RS485 / PYLON_485 | Đọc ổn định các thông số BMS trong thử nghiệm | PASS |
| MQTT / Cloudflare | TLS, authentication, QoS 1 | PASS |
| PostgreSQL ingestion | Dữ liệu REAL_BMS lưu thành công | PASS |
| Battery Passport | Tạo hồ sơ pin APESS và liên kết Gateway | PASS |
| REAL/DEMO classification | Backend tự quản lý trạng thái hồ sơ | PASS |
| Battery Health | Hiển thị số đo từ BMS thật | PASS |
| Battery Analytics | 16-cell history, SOC, voltage, current, temperature | PASS |
| Diagnostic Evidence API | Thống kê kỹ thuật 1h/24h/7d | PASS |
| Responsive Web/Mobile | Giao diện tương thích kích thước điện thoại | PASS |
| Production deployment | Đã triển khai Backend/Frontend | PASS |
| Android native acceptance | Chưa kiểm thử APK đầy đủ trên thiết bị thật | PENDING |

**Phiên bản Production:** `rc-933d8d6`
**Battery thực tế:** `PL-APESS-0001`
**Gateway:** `GW-000001`

Hệ thống đã ghi nhận dữ liệu mới liên tục sau các lần cập nhật ứng dụng. Trong lần kiểm chứng gần nhất, PostgreSQL có các bản ghi mới từ Gateway và Dashboard đọc đúng dữ liệu thông qua FastAPI.

---

## 4. Kết quả kỹ thuật và hiệu năng

Kết quả đo trong đợt nghiệm thu Production gần nhất:

| Chỉ tiêu | Kết quả |
|---|---:|
| Latest Telemetry API | ~156 ms |
| Diagnostic Evidence API — 1h | ~195 ms |
| Diagnostic Evidence API — 24h | ~300 ms |
| Diagnostic Evidence API — 7d | ~343 ms |
| Biểu đồ 7 ngày | ~1,0 giây |
| Backend RAM | ~83 MiB |
| Frontend RAM container | ~42 MiB |
| PostgreSQL RAM | ~44 MiB |
| Completeness 1h | 98,3% |
| Completeness 24h/7d | 94,6% |

Đây là kết quả ở quy mô Pilot một Gateway. Chưa đủ cơ sở kết luận hiệu năng khi có hàng chục hoặc hàng trăm Gateway.

Các bài kiểm thử tự động gần nhất ghi nhận:

- 64 backend tests PASS.
- 14 frontend tests PASS.
- 21 browser E2E tests PASS.
- Không có browser console errors được ghi nhận.
- Responsive tại 360/390/430px không tràn ngang.

Kết quả được tổng hợp từ báo cáo các Engineering Agent; cần tiếp tục audit độc lập trước khi mở rộng sản phẩm.

---

## 5. Các hạng mục đang chờ audit

### P0 — Bảo mật và tính toàn vẹn dữ liệu

- Audit RBAC, xác thực và phân quyền giữa các tổ chức.
- Kiểm tra bảo mật Gateway credentials và vòng đời cấp/thu hồi tài khoản thiết bị.
- Xác minh cơ chế chống dữ liệu giả mạo, trùng lặp và sai Gateway/Battery assignment.
- Kiểm tra an toàn database migration, backup và restore.
- Independent code review đối với các phần xử lý dữ liệu và bảo mật do AI phát triển.

### P1 — Độ tin cậy vận hành

- Thử nghiệm Gateway hoạt động liên tục 24–72 giờ.
- Kiểm tra các tình huống mất Wi-Fi, MQTT, Internet và PostgreSQL.
- Đánh giá nguy cơ mất telemetry khi mất điện hoặc mất kết nối kéo dài; hiện chưa có flash offline cache bền vững.
- Giám sát CPU/RAM, reconnect, lỗi ingestion và completeness.
- Kiểm chứng retention 7 ngày và khôi phục dữ liệu khi sự cố.
- Thiết lập CI và quality gates cho pull request.

### P1 — Mobile và trải nghiệm hiện trường

- Kiểm thử ứng dụng Android trên thiết bị vật lý.
- Đánh giá thao tác cảm ứng, lựa chọn cell, zoom và tooltip.
- Kiểm tra hoạt động sau khi app chạy nền hoặc mạng yếu.
- Kiểm tra tính tương thích khi Web frontend được cập nhật từ server.

### P2 — Khả năng mở rộng

- Load test với 10–20 Gateway trước khi triển khai diện rộng.
- Benchmark PostgreSQL và MQTT khi dữ liệu tăng.
- Kiểm tra nhiều tổ chức sử dụng đồng thời.
- Xây dựng monitoring, alerting và quy trình vận hành Gateway.
- Đánh giá chính sách lưu trữ dài hạn phục vụ bảo hành và phân tích SOH.

---

## 6. Những giới hạn hiện tại

Hệ thống chưa nên được giới thiệu là giải pháp tự động xác định sức khỏe pin hoặc phát hiện mọi lỗi BMS.

Cụ thể:

- SOH chưa được BMS hiện tại cung cấp, nên ứng dụng hiển thị N/A.
- Cell Delta là số liệu quan sát, chưa phải thuật toán xác định cell lỗi.
- Chưa triển khai AI Diagnostic Agent hoặc RAG thực tế.
- Chưa triển khai CAN inverter, OTA firmware và bộ nhớ flash lưu telemetry khi offline.
- Chưa thực hiện load test nhiều Gateway và audit bảo mật độc lập.
- Hiện dữ liệu phục vụ chẩn đoán tập trung vào cửa sổ lịch sử 7 ngày.

Các chức năng này sẽ được phát triển theo nhu cầu thực tế và sau khi hoàn thiện chất lượng nền tảng.

---

## 7. Kế hoạch giai đoạn tiếp theo

**Giai đoạn 1 — Engineering Quality Baseline**

- Thiết lập CI tự động.
- Independent code/security review.
- Kiểm tra backup/restore, lỗi mạng và reconnect.
- Theo dõi vận hành liên tục.
- Kiểm thử Android native.

**Giai đoạn 2 — Field Pilot**

- Mở rộng từ một Gateway lên khoảng 2–3 thiết bị thử nghiệm.
- Hướng dẫn kỹ thuật viên sử dụng Battery Passport và Diagnostics.
- Thu thập phản hồi từ hoạt động kiểm tra thực tế.
- Đánh giá độ ổn định của dữ liệu và khả năng truy xuất lịch sử.

**Giai đoạn 3 — Diagnostic Intelligence**

- Kết hợp telemetry với lịch sử kiểm tra, bảo trì và tài liệu BMS.
- Xây dựng các phép kiểm tra thống kê có thể giải thích.
- Phát triển AI/RAG Agent hỗ trợ kỹ thuật viên và kỹ sư.
- Mọi khuyến nghị kỹ thuật cần có bằng chứng và người phụ trách xác nhận trước khi hành động.

---

## 8. Kết luận và đề xuất

PinLab đã hoàn thành nền tảng thử nghiệm đầu tiên kết nối **Battery vật lý → IoT Gateway → Cloud → Database → Web/Mobile Diagnostics**.

Đây là bước xác nhận tính khả thi về kỹ thuật của mô hình quản lý vòng đời pin dựa trên dữ liệu thực.

**Đề xuất với công ty:**

1. Công nhận hoàn thành giai đoạn Production Pilot về mặt chức năng.
2. Tiếp tục duy trì hệ thống thu thập dữ liệu APESS thực tế.
3. Ưu tiên Engineering Quality & Security Audit trước khi mở rộng khách hàng.
4. Triển khai Field Pilot có kiểm soát với kỹ thuật viên.
5. Chưa đầu tư thêm hạ tầng quy mô lớn hoặc AI Agent phức tạp trước khi có đủ dữ liệu vận hành và nhu cầu sử dụng thực tế.

**Trạng thái tổng thể: FUNCTIONAL PILOT COMPLETE — QUALITY & SCALE AUDIT PENDING.**
