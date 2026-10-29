# Android Mobile POC v0.1

**Status:** POC — internal debug APK, not a production Android release.

## Scope

- Capacitor Android shell around the existing React/Vite frontend.
- Login/logout, forced password change, account/change password.
- Dashboard, Battery Registry/search, Battery Passport, Inspections, Warranty Preview, Monitoring Preview.
- VI/EN, Android Back, safe-area/status bar and keyboard handling.
- Future BLE Gateway interface boundary only; no BLE plugin, scanning, pairing, ESP32/JK/PACE protocol or BMS control.

## Pinned toolchain

| Component | Version |
|---|---|
| Node.js | 24.14.1 |
| npm | 11.11.0 |
| JDK | Temurin 21.0.13 |
| Gradle wrapper | 8.14.3 |
| Capacitor | 8.6.0 |
| Android SDK | 36 |
| Build Tools | 36.0.0 |
| minSdk / targetSdk | 24 / 36 |
| App ID | `com.pinlab.batterylifecycle` |
| Version | `0.1.0` (versionCode 1) |

## Build

```bash
cd frontend
npm ci
VITE_API_BASE_URL='http://localhost:8892/api/v1' npm run build
npx cap sync android
cd android
./gradlew assembleDebug --no-daemon
```

The debug APK is:

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

The repository does not commit APKs. Final POC artifact:

```text
/home/picopiece/PinLab/Projects/BatteryLifecycleApp/artifacts/android/PinLab-BatteryLifecycle-0.1.0-debug.apk
SHA256 03963b1546b190a412920fc406483f03c2535f444334ca3f7ac26e62568fd5e3
Size   5,149,203 bytes
```

## Emulator QA result

Tested on Android 16 / API 36 emulator (`sdk_gphone64_x86_64`) with the QA backend through `adb reverse`.

| Check | Result |
|---|---|
| Debug build | PASS |
| APK install / package / debug signature | PASS |
| Login / logout | PASS |
| Session persistence after app restart | PASS |
| Forced first-password change | PASS |
| Account / change password page | PASS |
| Dashboard | PASS |
| Battery registry / search | PASS |
| Battery Passport | PASS |
| Inspection list / detail | PASS |
| Warranty Preview | PASS |
| Monitoring Preview | PASS |
| VI / EN switch | PASS |
| Android Back button | PASS |
| Status bar / safe area | PASS |
| Keyboard does not cover login fields | PASS |
| Physical device | BLOCKED — no physical device attached |
| Real BLE scan/pair/BMS | BLOCKED/out of scope |

QA screenshots are in `artifacts/android/` alongside the APK. The APK is debug-signed; no release keystore was created.

## QA backend on emulator

The POC uses the QA stack, not production:

```bash
# Host: make QA accept the Capacitor WebView origin
# CORS_ORIGINS must include http://localhost

# Emulator: forward QA frontend/API port
adb reverse tcp:8892 tcp:8892
```

`VITE_API_BASE_URL=http://localhost:8892/api/v1` makes API calls from the WebView reach the QA FastAPI backend through the Android emulator's adb reverse tunnel. `androidScheme: http` and the debug-only manifest cleartext setting are POC-only and must not be copied to a production build.

## Authentication findings

- QA cookie auth works when the WebView origin (`http://localhost`) and QA origin are same-site and QA CORS allows that origin.
- Login, logout, forced password change, account page and session persistence across app restart were verified on the Android emulator.
- No production authentication, cookie policy or CORS configuration was changed.
- Production HTTPS/cookie behavior was not used for the POC; a production Android release needs a reviewed HTTPS/OAuth or equivalent mobile session design.

## Future BLE boundary

See `frontend/src/mobile/bleGateway.ts`. It defines discovery, identity/model, provisioning state, battery mapping, capabilities, pairing and disconnect contracts. The default adapter throws `BleGatewayUnavailableError`; no BLE plugin is installed or activated.

## Known limits

- Debug APK only; debug signature, not a release keystore.
- Emulator verification only; physical-device verification pending if no device is available.
- No offline sync, push notifications, real-time BMS, MQTT/Node-RED/ThingsBoard or app-store packaging.
- `@capacitor/assets` is a development-only asset generator and contributes dev dependency audit findings.

---

# v0.2 — Live Server Integration

## Decision

For safe production reuse of the existing web authentication, v0.2 uses a **same-origin Capacitor wrapper**: `server.url` points to the HTTPS Web App origin. The WebView then has the same origin as the FastAPI API (`/api/v1`), so the existing HttpOnly/Secure/SameSite=Lax cookie, CORS allowlist and CSRF Origin guard remain unchanged.

This avoids the unsafe alternative of loading local assets from `https://localhost` and calling production cross-origin, which would require production CORS and cookie changes.

## Build

```bash
cd frontend
npm run build
CAPACITOR_SERVER_URL='https://pinlab-app.picopiece.com' npx cap sync android
cd android
./gradlew assembleDebug --no-daemon
```

The generated Android config contains `server.url: https://pinlab-app.picopiece.com`; the source default remains local for POC/QA builds.

## Artifact

```text
/home/picopiece/PinLab/Projects/BatteryLifecycleApp/artifacts/android/PinLab-BatteryLifecycle-0.2.0-debug.apk
SHA256 972c8adfb777c2c4aab10b3767140e9f2ed2e34d5093e36c9000f7d9d9f751c2
Size   5,149,439 bytes
Version 0.2.0 (versionCode 2)
```

## QA HTTPS staging result

A Cloudflare Quick Tunnel exposed the QA stack over HTTPS without ADB. The APK loaded the QA Web App same-origin.

| Check | Result |
|---|---|
| HTTPS WebView origin | PASS — QA tunnel origin |
| No `adb reverse` | PASS |
| Login / dashboard GET | PASS |
| Authenticated inspection POST | PASS — QA inspection ID 12 |
| Inspection visible to QA Web/API | PASS |
| Session persistence after app restart | PASS after native `CookieManager.flush()` |
| Logout | PASS |
| Production untouched | PASS |

## Production smoke

| Check | Result |
|---|---|
| Production URL loaded in APK | PASS — `https://pinlab-app.picopiece.com/login` |
| WebView origin | PASS — production origin |
| `/api/v1/health` from WebView | PASS — HTTP 200 |
| Unauthenticated `/auth/me` | PASS — HTTP 401 |
| Production login with real account | **BLOCKED** — no authorized production test account/approval |
| Production inspection create + Web verification | **BLOCKED** — would write production data |
| Physical device Wi-Fi/4G | **BLOCKED** — no physical device attached |

## Required production changes

For the recommended same-origin wrapper: **none** to auth/CORS/CSRF; only CTO approval to use a dedicated production test account and, separately, approval for a controlled inspection-write test.

If local bundled assets plus production API are required later, production would need a reviewed CORS allowlist for the WebView origin and a SameSite/cookie or native secure-token design. That is not approved or implemented.

## Rollback

- Uninstall/reinstall the APK; v0.1 APK remains available.
- No production deployment or production data mutation was performed.
- QA changes were local to `.env.qa` (CORS/cookie test settings) and the QA database only.
