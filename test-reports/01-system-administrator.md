# 01 — System Administrator (Prompt 1)

**Date:** 2026-09-29 · **Persona:** Admin Sierra, plus two new registrations (`quinn.faculty@hau.edu.ph`, `rho.student@student.hau.edu.ph`) · **Backend:** local (port 5181)
**Team decision this session:** permission overrides are **deny-only** (flag `PERMISSION_OVERRIDES`). WORKFLOWS.md lists overrides on the dashboard but never defines them.

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **60 / 60 pass**: 19 new in `admin.test.js`. The 41 existing tests are unchanged and still pass |
| Production build | Builds. The dev-tools strings are absent from `dist/` |
| Browser walk-through (§8 script) | Registration accept/reject, verify via outbox, pending queue, activation, Dean grant → queue → removal, override apply → guard change → lift, settings → verdict form, T20 record-only view, Records + Reports CSV, T14 empty state, 375 px width. **No console errors** on a fresh load |
| Impeccable audit | Detector: 0 findings. Manual: no P0/P1 (see §10) |
| Action checks | 12 / 12 pass (§3) |
| Negative tests | 9 / 9 pass, UI and guard (§4) |
| §7 scenarios | T14, T20 and T21 pass. T20's annotation part is guard-only (R12) |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/pages/Admin.jsx` | Rebuilt as four tabs: **Accounts**, **Permission overrides**, **Global settings**, **Tags and policies**. Accounts has an *Awaiting activation* queue (verified vs not yet verified, with an Activate button) plus a status filter on the full list. The Program Chair/Coordinator row gets a **program-scope editor**. *(Later split into three pages at the team's request: **Accounts** `/admin/accounts`, **CAAC configuration** `/admin/caac` — overrides + tags and policies — and **Global settings** `/admin/settings`.)* | S0.3, §4 Sys Admin |
| `src/services/actions.js` | New `setProgramScope`, `revokeCapability`, `liftOverride` and `updateRevisionDays`. Each goes through `authorizeInstitution`, then `perform`, then an audit entry with before → after. `recordVerdict` reads the countdown from settings | S0.3, §4, S7.6 |
| `src/domain/caac.js` | `overridesFor()`: `evaluate()` moves a revoked capability to `dormant`, with the override as the reason (`denialOf`). New capability `settings.manage` (Admin). Overrides apply in `resolveContext` and `resolveInstitution` | §4 overrides, R3 |
| `src/domain/guard.js` | Denials name the override when it is the cause | R3 |
| `src/services/core.js` | The bundle carries `overrides` for this project and for every project | R3 |
| `src/domain/settings.js` (new) | `revisionDaysOf(snap)`: the value in `settings/global` wins, else the flag `REVISION_DAYS` | S7.6 "configurable" |
| `src/domain/flags.js` | `PERMISSION_OVERRIDES = 'deny-only'` (decided). `REVISION_DAYS` is marked as the starting value | R4 |
| `src/backend/schema.js`, `seed.js` | Collections `permissionOverrides` and `settings`. The local adapter already tolerates added collections, so there is **no store-key bump** | — |
| `firestore.rules` | Read rules for `permissionOverrides` (Admin + the affected user) and `settings` (signed in). Note added: the claims sync must honour overrides | Rules ↔ caac.js invariant |
| `src/pages/Dashboard.jsx` | Admin: "Accounts to activate" item. **T14:** a student with no group gets a "What happens next" empty state. Empty-queue copy fixed; it had contradicted the header | S0.3, T14 |
| `src/components/Shell.jsx` | The Administration link counts verified accounts waiting for activation | S0.3 |
| `src/pages/Records.jsx`, `Reports.jsx`, `components/ui.jsx` | **Records export (CSV)**. Shared `downloadCsv`; Reports uses it too | S10.2, S10.3 |
| `src/components/panels/DefensePanel.jsx` | The verdict form quotes the admin-set countdown | S7.6 |
| `src/styles.css` | `.tab-n`, `.scope` and `.tone-warn`, built on the existing tokens | — |
| `src/__tests__/admin.test.js` (new) | 19 tests (below) | — |
| `CLAUDE.md` | Two lines on overrides and settings | Docs |
| `src/components/panels/DocumentsPanel.jsx` | *(Team request, outside the Admin scope.)* No upload shows an Abstract field any more (topic proposal, concept paper and every manuscript type): the abstract is part of the PDF. Checked in the browser: a Proposal Manuscript v1 was submitted with no abstract, and the Instructor 1 + Adviser email went out. **Prompt 2 (Student) should re-check the upload form** | S4.1, S5.3, S6.3, S7.4, S8.1 |

