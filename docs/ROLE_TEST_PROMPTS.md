# Role Test Prompts for Claude Code — CAAC Workflow (localhost)

**Project:** Web-Based Thesis and Capstone Project Management and Workflow Automation System for HAU-SOC
**Companion to:** `WORKFLOWS.md` (all step IDs `S#.#`, test IDs `T#`, and gap IDs `OQ#n` / `NEW-n` refer to it)
**Built:** 2026-09-29, from `WORKFLOWS.md` + the Capstone 2 knowledge base (Users and Permissions, System Architecture)

---

## How to use

1. Put this file and `WORKFLOWS.md` in the repo root (if you use `docs/`, change the paths in the prompts).
2. Run **Prompt 0** once. It audits the mockup and builds the test tools. Review its report before going on.
3. Run the role prompts **in order**, one per fresh Claude Code session (or `/clear` between them). Each one fixes, polishes, and tests one role, then writes a report to `test-reports/`.
4. Run **Prompt 11** (full handoff walkthrough) and **Prompt 12** (regression + summary).
5. When the team settles a `[NEEDS CONFIRMATION]` item, update `WORKFLOWS.md`, flip the config flag, and re-run the prompts for the affected roles.

| # | Role | Why this order |
|---|---|---|
| 0 | Setup and audit | Guard, seed data, dev tools |
| 1 | System Administrator | Accounts and global roles come first (S0) |
| 2 | Student | Almost every action lands on a student screen |
| 3 | Instructor 1 | Group formation, Capstone 1 gates |
| 4 | Program Chair/Coordinator | Adviser/panel assignment, endorsements |
| 5 | Dean and Associate Dean | Adviser approval, final signature |
| 6 | Adviser | Reviews, logs, FM-2005, revisions |
| 7 | Panel Member | Private notes, latest version, sign-offs |
| 8 | Panel Chair | Verdict and countdown |
| 9 | Instructor 2 | Capstone 2 milestones, final-defense schedule |
| 10 | URO | Clearance before the Dean |
| 11 | End-to-end handoff | One project, S0 → S10, every role |
| 12 | Regression + summary | All T1–T21, per-role completion |

---

## Shared Rules (every prompt says "Follow the Shared Rules")

- **R1 — Source of truth.** `WORKFLOWS.md`. Do not invent workflow steps, roles, permissions, or form behavior that aren't there.
- **R2 — Keep the stack.** Use the repo's existing framework, structure, data layer, and conventions (the manuscript's stack is React + Firebase; Airbnb style via ESLint/Prettier). If the mockup runs on mock data, stay on mock data. If it's wired to the Firebase Emulator Suite, use the emulator. Ask before adding any library.
- **R3 — One guard.** Every action goes through a single CAAC guard implementing `canView` / `canDo` from `WORKFLOWS.md` §2.2 (Global Role + hat on *this* project + current stage + document state). Hiding a button is not enough: a forced call must be rejected. Reads are filtered too — no leaks through lists, counts, badges, search, notifications, emails, or a pasted URL/ID.
- **R4 — Mockup defaults behind flags.** Where `WORKFLOWS.md` gives a "Mockup default", implement it behind a named flag in one config file. Where it gives **no** default, don't decide: stop, show the options, and ask me.
- **R5 — Nothing from §9.** Don't build anything listed in `WORKFLOWS.md` §9 (OTP, public gallery, grading/rubrics, student-created groups, chat, in-app editing, video uploads, etc.). If you find one in the code, list it in the report; don't delete it without asking.
- **R6 — Side effects.** Every state-changing action writes: (a) an audit-log entry — actor, role hat used, project, action, before → after, timestamp; (b) a workflow-history entry; (c) a mock email in the dev outbox (recipients + event name) whenever §3 lists an email. No real emails.
- **R7 — Reliability.** Double-clicks and repeated submits record once. Multi-collection changes are all-or-nothing.
- **R8 — Immutable documents.** A new upload creates vN+1; the old version becomes Superseded and stays readable to those allowed. Nothing is overwritten or deleted.
- **R9 — Dev tools stay dev-only.** The persona switcher, stage controls, reset, outbox, and audit viewer are behind a dev flag and excluded from the production build.
- **R10 — Scope.** Change only what the current role needs. If you touch shared code (guard, data model, dashboard shell, seed), re-run the guard tests and note which earlier role reports may need a re-run.
- **R11 — Report.** Write the report in the format below. Be honest about failures; don't mark a check as passed unless you verified it.
- **R12 — Not built yet: the Gemini AI summary.** (Annotations were built on 2026-09-30 — see below.) In these passes:
  - **Don't build the AI summary** and don't add placeholder UI for it. The existing stub is not extended.
  - **Guard only:** keep `viewAiSummary` in the allowedActions table and test who may or may not use it in the guard unit tests.
  - **Report as "Not built"**, not Fail, for any UI check that needs it. List each skipped check so it can be re-run later.
