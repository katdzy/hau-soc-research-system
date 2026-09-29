# 00 — Setup and audit (Prompt 0, Part B)

**Date:** 2026-09-29 · **Scope:** central CAAC guard, §6 seed, dev-only harness, config flags, guard unit tests.
**Team answers applied (Part A):** yes to every proposed default. NEW-5 and NEW-6 keep the current behaviour behind flags; Vitest added; the 18 stage keys stay and map to §3.0 stages; the Program Chair assigns Instructor 2 (OQ#5); build on the uncommitted `SignIn.jsx` / `App.jsx` / `docker-compose.yml` changes; remove §9 leftovers (OTP etc.).

## Start on localhost

```bash
npm install
VITE_BACKEND=local npm run dev -- --port 5181
```

Open http://localhost:5181. The `VITE_BACKEND=local` override matters, because `.env` currently points at the live Firebase project `hausoc-research`, and Vite loads `.env`. In the Claude desktop app the `capstone-prototype-local` launch config does the same. Tests: `npm test`.

---

## ⚠ Incident: tests reached the live Firebase project

The first run of `services.test.js` loaded `.env` (`VITE_BACKEND=firebase`, `VITE_USE_EMULATORS=false`, project `hausoc-research`). Vitest loads `.env` like Vite does. The run called `db.replaceAll(buildSeed())` against the live project in 14 `beforeEach` hooks over about 140 s. `replaceAll` deletes every document in each collection, then writes the seed.

The Firestore SDK logged `RESOURCE_EXHAUSTED: Quota exceeded` and every hook timed out. **It is not known whether any deletes or writes went through before the quota refused them.** Nothing further was sent to that project.

- **Check:** open the Firebase console for `hausoc-research` and see whether the collections still hold their data, or now hold the §6 seed (`p_g1`–`p_g4`, users such as `alpha@hau.edu.ph`).
- **Fixed so it cannot recur:**
  - `vite.config.js` sets `test.env.VITE_BACKEND=local`.
  - `src/backend/index.js` forces `local` when `MODE === 'test'`.
  - `services.test.js` refuses to run unless `db.name === 'local'`.
  - The dev-tools reset, scenario loader and set-stage controls throw when `isLiveBackend` is true.

---

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **41 / 41 pass**: 26 guard (T1–T21 + R12 guard-only + accounts), 14 service/write-path, 1 seed-date check |
| Mutation check | Setting `PC_PROGRAM_VISIBILITY='full'` and `BLOCK_ADVISER_ON_PANEL=false` makes T2, T3 and T19 fail as they should; flags restored |
| Production build | Builds. No dev-tools code in `dist/` (grep for the harness strings finds nothing) |
| Browser (local backend, port 5181) | See §5. Checked: sign-in domain rejection, T2/T3 as Prof. Alpha, pasted-URL denial, T16 live unassign, T20 Admin tabs, T14, the full S0 register → verify → activate → sign-in path. No console errors |
| `firestore.rules` | Updated to mirror the new `project.view` / `document.read` policies. **Not verified**: the emulators were not running |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/domain/guard.js` (new) | One guard: `canView`, `canDo(user, action, bundle, target)`, the `ACTIONS` table (capability + allowed doc/log states; one action per stage gate), `allowedActions(hat, stage, docState)`, and the read filter `viewBundle` (+ `canViewAnnotation`) | §2.2, R3 |
| `src/domain/caac.js` | Adds `document.read`, separate from `project.view`, so the Admin can open project records but never documents (T20). Program Chair opens a project only while a PC step is active (NEW-11). AI-summary audience from the flag (students lose `ai.view`). `annotation.viewReleased` for students (OQ#3). Instructor-1 window, log signer and proposal scheduler come from flags. Inactive/unverified accounts get no grants | §2.2, T3, T20, R12 |
| `src/services/core.js` | `authorizeOn` reads the **signed-in session** and the **store fresh**: a caller's user object and snapshot are ignored, so a forged or stale call is rejected. `perform()` adds in-flight dedupe and runs the write in `db.transaction`. `logAudit` records actor, **role hat**, **before → after**. `logHistory`. `notify` writes the in-app notification plus a mock email in `outbox` | R3, R6, R7, T17, T21 |
| `src/services/actions.js` | Every write goes through guard → `perform` → audit + history → notify/outbox. `runGate` trusts only the gate's name. Also added: an adviser-approval step needing both offices (NEW-7); `flagOverdueRevisions` (S8.2); registration with a verification token plus admin activation (OQ#4); `markNotificationRead` for your own notifications only; `signForm` through the guard | S0, S2.2, S8.2, R3, R6, R7 |
| `src/backend/localAdapter.js` | `transaction()`: all-or-nothing with rollback, published once. Store key moved to `hausoc.db.v3` | R7 |
| `src/backend/firebaseAdapter.js` | `transaction()` passthrough, marked not atomic (needs a Cloud Function, OQ#1) | R7 |
| `src/backend/stageBuilder.js` (new) | Puts any project at any stage with plausible prerequisite data (earlier gates done, current stage open). Used by the seed and the dev tools | Part B.3 |
| `src/backend/seed.js` | Rewritten: §6 personas, G1 Conceptualization, G2 Proposal Defense, G3 Final Revision, G4 Group Formation (I1 Bravo, no adviser), Whiskey with no group, Prof. Papa awaiting activation, Prof. Foxtrot as G3 Panel Chair | Part B.2 |
| `src/domain/flags.js` (new) | Every Mockup default plus the Prompt-0 decisions, with `FLAG_NOTES` (source, kind, where wired) | R4 |
| `src/domain/constants.js` | `FACULTY` global role (NEW-1). Exact-domain `accountType`, `normalizeEmail`, `isInstitutionalEmail`. Verdicts and revision days now come from the flags | S0.1, OQ#10 |
| `src/domain/stages.js` | `MACRO_STAGES` / `macroStageOf` (18 keys → §3.0 stages). Proposal revision shown as a sub-status (NEW-3). The adviser-approval gate needs both offices (NEW-7). Routing to Capstone 2 requires an Instructor 2 (S5.8) | §3.0, NEW-3, NEW-7 |
| `src/pages/SignIn.jsx` | **OTP flow removed.** Fixed the crash (`EMAIL_DOMAINS.some` on an object) and the broken persona picker (non-existent `GLOBAL_ROLES.INSTRUCTOR_1/2/FACULTY`, singular `globalRole`). Registration open to both domains and routed through `registerAccount`. Sign-in requires verified + active. Persona picker is dev-only | S0, §9, R9 |
| `src/services/authService.js` | Uses the shared exact-domain check (was crashing) | S0.1 |
| `src/pages/ProjectWorkspace.jsx` | Renders from `viewBundle`. Access-denied page no longer shows the title or the CAAC Inspector; a missing project and a forbidden one look the same. Documents/logs/defense/forms tabs hidden without `document.read` | R3, T20 |
| `src/components/panels/DocumentsPanel.jsx` | No longer filters on its own; renders the guard-filtered bundle. Removed the "N private notes withheld" count, which leaked | R3, T4, T15 |
| `src/components/panels/HistoryPanel.jsx`, `src/pages/Audit.jsx` | Show role hat and before → after; non-transition history entries | R6, T21 |
| `src/pages/Admin.jsx` | "Reset demo data" removed (moved to the dev tools) | R9 |
| `src/pages/Notifications.jsx` | Passes the actor; you can only mark your own notifications read | R3 |
| `src/state/session.js` (new), `src/state/AppContext.jsx` | Session module the guard checks. Overdue job runs on load and every minute. Dev resets refuse a live backend | R3, S8.2 |
| `src/dev/*` (new) | Persona switcher (sign-in screen + rail), `/dev` page: §7 scenario loader, set-stage, reset, overdue job, outbox with verify buttons, audit/history viewer, flags table, allowedActions table. Loaded only behind `import.meta.env.DEV` | R9, Part B.3–5 |
| `src/__tests__/*` (new), `package.json`, `vite.config.js` | Vitest 2.1.9, `npm test`, tests pinned to the local backend | Part B.7 |
| `firestore.rules` | PC stage window, Admin record-only, AI summary audience, released notes to members only | Invariant (rules mirror caac.js) |
| `.claude/launch.json` | `capstone-prototype-local` (port 5181, local backend) | Verification |
| `CLAUDE.md` | Commands, guard, flags, seed, dev tools, the live-`.env` warning | Docs |

## 3. Action checks (harness level)

Prompt 0 builds the harness; the per-role prompts polish each screen. "UI" here means checked in the browser this session.

| Step | Action | UI | Guard | State change | Reflects on | Email (outbox) | Audit | Notes |
|---|---|---|---|---|---|---|---|---|
| S0.1 | Register (`quinn@hau.edu.ph`) | ✅ | n/a (public) | Inactive, unverified | Admin list | ✅ verification email | ✅ | Look-alike domain rejected in the form and the service |
| S0.2 | Verify email | ✅ via the outbox button | token-only | verified, `@Faculty`, still Inactive | Admin list | — | ✅ before → after | Token single-use (test) |
| S0.3 | Activate account | ✅ | `admin.accounts` | Active | user can sign in ✅ | — | ✅ before → after, hat | Refused while unverified (test) |
| S1.2 | Forward roster (G4) | — | ✅ `ENDORSE_ROSTER` | → Adviser Assignment | PC notified | ✅ | ✅ hat Instructor 1 | services test T21 |
| S2.2 | Approve adviser (both offices) | — | ✅ | stays until both approve | other office notified | ✅ | ✅ | services test; see NEW-14 |
| S5.1 / S7.2 | Unassign panel member | ✅ T16 | ✅ PC only | row removed | Charlie loses G1 live ✅ | — | ✅ | Admin/Bravo rejected |
| S5.6 | Record verdict | ✅ button shown (T2) | ✅ Chair only | verdict, F2004, stage | students/adviser | ✅ | ✅ | rollback on bad input (test) |
| S6.2 | Sign weekly log | — | ✅ | Approved | students | ✅ | ✅ once | double-click → one record (T17) |
| S8.2 | Overdue flag | — | system job | Pending → Overdue | students + adviser | ✅ "Overdue Revision" | ✅ | idempotent (test) |
| S3.5 etc. | Upload new version | — | ✅ | vN+1, old Superseded | reviewers | ✅ | ✅ before → after | T13 (test) |

## 4. Negative tests

| Must not | UI | Guard |
|---|---|---|
| Call a service as another user (session mismatch) | n/a | ✅ rejected |
| Forged user object / doctored snapshot | n/a | ✅ ignored, rejected |
| Forged gate object from another stage | n/a | ✅ rejected |
| Open a project via pasted URL without access | ✅ generic page, no title | ✅ `viewBundle` → null |
| Admin reads documents / annotates / records verdict / assigns | ✅ tabs hidden | ✅ rejected |
| Panel Member records verdict (T5) | — | ✅ |
| Instructor 2 annotates (T6) | — | ✅ at every stage |
| Student approves anything / sees other groups (T13) | ✅ (Whiskey/Kilo views) | ✅ |
| Mark someone else's notification read | n/a | ✅ |
| Inactive / suspended account acts | ✅ sign-in refused | ✅ no grants |

## 5. `WORKFLOWS.md` §7 scenarios

"Guard" = `guard.test.js` / `services.test.js`. "UI" = checked in the browser this session. UI checks not listed are for the role prompts.

| T# | Result | Evidence |
|---|---|---|
| T1 | Pass (guard) | Alpha `signWeeklyLog` ok, hat Adviser; `annotate` ok on an open version. Annotation UI not extended (R12) |
| T2 | Pass (guard + UI) | Alpha's worklist: "Record the official verdict — ready" on G2; no review/log/history actions |
| T3 | Pass (guard + UI) | G3 absent from Alpha's lists; `/projects/p_g3` shows the generic page; visible at CLEARANCE (T10 setup) |
| T4 | Pass (guard; UI trivially, R12) | Note visible to Charlie only; Alpha, Kilo and Foxtrot denied; after release Kilo yes, Foxtrot still no |
| T5 | Pass (guard) | Charlie denied, Foxtrot (Chair) allowed |
| T6 | Pass (guard) | `annotate` absent for Instructor 2 at every stage |
| T7 | Pass (guard) | Charlie cannot schedule at Final Defense Endorsement; can at Final Defense Scheduling |
| T8 | Pass (guard) | Dean Delta: full history + read on G3 |
| T9 | Pass (guard) | Dean sees G1 only at Adviser Approval and G2 only at Final Approval, not at URO Verification |
| T10 | Pass (guard) | Alpha can `ENDORSE_TO_URO`, never `FINAL_APPROVE` (checked at three stages) |
| T11 | Pass (guard) | Dean `FINAL_APPROVE` denied at URO Verification |
| T12 | Pass (guard) | URO cannot see G3 at Clearance |
| T13 | Pass (guard + service) | No other group, no approve action; re-upload → v2, v1 Superseded, v1 unchanged |
| T14 | Pass (guard + UI) | Whiskey: no project visible. **Gap:** no explicit "not in a group yet" empty state (Student prompt) |
| T15 | Pass (guard) | Echo sees Proposal Manuscript v2 only |
| T16 | Pass (guard + service + UI) | PC unassigns Charlie → G1 gone from Charlie's list and a denied URL; audit `ROLE_UNASSIGNED`, hat PC, before → after; Admin rejected |
| T17 | Pass (service) | Two concurrent approvals → one `WEEKLY_LOG_SIGNED`; guard refuses an already-Approved log |
| T18 | Pass (service) | Expired countdown → Overdue once; notification to students + adviser; outbox "Overdue Revision" |
| T19 | Pass (guard), as decided | NEW-5 decision: Alpha (G1 Adviser) cannot be put on G1's panel (`BLOCK_ADVISER_ON_PANEL`) |
| T20 | Pass (guard + UI) | Admin opens record (Overview/History tabs only); no documents, AI summary, annotate, verdict or assignment |
| T21 | Pass (guard + service) | Hat reported for each allowed action; audit carries actor, hat, before → after; history entry written |

## 6. Config flags used (`src/domain/flags.js`)

| Flag | Value | Source | Wired |
|---|---|---|---|
| FACULTY_BASE_IDENTITY | true | NEW-1 | verifyEmail, Admin role options |
| ACCOUNT_ACTIVATION | email+admin | OQ#4 | verifyEmail, setAccountStatus, sign-in |
| ADVISER_APPROVAL | both | NEW-7 | APPROVE_ADVISER gate |
| ADVISER_ACCEPT_STEP | false | OQ#5 | not wired (off) |
| PROPOSAL_DEFENSE_SCHEDULER | Program Chair/Coordinator | NEW-2 | caac.js |
| PROPOSAL_REVISION | sub-status | NEW-3 | stage label + macro stage |
| AI_SUMMARY_TRIGGER | auto-on-complete-manuscript… | NEW-4 | **not wired**: feature not built (R12); the existing stub still runs at schedule publish |
| AI_SUMMARY_AUDIENCE | Adviser + Panel | OQ#2 | guard (R12, feature not built) |
| PANEL_NOTES_RELEASE | students-on-verdict | OQ#3 | guard (R12, feature not built) |
| VERDICT_VALUES | Minor / Major / Re-defense | OQ#10 | constants.js |
| REVISION_DAYS | Minor 7, Major 14 | S7.6 | recordVerdict |
| WEEKLY_LOG_SIGNER | Adviser | OQ#7 | caac.js |
| PC_PROGRAM_VISIBILITY | summary-outside-pc-steps | NEW-11 | caac.js, firestore.rules |
| URO_REVIEW_LEVELS | 1 | NEW-10 | current single gate |
| URO_RETURN_PATH | true | NEW-7 | **not wired yet** (URO prompt) |
| BLOCK_SELF_APPROVAL | true | NEW-5 (decided) | caac.js |
| BLOCK_ADVISER_ON_PANEL | true | NEW-5 (decided) | assignmentConflict |
| I1_ACCESS_AFTER_ROUTING | none | NEW-6 (decided) | caac.js, firestore.rules |
| SAME_PANEL_BOTH_DEFENSES | true | NEW-6 (decided) | current behaviour |
| INSTRUCTOR_2_ASSIGNER | Program Chair/Coordinator | OQ#5 (decided) | caac.js |
| DEV_TOOLS | `import.meta.env.DEV` | R9 | App, Shell, SignIn |

## 7. Open items hit

- **NEW-14 (new):** `ADVISER_APPROVAL = both` together with `BLOCK_SELF_APPROVAL` deadlocks when the Dean (or the Associate Dean) is the proposed Adviser. The conflicted office can never approve, so the project stays at Adviser Approval forever. Confirmed with a probe (Dean Delta as Adviser: only the Associate Dean may approve). This is the real-life Dean-as-Adviser case. **Needs a team decision:** is the other office alone enough, is there a delegate, or something else?
- **NEW-15 (new):** R12 assumes annotations and the AI summary are not built, but they exist (stubbed Gemini summary generated at schedule publish; annotation form; private notes released at the verdict). Left as they were (routed through the guard, not extended). The flags describe the intended behaviour, and the stub's trigger (schedule publish) differs from NEW-4's default (on submission).
- **NEW-16 (new):** `WORKFLOWS.md` S0.1 lets any `@hau.edu.ph` user register; commit `4d42038` had limited self-registration to students. This pass follows `WORKFLOWS.md` (both domains, admin activation). Confirm with the team.
- **NEW-17 (new):** Firebase mode cannot write. `firestore.rules` denies all client writes ("writes go through Cloud Functions"), but there is no `functions/` directory, and `firebaseAdapter` writes straight from the client. Related: OQ#1.
- **NEW-18 (new):** Revision-countdown length is a flag constant, not an admin setting yet. Whether a change affects running countdowns is open (System Administrator prompt).
- Workflow mismatches kept for the stage/role prompts (not changed here):
  - S3: topic is registered before the concept paper in §3; the code requires the concept paper first.
  - S5.3 / S7.4: no uploads after the defense is scheduled.
  - S8.4: WORKFLOWS says the stage moves automatically when the panel finishes signing; the code keeps an Instructor 2 "close revisions" gate.
  - S5.2: when the flag is not the PC, Instructor 2 has no view during Capstone 1.
- Touched: OQ#2, OQ#3, OQ#4, OQ#5, OQ#7, OQ#10, NEW-1, NEW-2, NEW-3, NEW-5, NEW-6, NEW-7, NEW-10, NEW-11.

## 8. Manual localhost script

1. `VITE_BACKEND=local npm run dev -- --port 5181`, then open http://localhost:5181.
2. Sign-in form: type `alpha@fake.student.hau.edu.ph` → expect "Sign-in is restricted…". Type `  Alpha@HAU.edu.ph ` → signed in as Prof. Alpha.
3. Worklist: expect G2 "Record the official verdict — ready" (Panel Chair) and G1 under "Your other projects" (Adviser). No G3 or G4 (T2, T3).
4. Go to `/projects/p_g3` → expect "This project is not available to you" with no title (T3).
5. Rail → **Dev tools** → §7 scenarios → **Load** on T16 → open G1 → Overview → Faculty assignments → **Unassign** Prof. Charlie (Panel Member).
6. Rail → Switch persona → **Prof. Charlie** → Projects: expect no G1; `/projects/p_g1` is denied (T16). Dev tools → Audit: `ROLE_UNASSIGNED`, Prof. Alpha, hat *Program Chair/Coordinator*.
7. Dev tools → **Reset seed**. Switch persona → **Admin Sierra** → open any project → expect only the Overview and History tabs (T20).
8. Switch persona → **Whiskey Student** → expect an empty worklist (T14).
9. Sign out → **Register** with `quinn@evilhau.edu.ph` → rejected. With `quinn@hau.edu.ph` → "Account created…". Sign in with it → "Verify your email address first".
10. Click the Admin Sierra persona → Dev tools → Outbox → **Verify my email** → Accounts → set Prof. Quinn Test to **Active** → sign out → sign in as `quinn@hau.edu.ph` → expect a worklist with Global `@Faculty`.
11. Any other §7 scenario: Dev tools → **Load** on its row; the row says whom to sign in as, where to look, and what to expect.

## 9. §9 items found

- **OTP at registration and sign-in** (Decision 12): removed from `SignIn.jsx` (`pendingOtp`, `verifyOtp`, 6-digit form).
- **Instructor 1/2 and Faculty treated as Global Roles** in the persona list (Decision 15): removed; the persona picker now shows project hats per project.
- Nothing else found (no grading, gallery, chat, Kanban, stored videos or evaluation form).

## Re-runs

No earlier role reports exist. Every later prompt starts from this guard, seed and harness.
