# 04 — Program Chair/Coordinator (Prompt 4)

**Date:** 2026-09-29 · **Personas:** Prof. Alpha (PC for WD + CS; Adviser of G1, Panel Chair of G2), plus the NPC coordinators Prof. Teresa Lim (NW) and Prof. Grace Tan (EMC) where their programs had the queue data · **Backend:** local (port 5181)
**NEW-5 / T19**: the prompt says to ask, but the team decided this in Prompt 0 (`BLOCK_ADVISER_ON_PANEL = true`). It is tested and shown below, not re-asked.

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **129 / 129 pass**. 15 are new in `programchair.test.js` |
| Production build | Builds. No dev-tools strings in `dist/` |
| Browser walk-through (§8 script) | Alpha's dashboard (queues, Advising, Panel, program summary). NW Program Chair: Needs adviser / Needs panel. S2.1 assign + route through the UI, with the redirect notice. The Dean's "Adviser assignments to approve". **No console errors** after a fresh load |
| Impeccable audit | Detector: 0 findings. Manual: no P0/P1 (§10) |
| Action checks | 8 / 8 pass (§3) |
| Negative tests | 7 / 7 pass, UI and guard (§4) |
| §7 scenarios | T1, T2, T3, T10, T16 and T19 pass |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/domain/stages.js` | Each office gate names its dashboard **queue** (`queue:`): "Needs adviser", "Adviser assignments to approve", "Needs panel", "Proposal defenses to schedule", "Recommendations to endorse", "Final defenses to schedule", "Approval Sheets to endorse", "Clearances to verify", "Projects for final approval" | §4 PC / Dean / URO dashboards |
| `src/services/worklist.js` | Every gate and task carries the **hat** it belongs to. New `officeQueues(user)` derives a user's queues from the Global Role policies, in workflow order, so empty queues still show. New task **"Assign an Instructor 2"** (queue "Needs Instructor 2") when a PC step needs one. Instructor 1 drafts to return count as a task. A form to sign is one task per form, carrying its signatory line's hat | §4, S5.8, S7.3 |
| `src/pages/Dashboard.jsx` | The faculty dashboard is rebuilt: **office queues** first (queues with work as tables — project, section, status or blocker, Open; empty queues listed on one line), then **one section per project hat** (Advising, Panel, Instructor 1 outside the section desk, Capstone 2 instructing), then other visible projects. **Program summary** (NEW-11): counts per program — groups, Capstone 1, Capstone 2, archived, overdue — linked to Reports. A one-time notice appears when a project leaves your worklist (see the next row) | §4 PC dashboard, NEW-11, item 1 |
| `src/pages/ProjectWorkspace.jsx` | When your own step moves a project to a stage that is not yours (the PC routing to the Dean, scheduling, endorsing), the workspace returns you to the worklist and explains where the project went. Before, you were **stranded on "This project is not available to you"**. The notice is tied to the user who acted, shown once, and cleared from history, so a reload or persona switch does not show it | NEW-11 UX |
| `src/domain/caac.js` + `firestore.rules` | **A proposed Adviser has no access until the Dean and AD approve** (`adviserAppointed`: from Topic Proposal on). Before, the Adviser opened the project, documents included, from the moment the PC picked them. The rules mirror the change | S2.1, S2.2 |
| `src/services/actions.js` | **No email to a proposed Adviser.** `assignRole` no longer emails an Adviser, and stage emails include the Adviser only once appointed. The Adviser's first email is "Adviser appointed" (S2.2). Before, Prof. Joy Valdez was emailed at assignment and again when the PC routed the assignment | S2.1, S2.2 |
| `src/pages/Reports.jsx` | Scope logic moved into `reportScope(me, snap)` (shared with the dashboard summary). Program codes with the full name on hover | S10.3 |
| `src/styles.css` | `.hat-row`, `.btn.small`, `.queue-clear` — existing tokens only | — |
| `src/__tests__/programchair.test.js` (new) | 15 tests | — |

## 3. Action checks

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit (hat) | Notes |
|---|---|---|---|---|---|---|---|---|
| S2.1 | Assign Adviser (NW2) | ✅ Faculty assignments offers **Adviser only** at this stage | ✅ Alpha (not NW) rejected; routing without an Adviser rejected | Assignment row | Proposed Adviser: **no access, no email** ✅. Students: name hidden ✅ | — (deferred to S2.2) | ✅ `ROLE_ASSIGNED`, Program Chair/Coordinator | — |
| S2.1 | Route to the Dean + AD | ✅ | ✅ | → Adviser Approval | **Dean Delta: "Adviser assignments to approve" lists NW2** ✅. PC: back to the worklist with a notice ✅ | ✅ → Dean, AD, students (not the Adviser) | ✅ `STAGE_ROUTE_ADVISER` | After both approve: Adviser gets access and "Adviser appointed" (test) |
| S5.1 | Assign Panel Chair + Member (NW3) | Existing controls | ✅ Chair + Member required to confirm | Assignments | Panelists: project on their dashboard at once, latest version only ✅ | ✅ "Assigned to a panel" → each panelist | ✅ | — |
| S5.1 | Confirm panel | ✅ Next step | ✅ | → Proposal Defense Scheduling | PC: "Proposal defenses to schedule" ✅ | ✅ | ✅ | — |
| S5.2 | Schedule proposal defense (EMC2) | Defense tab | ✅ PC only; Instructor 1 rejected (NEW-2 default) | Defense + → Proposal Defense | Group, Adviser, panel | ✅ "Defense scheduled" → all of them | ✅ | PC loses access afterwards (NEW-11) |
| — | Assign Instructor 2 (EMC3) | "Needs Instructor 2" queue | ✅ | I2 assignment | I2 gets "New assignment"; the queue empties | ✅ | ✅ | OQ#5 default |
| S7.1 | Endorse for final-defense scheduling (G3, T7) | "Recommendations to endorse" ✅ | ✅ rejected without FM-2005 | → Final Defense Scheduling | **Instructor 2 (Charlie): `scheduleDefense` now allowed** ✅ | ✅ → Charlie | ✅ | — |
| S7.2 | Final-defense panel | Assign controls at Final Defense Endorsement | ✅ `assignPanel` allowed | — | — | ✅ | ✅ | Panel carries over (`SAME_PANEL_BOTH_DEFENSES`) |
| S9.3c | Endorse Approval Sheet (G3, T10) | "Approval Sheets to endorse" ✅ | ✅ | PC line signed; → URO Verification | **URO: project opens, "Clearances to verify"** ✅ | ✅ → URO | ✅ | — |
| S10.3 | Reports + dashboard summary | ✅ WD + CS only for Alpha | `report.generate` | — | — | — | — | Counts only (NEW-11) |

## 4. Negative tests

| Must not | UI | Guard |
|---|---|---|
| Give the final signature (T10) | ✅ No Final Approval queue for the PC | ✅ `FINAL_APPROVE` rejected after endorsing |
| Record a verdict except as G2's Panel Chair | ✅ The verdict form shows only on G2 | ✅ Rejected on G1 |
| Adviser actions on G2 (T2) | ✅ The Panel section shows only the verdict step | ✅ Review decision rejected |
| Open G3 documents without an active PC step (T3, NEW-11) | ✅ G3 appears only in the summary counts | ✅ `canView` and `readDocuments` false at Final Revision |
| Endorse before FM-2005 | ✅ Blocker shown | ✅ "FM-AAC-SOC-2005 has not been submitted." |
| Act on another program's projects | ✅ Alpha's queues hold WD/CS only | ✅ `assignRole` on NW2 rejected |
| Sit on the panel of a group she advises (T19) | ✅ The option is disabled: "Adviser on this project — cannot sit on its panel" | ✅ Rejected for Panel Member and Panel Chair |

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T1 | **Pass** (guard) | Alpha signs G1's weekly log with hat Adviser |
| T2 | **Pass** (guard + UI) | G2: verdict as Panel Chair only; review rejected |
| T3 | **Pass** (guard + UI) | G3 invisible at Final Revision, visible at Final Defense Endorsement and Clearance (PC steps) |
| T10 | **Pass** (guard + service) | Endorses and signs the PC line; `FINAL_APPROVE` rejected |
| T16 | **Pass** (service) | Charlie's worklist loses G1 at once; `ROLE_UNASSIGNED` with hat Program Chair/Coordinator |
| T19 | **Pass** — decided (NEW-5) | Alpha cannot take a panel seat on G1. The UI option is disabled with the reason |

## 6. Config flags used

| Flag | Value | Effect |
|---|---|---|
| `PC_PROGRAM_VISIBILITY` | `summary-outside-pc-steps` | Access only at PC steps; counts on the dashboard and in Reports |
| `PROPOSAL_DEFENSE_SCHEDULER` | Program Chair/Coordinator | The PC schedules the proposal defense (NEW-2) |
| `INSTRUCTOR_2_ASSIGNER` | Program Chair/Coordinator | "Needs Instructor 2" queue (OQ#5) |
| `BLOCK_ADVISER_ON_PANEL` | true (decided) | T19 |
| `SAME_PANEL_BOTH_DEFENSES` | true (decided) | The panel carries over; the PC can change it at Final Defense Endorsement |

## 7. Open items hit

- **NEW-2** — The PC schedules the proposal defense (default, tested).
- **NEW-5 / T19** — Decided in Prompt 0; tested.
- **NEW-6** — The same panel carries over to the final defense (decided); the PC may still change it at S7.2.
- **NEW-11** — Access only at PC steps (Adviser Assignment, Panel Assignment, Proposal Defense Scheduling, Proposal Revision, Final Defense Endorsement, Clearance); otherwise counts. The dashboard now says so and returns the PC to the worklist once a project leaves their steps.
- **NEW-32 (new, inferred):** A proposed Adviser gets no access and no email until the Dean and AD approve. This follows S2.2 ("Adviser: group appears under Advising" after approval). Confirm with the team.
- **NEW-33 (new):** WORKFLOWS names no email for the Instructor 2 assignment. The assignee gets the generic "New assignment" email.
- **NEW-34 (new, seed only):** In the NPC data, EMC's Program Chair (Prof. Grace Tan) is also a Panel Member of EMC Group 3. Nothing forbids a PC on a panel, but the team may want a rule, as for the Adviser (NEW-5).
- **R10 — shared code touched:** `stages.js` (queue names), `worklist.js` (hats, `officeQueues`, Instructor 2 task), `caac.js` + `firestore.rules` (Adviser access from approval), `actions.js` (Adviser emails), Dashboard, ProjectWorkspace. All earlier tests pass.
  - **Prompt 5 (Dean/AD) and Prompt 10 (URO):** their dashboards now use the same queues; polish them there.
  - **Prompt 6 (Adviser):** "Advising" section, and no access before approval.

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181 and choose Dev tools → **Reset to seed**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Log in as **Prof. Alpha**. The worklist shows:
   - "Nothing waiting in Needs adviser · Needs panel · … · Approval Sheets to endorse"
   - **Advising** (G1, nothing due) and **Panel** (G2: "Record the official verdict — ready")
   - **Your programs at a glance**: WD 3 groups in Capstone 1, CS 3 in Capstone 2
3. Open `/projects/p_g3` → "This project is not available to you" (T3, NEW-11).
4. Switch to **Prof. Teresa Lim** (NPC accounts): **Needs adviser** lists NW Group 2 ("Assign an Adviser before routing."), and **Needs panel** lists NW Group 3.
5. Open NW Group 2 → Overview → Faculty assignments. Project role offers **Adviser** only. Pick Prof. Joy Valdez → Assign → **Route adviser assignment to the Dean and Associate Dean**. You return to the worklist with "“Untitled — Group 2 (NW-401)” moved to Adviser Approval…".
6. Dev tools → Outbox: "Stage: Adviser Approval" to the NW2 students, delta@ and echo@ — **not** joy.valdez@.
7. Switch to **Prof. Joy Valdez** → NW2 is not on her worklist, and `/projects/p_nw2` is not available.
8. Switch to **Dean Delta** → **Adviser assignments to approve** lists NW Group 2 and CYB Group 1 → approve NW2. Switch to **AD Echo** → approve it too. Switch to **Prof. Joy Valdez** → NW2 is under **Advising**, and the outbox has "Adviser appointed" to her and the students.
9. As **Prof. Teresa Lim** → NW Group 3 → assign a Panel Chair and a Panel Member → **Confirm panel composition**. The panelists see NW3 on their dashboards.
10. Dev tools → **Load scenario T7** → as **Prof. Alpha**: **Recommendations to endorse** lists G3 → Endorse. As **Prof. Charlie**, G3 → Defense: the schedule form is available.
11. Dev tools → **Load scenario T16** → as **Prof. Alpha**, open G1 → Overview → **Unassign** Prof. Charlie (Panel Member). As **Prof. Charlie**, G1 is gone.
12. Dev tools → **Load scenario T10** → as **Prof. Alpha**: **Approval Sheets to endorse** lists G3 → Endorse → back to the worklist with the notice. As **URO Uniform**: **Clearances to verify** lists G3.

## 9. §9 items found

None.

## 10. Impeccable audit (changed screens: faculty dashboard, workspace redirect)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Queue tables have headers. The notice uses `role="status"`. Tab roving is the app-wide P2 |
| 2 | Performance | 3 | `queueItems` runs twice per queue per render (filter and count). Fine at 15 projects (P3) |
| 3 | Responsive | 3 | Queue tables scroll inside `.table-scroll`; the summary table is five narrow numeric columns |
| 4 | Theming | 3 | Existing tokens only |
| 5 | Implementation integrity | 4 | Detector: 0 findings. Tables and rules, no card grid. Queue names come from the stage machine, not from the component |
| **Total** | | **16/20** | Good |

No P0 or P1 issues. P3: the program summary shows the full program name next to the code, which wraps on narrow screens.