- **Annotations are built (2026-09-30).** Reviewers open the PDF in **Documents → File**, select words or use **Mark area**, and pin a comment there; comments without a mark are general notes. The file is never written to — each annotation is its own record (page, position, quoted words), drawn over the page. Panel notes are private to their author until the Panel Chair records the verdict (PANEL_NOTES_RELEASE). Where a prompt below still says annotating is "guard only (R12)", **test the UI as well**. In dev builds, **Attach dummy PDF** in the upload form supplies a file from `test-fixtures/` (the built-in browser cannot open a file picker).

### Checks that R12 no longer skips (annotations) — re-run in the UI

| Where | Check | Reports that marked it "Not built" |
|---|---|---|
| S3.2, S3.6, S4.2, S6.4 | Annotating drafts (I1 / Adviser), then return / approve; the student reads the notes on that version, and they stay on the superseded version | 02 |
| S5.5, S7.5 | Private panel notes | 07, 08 |
| S5.6, S7.6 | Notes released to the students on the verdict; never between panelists | 07, 08 |
| T1 | Adviser annotating G1 | 06 |
| T4 | Note isolation in the UI | 02, 06, 07, 08 |
| T6 | No annotation tools for Instructor 2 (the viewer is read-only) | 09 |
| T20 | Admin: no Documents tab, so no annotating | 01 |
| — | Dean / AD: no annotation tools where they hold no reviewer hat | 05 |

### Checks still affected by R12 (AI summary)

| Where | What's skipped in the UI | Still tested |
|---|---|---|
| S5.4, S7.4 | AI summary generation and display | Guard `viewAiSummary` per AI_SUMMARY_AUDIENCE |

### Report format — `test-reports/NN-<role>.md`

1. **Summary** — checks passed / failed.
2. **Fixes made** — file, change, step ID it serves.
3. **Action checks** — table: `Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit | Notes`.
4. **Negative tests** — what the role must *not* do, and whether both UI and guard block it.
5. **`WORKFLOWS.md` §7 scenarios** — `T# | Pass/Fail | evidence`.
6. **Config flags used.**
7. **Open items hit** — `OQ#n` / `NEW-n` touched, plus any new gap (number from `NEW-14` up).
8. **Manual localhost script** — numbered steps a teammate can follow: start command, URL, "log in as [persona]", click X, expect Y, "switch to [persona]", expect Z.
9. **§9 items found** (if any).

---

## Prompt 0 — Setup and audit

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md in full.

This session has two parts. Do Part A, show me the results, and WAIT for my go-ahead before Part B.

