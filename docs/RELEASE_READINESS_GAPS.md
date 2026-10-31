# RELEASE READINESS GAPS — Android / iOS / Network

**Audit date:** 2026-10-31  
**Mode:** Read-only; no signing, build, deploy or production changes.  
**Reviewed commit:** `198f2ea`.

## 1. Android: current state

| Item | Status | Evidence |
|---|---|---|
| Capacitor Android project | IMPLEMENTED | `frontend/android/`; `frontend/capacitor.config.ts` |
| Application ID | IMPLEMENTED | `com.pinlab.batterylifecycle`; `frontend/android/app/build.gradle:4-7` |
| Version | IMPLEMENTED | `versionName 0.3.0`, `versionCode 4`; `frontend/android/app/build.gradle:10-11` |
| Min/target SDK | IMPLEMENTED | minSdk 24 / targetSdk 36; `frontend/android/variables.gradle:2-4` |
| Production server | IMPLEMENTED | production wrapper uses `server.url=https://pinlab-app.picopiece.com`; `frontend/capacitor.config.ts:3-15` |
| Debug APK | IMPLEMENTED | QA and production-wrapper APKs exist under `artifacts/android/`; debug certificate |
| Release signing | MISSING | No release signing config / keystore in `frontend/android/app/build.gradle:19-23` |
| Release build verification | NOT VERIFIED | No release-signed APK/AAB evidence |
| Release manifest | MISSING | No product/native/API/channel/checksum manifest file |
| Git release tag | MISSING | `git tag` returned no tags |
| Build traceability | PARTIAL | Android version is recorded, but frontend package is `0.1.0` (`frontend/package.json:4`) and FastAPI reports `0.1.0` (`backend/app/main.py:40`) while Android is `0.3.0`. |
| Distribution | PARTIAL | Sideload debug APK; no managed distribution, Play, or update channel |
| Rollback | PARTIAL | Previous APK/artifact can be reinstalled; production frontend image `rc-244a969` remains available. |
| iOS | NOT VERIFIED | No iOS Capacitor project or build evidence in repository. |

## 2. Android risks

1. **Debug signing is not a release identity.** It is acceptable only for controlled internal diagnostics, not agency distribution.
2. **Remote frontend wrapper changes installed app behavior without a native app update.** `server.url` means UI changes are immediate; deployment/rollback and frontend cache behavior must be recorded separately from Android `versionName`.
3. **Accidental local/debug config risk.** If `CAPACITOR_SERVER_URL` is absent, `capacitor.config.ts` defaults to `androidScheme: http`, `hostname: localhost`, `cleartext: true` (`frontend/capacitor.config.ts:9-15`). A release build must fail or warn if the production URL is not supplied.
4. **Debug-only cleartext manifest** exists in `frontend/android/app/src/debug/AndroidManifest.xml:3-4`; ensure release never merges this source set.
5. **No release manifest/tag.** It is hard to prove which commit, backend API, frontend image and APK were tested together.
6. **No iOS verification.** Do not claim iOS support.

## 3. Release manifest proposal

Every internal/pilot/production artifact should record:

```yaml
product_version: 0.3.0
native_build_number: 4
git_commit: <full SHA>
frontend_image_tag: <registry/image:tag@digest>
backend_version: <API/build identifier>
api_compatibility: /api/v1; backend min/max supported by app
release_channel: internal | pilot | production
artifact: PinLab-BatteryLifecycle-<version>-<channel>.apk
sha256: <checksum>
build_date: <ISO-8601>
build_environment: QA | production
release_notes: <short>
signing: debug-internal | release-keystore-id
distribution: sideload | managed | store
rollback_target: <previous version/tag>
```

Do not store signing keys, passwords or keystore material in the manifest.

## 4. Network failure handling

| Scenario | Status | Evidence / behavior |
|---|---|---|
| API request timeout/abort | MISSING | `frontend/src/api.ts:47-72` uses `fetch` with no timeout/AbortController. |
| Clear initial load error | PARTIAL | `ErrorState` exists (`frontend/src/components/States.tsx:22-29`); pages generally render it. |
| Save failure shown to user | PARTIAL | Inspection save catches `ApiError` and shows form error (`frontend/src/pages/InspectionPage.tsx:112-127`); upload errors are shown in detail pages. No retry queue. |
| Login/session failure | PARTIAL | 401 dispatches `pinlab:unauthorized` and clears user (`frontend/src/api.ts:65-68`; `auth.tsx:38-43`); no explicit “session expired” message. |
| Last successful telemetry update | MISSING | Monitoring shows a static `—` for last received (`frontend/src/pages/MonitoringPage.tsx:185-189`). |
| Stale telemetry indicator | MISSING | No age/threshold/STALE status. Existing labels are preview/DEMO, not freshness. |
| Offline sync | OUT OF SCOPE | No local DB/queue; do not imply offline support. |
| False success on failed save/upload | NOT FOUND | Success state is set after awaited API completion; failures render error. This is not a substitute for network retry testing. |

**Recommendation:** add explicit request timeout/abort, a retry affordance, a visible last-success timestamp and STALE label for telemetry. Do not implement offline sync in the security/agency implementation mission.

## 5. Rollback readiness

| Layer | Current rollback |
|---|---|
| Frontend web | Previous image `pinlab-app-frontend:rc-244a969` is available; current deployed image is `rc-198f2ea`. Redeploy previous frontend tag without DB migration. |
| Backend/API | Current backend image `pinlab-app-backend:rc-244a969`; no auth/API change in current frontend release. |
| Android | Reinstall previous APK or build from previous commit; current APK is debug-signed. |
| DB | No migration was part of v0.3 UI release; agency-security migration would require backup and explicit rollback plan. |

## 6. Release gates

### Gate A — Internal Android Beta

**CONDITIONAL GO** for strictly closed PinLab-only debug testing with synthetic/controlled data.

Blockers before general internal distribution:

- release-signed APK or explicit CTO exception for debug-only internal use;
- complete release manifest and Git tag/commit traceability;
- physical-device smoke on Android with production account;
- explicit account provisioning/handoff and session revocation check;
- no real customer/agency data;
- documented rollback path.

### Gate B — Controlled Agency Pilot

**NO-GO**

Mandatory blockers:

- backend-enforced tenant isolation and object authorization;
- Agency Admin/Agency Technician roles and agency-scoped user provisioning;
- battery assignment controls and unassigned-asset behavior;
- attachment ACL on list/download/delete;
- audit trail for user/role/asset/evidence changes;
- release manifest/signing and rollback approval;
- backup/recovery procedure and restore evidence;
- agency onboarding/security acceptance.

### Gate C — Broader Agency Release

**NO-GO**

Additional work: formal security review, scalable rate limiting/session strategy, external support/SLA, privacy/legal review, managed distribution, monitoring/alerting, documented backup/offsite recovery, and independent penetration/regression testing.

## 7. Required CTO decisions

1. Accept debug-signed APK only for closed internal testing, or require release signing before Gate A.
2. Approve the release manifest and artifact naming convention.
3. Decide whether `PinLab Manager` is cross-agency or assigned-agency scoped.
4. Approve/deny production authenticated smoke test account for release verification.
5. Approve the agency data model/migration strategy before any schema work.