## 3. Action checks

"UI" means checked in the browser this session. "Guard" means rejected or allowed in `admin.test.js`.

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit | Notes |
|---|---|---|---|---|---|---|---|---|
| S0.1 | Register `  Quinn.Faculty@HAU.edu.ph ` | ✅ | ✅ domain check in service | Inactive, unverified, email normalized | Admin: *Awaiting activation* (not verified) ✅ | ✅ verification email in outbox | ✅ `ACCOUNT_REGISTERED` | Student `Rho.Student@Student.HAU.edu.ph` too ✅ |
| S0.2 | Click the verification link (outbox) | ✅ | token, single use | verified. Student → `@Student`, faculty → `@Faculty` (NEW-1) | Admin: Activate enabled, nav badge 3 ✅ | — | ✅ `EMAIL_VERIFIED` before → after | Unverified sign-in refused ✅ |
| S0.3 | Activate | ✅ | ✅ `admin.accounts`; Alpha rejected | Active | User can sign in ✅ | — (§3 lists none) | ✅ `ACCOUNT_STATUS_CHANGED` | Refused while unverified |
| S0.3 | Grant Dean to Quinn | ✅ | ✅ | `globalRoles += Dean` | Quinn: G4 "Approve adviser assignment — ready" ✅ | — | ✅ `GLOBAL_ROLES_CHANGED` | G4 set to Adviser Approval via dev tools |
| S0.3 | Remove Dean | ✅ | ✅ | role removed | Quinn: empty worklist; pasted `/projects/p_g4` denied ✅ | — | ✅ | **Live**: takes effect on the next render, no reload (see §7) |
| S0.3 | Grant PC + set program scope | Admin UI ✅ | ✅ | scope set | PC can assign an adviser only once scoped ✅ (test) | — | ✅ `PROGRAM_SCOPE_CHANGED` | Without a scope a new PC sees nothing. The UI warns |
| S0.3 | Grant URO | via Grant menu | ✅ | role | `URO_VERIFY` allowed at URO Verification ✅ (test) | — | ✅ | — |
| §4 | Permission override: revoke `verdict.record`, Alpha, G2 | ✅ | ✅ | override row (deny) | Alpha: "Record the official verdict" gone; CAAC Inspector shows the override reason ✅ | — | ✅ `PERMISSION_OVERRIDE_APPLIED` (effect "as the policies decide" → "revoked", reason in meta) | — |
| §4 | Lift override | ✅ | ✅ | `liftedAt` set, row kept | Alpha's grant restored ✅ (test) | — | ✅ `PERMISSION_OVERRIDE_LIFTED` | Listed under "Lifted overrides" |
| §4 | Change revision countdown 7/14 → 10/21 | ✅ | ✅ `settings.manage`; Alpha rejected | `settings/global` | Panel Chair's verdict form reads "10 days … 21" ✅. Next verdict due in 10 days ✅ (test) | — | ✅ `SETTINGS_CHANGED` | Running countdowns unchanged (NEW-20) |
| S10.2 | Records archive: list + export CSV | ✅ | `records.manage` | — | — | — | — | Columns: title, program, research area, term, adviser, students, archived, result. **No manuscript content** |
| S10.3 | Reports export CSV | ✅ | `report.generate` | — | — | — | — | Project, program, block, stage, status, result only |

## 4. Negative tests (Must NOT)