PART A — Audit (read-only, no edits)
1. Stack: framework, routing, where data lives (mock data vs Firebase / Emulator Suite), test runner (if any), and the exact command to run it on localhost.
2. Roles: how users and roles are represented now vs WORKFLOWS.md §2.1 (6 Global Roles, 5 Project-Based Roles, NEW-1 "Faculty" base identity). List mismatches — e.g., Instructor 1/2 stored as global roles (they must be project-based).
3. Permission checks: find every place access is decided (routes, conditional rendering, services, data queries). Is there one guard or scattered checks? Which actions have no server-side/service-side check?
4. Stages: compare the stage values in code with the §3.0 stage machine (OQ#9 order, NEW-3 proposal revision).
5. Screens: map existing screens/components to each role view in §4 — present / partial / missing.
6. §9 items present in the code.
7. Confirm that annotations and the Gemini AI summary are not built (R12). If any partial code for them exists, list it; don't extend it.
Output: a short audit summary and a proposed change list, ordered by risk (access-control holes first).

PART B — Test harness (after my go-ahead)
1. Central CAAC guard: canView(user, project) and canDo(user, action, project) per §2.2, with an allowedActions table keyed by role hat × stage × document state. Route every existing action and every project query through it.
2. Seed data: §6 personas, groups G1–G3, one student with no group, plus G4 as an early-stage group (Instructor 1 = Prof. Bravo, no adviser yet) so the Group Formation and Adviser Assignment queues have data.
   Note: §6 and §7 don't line up on stages — T1 needs G1 in Implementation (weekly logs), T4/T5/T16 need a panel on G1 (Proposal/Final Defense), T7 needs G3 before PC endorsement, but §6 puts G1 at an early stage and G3 at final revision/clearance. So don't rely on one fixed seed.
3. Dev-only scenario controls: "Reset seed", and "Set project to stage X" that fills in plausible prerequisite data (approved topic, documents, assignments, schedule, verdict) so each T# can be set up in one click. Add a "Load scenario T#" shortcut if it's simple.
4. Dev-only persona switcher showing name, Global Role, and hats per project.
5. Dev outbox (mock emails) and an audit-log / workflow-history viewer.
6. Config file with the Mockup-default flags (names are suggestions):
   FACULTY_BASE_IDENTITY (NEW-1), ACCOUNT_ACTIVATION = email + admin (OQ#4),
   ADVISER_APPROVAL = both, any order (NEW-7), ADVISER_ACCEPT_STEP = off (OQ#5),
   PROPOSAL_DEFENSE_SCHEDULER = Program Chair (NEW-2), PROPOSAL_REVISION = sub-status (NEW-3),
   AI_SUMMARY_TRIGGER = auto on complete manuscript at a defense milestone (NEW-4),
   AI_SUMMARY_AUDIENCE = Adviser + Panel (OQ#2), PANEL_NOTES_RELEASE = to students on verdict, never between panelists (OQ#3),
   VERDICT_VALUES = Minor / Major / Re-defense (OQ#10), REVISION_DAYS = minor 7, major 14,
   WEEKLY_LOG_SIGNER = Adviser (OQ#7), PC_PROGRAM_VISIBILITY = summary counts only outside PC steps (NEW-11),
   URO_REVIEW_LEVELS = 1 (NEW-10), URO_RETURN_PATH = on (NEW-7).
   AI_SUMMARY_TRIGGER, AI_SUMMARY_AUDIENCE, and PANEL_NOTES_RELEASE stay in the config for the guard, but mark them "feature not built yet" (R12).
   No default exists for NEW-5 (two hats on one project / Dean approving self) or NEW-6 (Instructor 1 access after routing; same panel for both defenses) — leave these as explicit TODOs and ask me.
7. Guard unit tests: one test per T1–T21 at the guard level, using the existing test runner (ask before adding one). Include the annotation and AI-summary actions (R12) even though their UI doesn't exist.
Write the report to test-reports/00-setup.md (include the localhost start command).
```

---

## Prompt 1 — System Administrator

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, S0, S10, §4 "System Administrator", §7.

Role: System Administrator (Global). Persona: Admin Sierra. Also use a brand-new registration for each case below.
Goal: polish and test account management, role assignment, settings, archive, and audit — and confirm each change shows up for the affected user.

1. Dashboard — users/accounts (pending vs active), Global Role and CAAC tag assignment, permission overrides, global settings (revision countdown length), archive, audit/activity log, reports.
2. Registration (S0.1–S0.2):
   - Accept: name@hau.edu.ph, name@student.hau.edu.ph (also mixed case and surrounding spaces).
   - Reject: gmail.com, hau.edu.ph.evil.com, name@evilhau.edu.ph, name@fake.student.hau.edu.ph — check both the form and the guard.
   - The verification email appears in the dev outbox; clicking it marks the email verified.
   - @student → Student automatically; @hau.edu.ph → Faculty base identity (flag), no global permissions yet.
3. Activation and roles (S0.3): activate an account, assign Dean / Associate Dean / Program Chair/Coordinator / URO. Switch to that user and confirm their dashboard now shows that role's queues. Remove the role and confirm access disappears (live, or on next load — report which).
4. Permission override: apply one, confirm the guard result changes, confirm it's audit-logged with before → after.
5. Settings: change the revision countdown length. Report whether it applies only to new verdicts or also to running countdowns — don't decide, flag it.
6. Archive (S10.2) and reports (S10.3): list and export work; report data shows no manuscript content.
7. Must NOT (UI and guard): open or read any manuscript, or annotate one (guard only — R12) (T20); record verdicts; sign forms; approve any workflow gate; assign advisers or panels (that's the Program Chair's job — T16 note).
8. Scenarios: T14, T20, T21.
9. Watch for: OQ#4 (activation), NEW-1 (Faculty identity), OQ#5 (who assigns Instructor 1/2 — don't give this to the admin unless I confirm).
Write the report to test-reports/01-system-administrator.md.
```

---

## Prompt 2 — Student

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, §3, §4 "Student", §5, §7.

Role: Student (Global). Personas: one student in each of G1–G4 (use the stage controls to cover every stage) and the student with no group.
Goal: polish and test every student action, and confirm each upload lands in the right reviewer's queue.

1. Dashboard — own group only: current stage, what's waiting on them, deadlines/countdown, latest verdict, adviser and panel names, notification list, empty state for the no-group student.
2. Actions — for each, check UI, guard, state change, email, audit:
   S3.1 five topics · S3.5 concept paper · S4.1 drafts/manuscript · S5.3 complete manuscript + presentation video LINK (no video upload) · S5.7 revisions · S6.1 weekly log (FM-AAC-SOC-2003) · S6.3 drafts · S6.6 deployment info (not in the data model — OQ#12; keep it a simple placeholder) · S6.8 export logs · S7.4 final manuscript + link · S8.1 revised manuscript · S9.1 Editor's Certificate · S9.2 Plagiarism Clearance Certificate.
   Validation on both client and guard: PDF only, required fields, valid URL for the video link.
3. Versioning (T13): re-uploading creates vN+1, old = Superseded; the version history shows all versions to the student.
4. Reflects on — after each upload, switch personas and confirm the queue badge + item:
   S3.x/S4.x → Instructor 1 and Adviser · S5.3/S7.4 → Panel (latest version only) and AI summary per flag · S6.1/S6.3/S8.1 → Adviser.
   Check the dev outbox for each email listed in §3.
5. What the student sees: returned items with whatever remarks the mockup has, and the reviewer's decision. Annotations, private panel notes, and the AI summary aren't built (R12) — test only the guard: students may view reviewer annotations, may view panel notes only per PANEL_NOTES_RELEASE, and may view the AI summary only per AI_SUMMARY_AUDIENCE (OQ#2 — the role text says students see it, Table 1 doesn't).
6. Countdown: after a verdict the timer shows; when it expires the Overdue flag and email appear (T18).
7. Must NOT (UI and guard): see other groups (also try a pasted project/document URL), see any approve/sign/verdict button, edit or delete a submitted file, create groups, submit to a stage that isn't active.
8. Same group, two members uploading at once: versions don't collide; all members see the same state.
9. Scenarios: T4 (student side), T13, T14, T18.
10. Watch for: NEW-9 (is the weekly log active in Capstone 1?), OQ#2, OQ#3, OQ#12.
Write the report to test-reports/02-student.md.
```

---

## Prompt 3 — Instructor 1

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, S1–S5, §4 "Instructor 1", §5, §7.

Role: Instructor 1 (Project-Based). Persona: Prof. Bravo — Instructor 1 of block A (G1, G2, and G4) and Panel Member of G3.
Goal: polish and test group formation and the Capstone 1 gates, and confirm the handoffs to the Program Chair, Adviser, students, and Instructor 2.

1. Dashboard — block roster, groups by stage, review queue (topics, concept papers, drafts).
2. Actions:
   S1.1 create groups and assign students — PROJECT + workflow record written together (all-or-nothing); a student can't be in two groups.
   S1.2 forward roster → Program Chair "Needs adviser" queue; groups show "Awaiting adviser". Report what happens with unassigned students (not specified — flag).
   S3.2 request revision · S3.3 approve one topic, reject the rest · S3.4 register the topic → PROJECT title shows everywhere · S3.6 return or approve the concept paper → stage Proposal Development · S4.2 return drafts (annotating in S3.2/S3.6/S4.2 is not built — guard only, R12) · S4.3 approve for proposal defense → Program Chair "Needs panel" · S5.8 route to Capstone 2 → project appears for Instructor 2.
3. Reflects on — students (group workspace, comments, title, stage), Adviser (approved topic), Program Chair (queues), Instructor 2 (after S5.8). Check the outbox.
4. Multi-hat: on G3, Bravo only has Panel Member actions (sign-offs; private notes are guard-only, R12); on G1/G2/G4, no panel actions. Nothing from one hat leaks into another project.
5. Must NOT (UI and guard): assign advisers or panels, schedule the final defense, confirm Capstone 2 milestones, see groups outside the block, approve before the precondition is met.
6. Scenarios: I1-specific negative tests above, plus the I1 rows of T21 (audit shows "Instructor 1" as the hat used).
7. Watch for: NEW-6 (Instructor 1 access after S5.8 — no default, ask me), NEW-8 (which I1 endorsement emails the Program Chair), NEW-9, OQ#5 (who assigns Instructor 1), OQ#11 (year level / block not on USER).
Write the report to test-reports/03-instructor-1.md.
```

---

## Prompt 4 — Program Chair/Coordinator

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, S2, S5, S7, S9, S10, §4 "Program Chair/Coordinator", §5, §7.

Role: Program Chair/Coordinator (Global). Persona: Prof. Alpha — Program Chair, also Adviser of G1 and Panel Chair of G2.
Goal: polish and test assignments and endorsements, and confirm each one reaches the Dean/AD, panel, Instructor 2, and URO.

1. Dashboard — "Needs adviser", "Needs panel", "Recommendations to endorse", "Approval Sheets to endorse", program-level summary, reports. Separate sections for Alpha's Adviser and Panel Chair hats.
2. Actions:
   S2.1 assign adviser → Dean + AD "Adviser assignments to approve" · S5.1 assign Panel Chair + Members → project appears on each panelist's dashboard · S5.2 schedule proposal defense (PROPOSAL_DEFENSE_SCHEDULER flag) · S7.1 endorse after FM-2005 → Instructor 2's "Create schedule" becomes enabled · S7.2 final-defense panel · S9.3c endorse the Approval Sheet → URO queue · S10.3 reports.
3. Reflects on — Dean/AD queues, panelists' dashboards, Instructor 2's schedule button, URO queue, students (adviser name only after Dean/AD approval). Check the outbox.
4. Live removal (T16): remove Prof. Charlie from G1's panel → G1 disappears from Charlie's dashboard; audit entry.
5. Visibility (NEW-11 flag): outside an active PC step, Alpha sees summary counts/status only — no project documents.
6. Must NOT (UI and guard): give the final signature (T10), record verdicts except as G2 Panel Chair, use adviser actions on G2 (T2), open G3 documents without an active PC step (T3), endorse before the Adviser's FM-2005.
7. Scenarios: T1, T2, T3, T10, T16, T19.
8. Watch for: NEW-5 / T19 (Alpha assigning herself as panel on G1, where she's Adviser — no default, show me what happens and ask), NEW-2, NEW-6 (same panel for both defenses?), NEW-11.
Write the report to test-reports/04-program-chair.md.
```

---

## Prompt 5 — Dean and Associate Dean

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, S2, S9, S10, §4 "Dean and Associate Dean", §5, §7.

Roles: Dean and Associate Dean (Global). Personas: Dean Delta (also Adviser of G3), AD Echo (also Panel Member of G2).
Goal: polish and test adviser approval and final approval, and confirm progressive visibility.

1. Dashboard — "Adviser assignments to approve", "Projects for final approval", records tables (search/filter), reports. Separate sections for Delta's Adviser hat and Echo's Panel hat.
2. Actions:
   S2.2 approve adviser assignment (ADVISER_APPROVAL flag): after one approves, show "1 of 2" to both; after both → stage Conceptualization, Adviser sees the group under "Advising", students see the adviser name, emails sent.
   S9.5 final signature after URO clearance → stage Archived, status Completed; students see "Completed"; records table updates.
   S10.1 search/filter records · S10.3 reports.
3. Visibility (T9): as Dean/AD, a project appears only at S2.2 and again after S9.4. Check both personas, and try pasted URLs.
4. Multi-hat: Delta has the full Adviser view of G3 from the start (T8); Echo has only Panel Member actions on G2; neither hat leaks into the other role's projects.
5. Must NOT (UI and guard): approve before the Program Chair submits, sign before URO clears (T11), annotate projects where they hold no reviewer hat.
6. Scenarios: T8, T9, T11.
7. Watch for: NEW-7 (reject/return path for adviser assignments — none defined; don't build it, list it), NEW-5 (Delta approving an assignment naming himself — no default; show what happens and ask).
Write the report to test-reports/05-dean-associate-dean.md.
```

---

## Prompt 6 — Adviser

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, S3, S4, S6, S8, S9, §4 "Adviser", §5, §7.

Role: Adviser (Project-Based). Personas: Prof. Alpha (G1), Prof. Charlie (G2), Dean Delta (G3).
Goal: polish and test reviewing, log signing, FM-2005, revision verification, and the Approval Sheet — and confirm each handoff.

1. Dashboard ("Advising") — assigned groups, drafts to review, logs to sign, revisions to verify, forms to sign.
2. Actions:
   S3.2 / S3.6 / S4.2 / S6.4 return for revision or approve — the student uploads vN+1, the old version stays readable, and the student's file is never edited. Annotating is not built (R12): guard only.
   S6.2 approve + e-sign or return a weekly log (WEEKLY_LOG_SIGNER flag).
   S6.7 submit FM-AAC-SOC-2005 after the readiness check with Instructor 2 → Program Chair "Recommendations to endorse".
   S8.3 verify revisions against the panel's requirements → Panel "Revisions to verify".
   S9.3a sign the Approval Sheet → Panel "Approval Sheet to sign".
3. Reflects on — students (annotations, returned items, log status), Instructor 2 (progress), Program Chair (FM-2005), Panel (revisions, Approval Sheet). Check the outbox.
4. Must NOT (UI and guard): see panelists' private notes (guard only — T4, R12), record a verdict, sign the Approval Sheet before revisions are complete, act on another adviser's group, edit or delete student files.
5. Double-click "Approve" records once (T17).
6. Scenarios: T1 (log signing only), T4 (guard only), T8, T17.
7. Watch for: OQ#7 (who signs logs — DFD says Instructor 2), NEW-9, and how the "readiness check with Instructor 2" should work before FM-2005 (not specified — flag it).
Write the report to test-reports/06-adviser.md.
```

---

## Prompt 7 — Panel Member

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, S5, S7, S8, S9, §4 "Panel Member", §7.

Role: Panel Member (Project-Based). Personas: Prof. Charlie (G1), Prof. Bravo (G3), AD Echo (G2).
Goal: polish and test what panelists can see and sign, and confirm isolation between panelists and projects.

1. Dashboard ("Panel") — assigned projects, defense schedule, latest manuscript version, revisions to verify, forms to sign. No AI summary panel yet (R12).
2. Actions:
   S5.5 / S7.5 private annotations and the AI summary are not built (R12). Guard only: a panelist's notes are viewable by their author alone — not other panelists (including the Panel Chair), not the Adviser, not students before the verdict (PANEL_NOTES_RELEASE); viewAiSummary follows AI_SUMMARY_AUDIENCE.
   S5.7 / S8.4 verify revisions and sign FM-AAC-SOC-2004 — only after the Adviser verified (S8.3). When all panelists sign → revision Completed → stage Clearance.
   S9.3b sign the Approval Sheet — after the Adviser (S9.3a); when the whole panel signs → Program Chair queue + email.
3. Latest version only (T15): older versions don't appear, and a pasted URL to an older version is blocked.
4. Assignment boundaries: the project appears only after S5.1/S7.2 and disappears live when removed (T16).
5. Must NOT (UI and guard): record the verdict (T5), see other panelists' notes (guard only), sign before the Adviser verifies.
6. Scenarios: T4 (guard only), T5, T15, T16.
7. Watch for: OQ#2, OQ#3, NEW-6 (same panel for both defenses?).
Write the report to test-reports/07-panel-member.md.
```

---

## Prompt 8 — Panel Chair

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, S5, S7, S8, §4 "Panel Chair", §7.

Role: Panel Chair (Project-Based) = Panel Member + verdict. Persona: Prof. Alpha (Panel Chair of G2; also Adviser of G1 and Program Chair).
Goal: polish and test verdict recording and its effects on every other role.

1. Everything from Prompt 7 still works for the Chair (at the guard level, the Chair's private notes stay private from the other panelists too — R12).
2. Verdict (S5.6 / S7.6) through digital FM-AAC-SOC-2004:
   - Values from VERDICT_VALUES; revision requirements are required text.
   - Minor → countdown REVISION_DAYS.minor; Major → REVISION_DAYS.major; Re-defense → back to scheduling (S7.7 → S7.3).
   - The stage moves per the §3.0 machine; one verdict per defense; a double-submit records once.
   - "Defense held" precondition: report how the mockup decides it (date passed? a "mark as held" action?) — not specified, flag it.
3. Reflects on — students (verdict, requirements, countdown), Adviser, other panelists, Instructor 2 (status); emails in the outbox. Releasing panel notes on verdict is not built (R12) — check the guard result for viewPrivatePanelNotes changes as PANEL_NOTES_RELEASE says.
4. Must NOT (UI and guard): adviser actions on G2 (T2); a Panel Member recording the verdict (T5 — verify the inverse); changing a recorded verdict (not specified — report current behavior and flag).
5. Scenarios: T2, T5, T18 (countdown expiry after a verdict).
6. Watch for: OQ#10 (verdict values), OQ#3, NEW-3 (proposal revision stage).
Write the report to test-reports/08-panel-chair.md.
```

---

## Prompt 9 — Instructor 2

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, S5.8, S6, S7, S8, §4 "Instructor 2", §7.

Role: Instructor 2 (Project-Based). Persona: Prof. Charlie — Instructor 2 of G3, also Adviser of G2 and Panel Member of G1.
Goal: polish and test Capstone 2 tracking and final-defense scheduling.

1. Dashboard — Capstone 2 groups, milestones, readiness, schedules. A project appears only after Instructor 1 routes it (S5.8).
2. Actions:
   S6.5 confirm milestones (revised manuscript, system components) · S6.7 readiness check with the Adviser · S7.3 create and publish the final-defense schedule — enabled only after the Program Chair's endorsement (S7.1) · S8.5 confirm post-defense course requirements.
3. Reflects on — students and Adviser (milestones, schedule), Panel (schedule), emails.
4. Must NOT (UI and guard): annotate anything as Instructor 2 — the guard rejects `annotate` for this hat (T6; no annotation UI exists yet, R12); schedule before endorsement (T7); sign weekly logs (WEEKLY_LOG_SIGNER default); sign clearance forms (the DFD 7.0 leftover in §9).
5. Multi-hat: Charlie's Adviser actions work on G2 and panel sign-offs on G1, and neither shows up on G3.
6. Scenarios: T6, T7.
7. Watch for: OQ#5 (who assigns Instructor 2), OQ#7.
Write the report to test-reports/09-instructor-2.md.
```

---

## Prompt 10 — University Research Office (URO)

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §2, S9, §4 "University Research Office", §7.

Role: URO (Global). Persona: URO Uniform.
Goal: polish and test clearance verification, and confirm URO clears before the Dean/AD see the project.

1. Dashboard — "Clearances to verify" (Editor's Certificate, Plagiarism Clearance Certificate, manuscript).
2. Actions (S9.4, URO_REVIEW_LEVELS flag):
   - Clear → project appears in the Dean + AD "Projects for final approval" queue for the first time; email.
   - Return to group with remarks (URO_RETURN_PATH flag) → students see the remarks and upload a new certificate version (vN+1); the project returns to the URO queue.
3. Must NOT (UI and guard): see the project before the Program Chair endorses (T12); annotate the manuscript (URO isn't an annotator — guard only, R12); take any earlier workflow action.
4. Scenarios: T11 (Dean blocked before URO clears), T12.
5. Watch for: NEW-10 (First/Second Level review), NEW-7 (return path), whether URO signs the Approval Sheet itself (not explicit — flag), URO email triggers (not stated in the manuscript — flag what the mockup does).
Write the report to test-reports/10-uro.md.
```

---

## Prompt 11 — End-to-end handoff walkthrough

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md. Read WORKFLOWS.md §3 and §5.

Create a fresh group G5 (3 new students) and take it from S0 to S10 by switching personas, without using the stage controls.
At every step:
- record whose turn it is and confirm it matches the §5 "Waiting on" column;
- open every other role's dashboard and confirm G5 appears (or doesn't) as §5 says;
- confirm the email and audit entry.
Skip the AI summary (R12); note in the timeline where it would happen. Annotations are built — exercise them:
- S3.6, S4.2, S6.4: before each return, annotate the version (once by selecting words, once with Mark area, once as a general note); confirm the students see the notes on that version, that the notes stay on the superseded version after vN+1, and that vN+1 starts clean.
- S5.5, S7.5: each panelist adds a private note; confirm no other panelist (Panel Chair included), the Adviser or a student sees it — and that the other panelists' "No pre-defense notes" task only clears for the author.
- S5.6, S7.6: after the verdict, the students see the panel notes marked "released"; the panelists still do not see each other's.
- Instructor 2, the URO, the Dean/AD and the System Administrator never get marking tools.
Upload files with "Attach dummy PDF" (dev) in the upload form.
Include: one returned concept paper (S3.6), one returned weekly log (S6.2), one re-defense (S7.7), one overdue revision (S8.2), and one URO return (S9.4).
Output test-reports/11-end-to-end.md: a step-by-step timeline (step, actor, what changed, who saw it), every place the handoff broke or stalled, and every point where the walkthrough needed a decision the docs don't make.
```

---

## Prompt 12 — Regression and summary

```
Follow the Shared Rules in ROLE_TEST_PROMPTS.md.

1. Run all guard unit tests.
2. Run T1–T21 through the UI using the scenario controls.
3. Re-check any role report marked as possibly affected by later shared-code changes.
Output test-reports/SUMMARY.md:
- per role: actions passed / total, negative tests passed / total;
- T1–T21 pass/fail/not built (R12 — AI summary only);
- annotation checks: every check in "Checks that R12 no longer skips", re-run in the UI, with the earlier reports updated;
- a "Waiting on the AI summary" list: every check still skipped under R12, to re-run once it exists;
- all config flags and their current values;
- the full list of open items (OQ#, NEW-#) the team still needs to settle, grouped by who decides (team / Adviser).
Note in the summary that this is a development check on localhost, not the study's formal functional testing (that uses the Adviser-validated checklists with participants).
```
