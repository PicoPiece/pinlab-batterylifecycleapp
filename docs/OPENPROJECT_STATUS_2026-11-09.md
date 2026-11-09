# OpenProject Task Status — 2026-11-09

- **Status:** Read-only snapshot; no OpenProject writes performed.
- **Snapshot time:** 2026-11-09T02:19Z
- **OpenProject:** https://pinlab-pm.picopiece.com
- **Scope:** Current projects and work packages in the PinLab OpenProject instance.
- **Credentials:** API token loaded from the approved local token file; not
  printed or committed.

## 1. Current project hierarchy

| ID | Identifier | Project | Parent |
|---:|---|---|---|
| 3 | `pinlab-internal-it` | PinLab — Internal IT & Infrastructure | — |
| 4 | `pinlab-it-001` | PinLab — OpenProject Infrastructure & Operations | 3 |
| 5 | `pinlab-battery-energy` | PinLab — Battery & Energy Engineering | — |
| 6 | `pinlab-software-platforms` | PinLab — Software Platforms | — |
| 7 | `pinlab-eng-001` | VF5 Battery & BESS Integration | 5 |
| 8 | `pinlab-sw-001` | PinLab Battery Lifecycle App | 6 |
| 11 | `pinlab-gateway-cloud-001` | Gateway & Cloud Integration | 6 |

`Gateway & Cloud Integration` now exists but has **no work packages** yet.

## 2. Work-package summary

- **22 work packages** total.
- **14 New**
- **7 In progress**
- **1 Scheduled**
- **0 Closed**
- No start dates, due dates or percentage-complete values are set.
- No app implementation time entries were added in this snapshot.

## 3. Work packages by project

### PinLab — OpenProject Infrastructure & Operations — 5

| ID | Subject | Type | Status | Assignee |
|---:|---|---|---|---|
| 38 | M1 — OpenProject Pilot Demo | Milestone | Scheduled | — |
| 43 | Security và Cloudflare Access | Task | In progress | — |
| 45 | Monitoring và alerting | Task | New | — |
| 46 | SMTP và application configuration | Task | New | — |
| 47 | Pilot 2–3 kỹ thuật viên | Task | In progress | — |

### PinLab Battery Lifecycle App — 7

| ID | Subject | Type | Status | Assignee |
|---:|---|---|---|---|
| 53 | Device integration requirements | Task | In progress | Hai Dang |
| 56 | API/integration boundaries | Task | In progress | Hai Dang |
| 58 | MVP specification & ADR index | Task | In progress | Hai Dang |
| 59 | Missing information register | Task | In progress | Hai Dang |
| 70 | Architect and brainstorm idea | Task | New | Chuong Vo |
| 71 | Android Mobile POC v0.1 | Milestone | New | — |
| 77 | MOB-06 Android Live Beta v0.2 | Task | In progress | — |

**#70 is CEO-owned and was not modified.**

### VF5 Battery & BESS Integration — 10

| ID | Subject | Type | Status | Assignee |
|---:|---|---|---|---|
| 60 | VF5/BESS system requirements & constraints | Task | New | Phuc Nguyen |
| 61 | 400 V/800 V decision criteria | Task | New | Hai Dang |
| 62 | Candidate 400 V/800 V architecture options | Task | New | Hai Dang |
| 63 | Interface & responsibility matrix | Task | New | Phuc Nguyen |
| 64 | BMS UDAN information collection | Task | New | Phuc Nguyen |
| 65 | Deye 80 kW integration data | Task | New | Hai Dang |
| 66 | BESS/PV/DC charger configuration register | Task | New | Phuc Nguyen |
| 67 | Integration verification plan | Task | New | Hai Dang |
| 68 | Architecture decision record & document index | Task | New | Hai Dang |
| 69 | BMS/inverter/BESS missing information register | Task | New | Phuc Nguyen |

### Gateway & Cloud Integration — 0

Project `11` exists but no `INT-01…INT-06` or other work packages are
currently present.

## 4. Observations

- The OpenProject portfolio does not yet reflect the completed Mission 017,
  018, 018.1 and 018.2 work. App tasks #53, #56, #58, #59 remain **In
  progress**; #71 remains **New**; #77 remains **In progress**.
- The app project still has no explicit work package for the production MQTT
  pilot, analytics, classification, diagnostic evidence or the Mission 018.2
  deployment.
- Gateway & Cloud Integration was created but is empty.
- Status discipline remains conservative: implementation and testing are not
  marked Closed, and no time entries were created.
- No OpenProject work package, time entry, project or user was modified during
  this report.

## 5. Required follow-up

Updating statuses, app evidence and Gateway/Cloud work packages requires an
explicitly approved OpenProject write path. The previous sync attempt was
blocked by `403 MissingPermission`; that permission has not been re-tested by
creating or mutating an object in this read-only report.

Recommended updates once write access is approved:

1. Add Mission 017/018/018.1/018.2 evidence to app work packages and update
   their status without marking physical Android acceptance as complete.
2. Create the Gateway/Cloud integration work packages in project 11.
3. Keep #70 untouched.
4. Do not create retroactive time entries without verified effort.