| Must not | UI | Guard |
|---|---|---|
| Open or read a manuscript (T20) | ✅ Only the Overview + History tabs. History shows workflow events only | ✅ `readDocuments` denied. `viewBundle` returns no documents, forms, logs, annotations or AI summaries **at all 18 stages** |
| Annotate (R12, guard only) | Not built | ✅ `annotate` denied; `addAnnotation` rejected |
| Record a verdict | ✅ No verdict form | ✅ `recordVerdict` rejected |
| Sign forms | ✅ No Forms tab | ✅ `signForm` rejected on G3's Approval Sheet |
| Approve any workflow gate | ✅ The Next-step panel is read-only ("Waiting on Panel Chair") | ✅ Every gate action denied at every stage; `runGate` rejected (`ENDORSE_ROSTER`, `ENDORSE_TO_URO`) |
| Assign advisers or panels (T16 note) | ✅ No assign/unassign controls | ✅ `assignRole` rejected |
| Review a document | — | ✅ `submitReview` rejected |
| Assign Instructor 1/2 (OQ#5 — not given to the Admin) | ✅ | ✅ `group.create`, `manageRoster` and `assignInstructor2` denied |
| Override own account / add a permission | ✅ Own account not listed | ✅ Self rejected; a forged `effect: 'allow'` row is ignored by the guard |

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T14 | **Pass** (guard + UI) | A new student (Rho) and Whiskey see "You are not in a project group yet" with no project data. `canView` is false for every project. This closes the empty-state gap noted in 00-setup |
| T20 | **Pass** (guard + UI) · annotation UI **Not built** (R12) | Admin opens G2 as a record only. Every action other than `viewProject` is denied at all 18 stages. Forced calls (verdict, gate, signature, assignment, annotation, review) are rejected |
| T21 | **Pass** | Every Prompt 1 action writes an audit entry with actor, hat `System Administrator`, and before → after (listing in §3, verified in the browser store and in tests) |

## 6. Config flags used

| Flag | Value | Note |
|---|---|---|
| `ACCOUNT_ACTIVATION` | `email+admin` | Verification first, then the Admin activates (OQ#4) |
| `FACULTY_BASE_IDENTITY` | `true` | `@hau.edu.ph` → `@Faculty`, no global grants (NEW-1) |
| `REVISION_DAYS` | Minor 7, Major 14 | **Now the starting value.** The Admin setting overrides it |
| `PERMISSION_OVERRIDES` | `deny-only` | **New, decided this session.** `'off'` ignores overrides and hides the tab (tested) |
| `INSTRUCTOR_2_ASSIGNER` | Program Chair/Coordinator | The Admin is not given it (OQ#5) |

## 7. Open items hit

- **OQ#4** — Mockup default in place. Registration → verify → Admin activates.
- **NEW-1** — The `@Faculty` base identity grants nothing (tested).
- **OQ#5** — Not given to the Admin (tested).
- **NEW-19 (new, decided):** WORKFLOWS.md has no definition of "permission overrides". The team chose deny-only: one capability, one user, one project or every project, a required reason, liftable. Institution capabilities can only be revoked everywhere.
- **NEW-20 (new — flag for the team, not decided):** Should a change to the revision-countdown length move countdowns that are already running? **Current behaviour: no.** The deadline is fixed when the verdict is recorded, and only later verdicts use the new length. The settings screen says so.
- **NEW-21 (new):** S10.2 "retention for graduated cohorts" has no definition (how long, what happens after, who approves). Not built. The archive offers list, search and export only.
- **NEW-22 (new):** §3 lists no email or notification for S0.3 role changes, activation or overrides. None is sent, so an affected user learns about the change only from their dashboard. Should they be told?
- **NEW-23 (new):** WORKFLOWS.md doesn't say who sets a Program Chair/Coordinator's program scope. The Admin sets it here: the role has no effect without it.
- **Live vs next load (item 3):** On the local backend a role removal is **live**: the store subscription re-renders, so the worklist empties and a pasted URL is denied without a reload. The Firebase build depends on the custom-claims refresh and the missing Cloud Functions (**NEW-17**). **Not verified.**
- **R10 — shared code touched:** `caac.js` (evaluate / resolve*), `guard.js` (denial text), `core.js` (bundle), `actions.js` (recordVerdict), Dashboard, schema. All 41 earlier tests still pass. **00-setup does not need a re-run.** Prompt 8 (Panel Chair) should note the admin-set countdown text on the verdict form.

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

   Dev tools → **Reset seed** for a clean start.
2. **Register** tab: name "Test", email `test@gmail.com` → expect "Registration is restricted…". Repeat with `test@hau.edu.ph.evil.com`, `test@evilhau.edu.ph` and `test@fake.student.hau.edu.ph`; each is rejected.
3. Register `  Quinn.Faculty@HAU.edu.ph ` → expect "Account created for quinn.faculty@hau.edu.ph…".
4. Register `Rho.Student@Student.HAU.edu.ph` with section `WD-401` (program WD) → account created. A section that does not fit the program, such as `WD-4A` or `CS-401` for WD, is rejected.
5. Sign in as `rho.student@student.hau.edu.ph` → expect "Verify your email address first".
6. Sign in as `sierra@hau.edu.ph` → **Accounts** (Administration group). *Awaiting activation* lists Quinn and Rho as "Not verified yet"; their Activate buttons are disabled.
7. **Dev tools** → Outbox → **Verify my email** on both emails. The Worklist now shows "3 verified registrations waiting for activation" and the nav badge reads 3.
8. Accounts → **Activate** Rho and Quinn.
9. Switch persona → **Rho Student** → expect "You are not in a project group yet" (T14).
10. Switch to **Admin Sierra** → Accounts → Prof. Quinn Faculty → **+ Grant… → Dean**.
11. Dev tools → Set project to stage: **G4 → Adviser Approval** → Apply.
12. Switch to **Prof. Quinn Faculty** → Worklist shows G4 with "Approve adviser assignment — ready".
13. Switch to **Admin Sierra** → remove the `@Dean` tag from Quinn.
14. Switch to **Quinn** → Worklist is empty; `/projects/p_g4` shows "This project is not available to you".
15. As **Admin Sierra** → **CAAC configuration** → **Permission overrides**: Account Prof. Alpha, capability `verdict.record`, Where *Smart Queue Management…* (G2), any reason → **Revoke capability**.
16. Switch to **Prof. Alpha** → G2 no longer shows "Record the official verdict". In the G2 workspace, the CAAC Inspector says "Revoked for your account by a System Administrator override".
17. As **Admin Sierra** → **Lift** the override. As **Prof. Alpha**, the verdict step is back.
18. As **Admin Sierra** → **Global settings** → Minor 10, Major 21 → Save.
19. As **Prof. Alpha** → G2 → Defense tab → the form reads "due in 10 days and major revisions in 21". Countdowns already running (G3) are unchanged.
20. As **Admin Sierra** → **Audit trail**. Expect these entries, each with hat *System Administrator* and before → after:
    - `ACCOUNT_STATUS_CHANGED`
    - `GLOBAL_ROLES_CHANGED` ×2
    - `PERMISSION_OVERRIDE_APPLIED` and `PERMISSION_OVERRIDE_LIFTED`
    - `SETTINGS_CHANGED`
21. As **Admin Sierra** → open `/projects/p_g2` → only the **Overview** and **History** tabs, with no assign, sign or approve controls (T20).
22. Dev tools → **G3 → Archived** → **Records archive** → **Export CSV**. The file has record fields only: no abstract or document text.

## 9. §9 items found

None new.

## 10. Impeccable audit (changed screens)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Tabs are buttons with `role="tab"` but no arrow-key roving or `aria-controls`. This is the app-wide pattern (P2). Tab counts read as "Accounts1" to screen readers (P3) |
| 2 | Performance | 4 | — |
| 3 | Responsive | 3 | No horizontal scroll at 375 px. The `×` buttons on tags are under 44 px, the existing pattern (P2) |
| 4 | Theming | 3 | New CSS uses existing tokens only. The app has no dark mode (systemic, out of scope) |
| 5 | Implementation integrity | 4 | Detector: 0 findings. Stays in the incumbent system: tables, rules and maroon accent, no new card grid |
| **Total** | | **17/20** | Good |

No P0 or P1 issues. The P2 items are app-wide patterns that predate this pass.
