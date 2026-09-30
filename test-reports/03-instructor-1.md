# 03 — Instructor 1 (Prompt 3)

**Date:** 2026-09-29 · **Persona:** Prof. Bravo — Instructor 1 of section WD-401 (G1, G2, G4) and Panel Member of G3 · **Backend:** local (port 5181)
**NEW-6** (Instructor 1 access after S5.8): the prompt says to ask, but the team already decided this in Prompt 0. The flag `I1_ACCESS_AFTER_ROUTING = 'none'` is unchanged and tested.

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **104 / 104 pass**. 19 are new in `instructor1.test.js`. `student.test.js` was updated for the new topic order (S3.4 before S3.5) |
| Production build | Builds. No dev-tools strings in `dist/` |
| Browser walk-through (§8 script) | Block desk, topic approval, registration (title everywhere, stage stays), concept paper, approval → Proposal Development, S4.2 return-only form, G4 roster forwarded → Program Chair's worklist, G3 panel-only view. **No console errors on a fresh load** (see §10 for a dev-only hot-reload note) |
| Impeccable audit | Detector: 0 findings. Manual: no P0/P1 (§10) |
| Action checks | 9 / 9 pass (§3) |
| Negative tests | 6 / 6 pass, UI and guard (§4) |
| Multi-hat (item 4) | Pass (§4) |
| §7 scenarios | Instructor 1 rows of T21 pass |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/domain/stages.js` | **Topic order now follows WORKFLOWS (resolves NEW-24).** Topic Proposal has two gates. `REGISTER_TOPIC` sets the title and **stays** at the stage (`next: null`, `done` once registered). `APPROVE_CONCEPT_PAPER` (handled in the Documents tab) moves the project to Proposal Development. New helpers `openGates()` and `staysAtStage()` | S3.4, S3.6, §3.0 |
| `src/domain/caac.js` | Concept paper upload requires the registered title (S3.5 precondition S3.4). New capability `review.return`, Instructor 1 at Proposal Development: **return** drafts without being able to approve them (S4.2 — before this, Instructor 1 could not return drafts at all) | S3.5, S4.2 |
| `src/domain/guard.js` | New action `returnDocument` | S4.2 |
| `src/services/actions.js` · `submitReview` | Picks `reviewDocument` or `returnDocument` by decision. **Returning requires remarks** (client and service). Approving the concept paper at Topic Proposal runs the `APPROVE_CONCEPT_PAPER` gate inside the same transaction | S3.2, S3.6, S4.2 |
| `src/services/actions.js` · `runGate` | Rejects a gate that is already done. A staying gate writes audit + history (`REGISTER_TOPIC`: title before → after) instead of a transition. Records `topicRegisteredAt` / `topicRegisteredBy` | S3.4, T21 |
| `src/services/actions.js` · `transition` | Also notifies whoever **gains document access** at the new stage. S5.8 now emails Instructor 2 ("project appears"); before, Instructor 2 got nothing | S5.8 |
| `src/services/actions.js` · `addMember` | The one-group-per-student check now runs inside the transaction, keyed per student. **Two groups claiming the same student at once could both succeed before** | S1.1 |
| `src/pages/Dashboard.jsx` | **Block desk** (`BlockDesk`), one per Capstone 1 block taught. It shows the review queue (submissions this user may decide or return), the groups by stage with the current step ("Your step: …", the blocker, or "Waiting on …"), and the block roster (grouped count, ungrouped names). "Create a project group" sits in the block header. Student desk "Next" uses `openGates` | §4 Instructor 1 dashboard |
| `src/components/panels/GatePanel.jsx` | Renders open gates only. "Stays at this stage" for registration. "Continue in the Documents tab" for the concept-paper gate | S3.4, S3.6 |
| `src/components/panels/DocumentsPanel.jsx` | Review form: return-only choices when the user holds just `review.return` (with a note that the Adviser approves). Remarks are required to return. A note that approving the concept paper moves the stage. The form shows only on versions still awaiting a decision | S3.2, S3.6, S4.2 |
| `src/components/panels/OverviewPanel.jsx` | "Registered" (it was the group's creation date) → **Group created**; new **Title registered** row | S3.4 |
| `src/backend/stageBuilder.js` | Registers the title before the concept paper. History uses `APPROVE_CONCEPT_PAPER` | Seed |
| `src/styles.css` | `.block-desk`, `.block-grid` (stacks below 1180 px, roster first), `.plain-list` — existing tokens only | — |
| `src/__tests__/instructor1.test.js` (new) | 19 tests | — |
| `CLAUDE.md` | Documents the gate `done` option, `next: null` and `handledIn` | Docs |

## 3. Action checks

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit (hat) | Notes |
|---|---|---|---|---|---|---|---|---|
| S1.1 | Create group | Block desk → "Create a project group" (existing form) | ✅ Charlie (no block) and unknown section rejected | project + I1 assignment + history + audit, one transaction | Bravo's block desk | — | ✅ `PROJECT_CREATED`, Instructor 1 | — |
| S1.1 | Add student | Existing Overview control, block candidates only | ✅ already grouped, other block, faculty and a **concurrent double claim** all rejected | `projectMembers` row | Student: group workspace appears ✅ | ✅ "Added to a group" | ✅ `MEMBER_ADDED` | — |
| S1.2 | Forward roster (G4) | ✅ | ✅ an empty group is rejected | → Adviser Assignment | PC Alpha: G4 with "Route adviser assignment — Assign an Adviser…" ✅. Bravo: "Waiting on Program Chair/Coordinator" ✅ | ✅ → alpha + students | ✅ `STAGE_ENDORSE_ROSTER`, Instructor 1, stage before → after | Unassigned students: see NEW-29 |
| S3.2 | Return topics / concept paper | ✅ button disabled without remarks | ✅ remarks required | For Revision | Students: remarks + "vN was returned — upload a revised version" | ✅ Revision requested | ✅ `REVIEW_DECISION` | — |
| S3.3 | Approve one topic | ✅ topic picker | ✅ a topic not in the five is rejected | Approved + `approvedTopic` | Students + Adviser see the approved topic | ✅ Approved (names the topic) | ✅ | Approving one closes the rest |
| S3.4 | Register title | ✅ "Stays at this stage" | ✅ before approval rejected; twice rejected | `title`, `previousTitles`, `topicRegisteredAt`; stage unchanged | Title in the header, dashboards and worklists for students + Adviser ✅ | — (§3 lists none) | ✅ `REGISTER_TOPIC` title before → after | — |
| S3.6 | Approve concept paper | ✅ note "moves the group to Proposal Development" | ✅ `runGate` refused ("Documents tab"); the Adviser cannot decide at Topic Proposal | CP Approved → Proposal Development | Students + Adviser | ✅ Approved; Stage email → students + Adviser | ✅ `STAGE_APPROVE_CONCEPT_PAPER`, Instructor 1 | A return keeps the stage (tested) |
| S4.2 | Return a draft | ✅ only "Return / Reject" offered | ✅ approve rejected for Instructor 1; the Adviser approves | For Revision | Students: returned task | ✅ Revision requested | ✅ Instructor 1 | Annotating is guard-only (R12) |
| S4.3 | Approve for defense | Next-step panel | ✅ blocked until the Adviser approves the latest version | → Panel Assignment | PC: `CONFIRM_PANEL` gate in the worklist ✅ | ✅ → PC (NEW-8) | ✅ | — |
| S5.8 | Route to Capstone 2 | Next-step panel | ✅ blocked until FM-2004 is signed and an Instructor 2 is assigned | → Implementation | **Instructor 2 (Foxtrot): project appears** ✅. Bravo: gone (NEW-6) ✅ | ✅ now includes Instructor 2 | ✅ | — |

## 4. Negative tests and multi-hat

| Must not | UI | Guard |
|---|---|---|
| Assign advisers or panels | ✅ No assign controls | ✅ `assignRole` Adviser / Panel Member rejected |
| Schedule a defense | ✅ No schedule form | ✅ Proposal (PC, NEW-2) and final (Instructor 2) rejected |
| Confirm Capstone 2 milestones / record a verdict | ✅ | ✅ Rejected |
| See groups outside the block | ✅ G3 (CS-301 → CS-401) is visible only under the Panel Member hat | ✅ G3 at Topic Proposal: `canView` false, not in the worklist |
| Approve before the precondition | ✅ Blockers shown | ✅ Register before approval, approval for defense before the Adviser, empty-roster forward, route before FM-2004/I2, a gate from another stage — all rejected |
| No Instructor 1 hat on another project | — | ✅ `allowedActions('Instructor 1', stage)` has no verdict, assign, schedule, milestone or log-sign action at any stage |

**Multi-hat (item 4):** On G3, Bravo resolves to `[Panel Member]` only. There is no roster, topic, gate or review action, and he sees the latest versions only. Browser: no upload or review form. His FM-2004 line reads "Not your turn yet — waiting on Adviser" and becomes signable once the Adviser signs (test). On G1, G2 and G4 he resolves to `[Instructor 1]` only, with no `annotation.private` or `verdict.record`. Annotations are guard-only (R12).

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T21 (Instructor 1 rows) | **Pass** | Every write by Bravo in the test (review, registration, roster forward) has audit hat **Instructor 1**, before → after, and a matching history entry. In the browser, the audit shows `REVIEW_DECISION`, `REGISTER_TOPIC` and `STAGE_APPROVE_CONCEPT_PAPER` with hat Instructor 1 |
| I1 negatives | **Pass** | §4 |

## 6. Config flags used

| Flag | Value | Effect |
|---|---|---|
| `I1_ACCESS_AFTER_ROUTING` | `none` (decided in Prompt 0) | The group leaves Instructor 1's view at Implementation (tested) |
| `PROPOSAL_DEFENSE_SCHEDULER` | Program Chair/Coordinator | Instructor 1 cannot schedule (tested) |
| `INSTRUCTOR_2_ASSIGNER` | Program Chair/Coordinator | S5.8 waits for the PC to assign Instructor 2 |
| `BLOCK_ADVISER_ON_PANEL` | true | — |

No new flags.

## 7. Open items hit

- **NEW-24 (from Prompt 2) — resolved.** The order is S3.3 approve → S3.4 register (stays) → S3.5 concept paper → S3.6 approval moves the stage.
- **NEW-6** — Decided in Prompt 0 (`none`). Instructor 1 loses the group at Implementation.
- **NEW-8** — Both Instructor 1 endorsements email the Program Chair: S1.2 (roster) and S4.3 (defense readiness). Which one the manuscript means is still open.
- **NEW-9** — The weekly log stays Capstone 2 only. Instructor 1 has no log queue.
- **OQ#5** — Instructor 1 comes from `sections.instructorId` (seeded), and whoever creates a group becomes its Instructor 1. Nobody in the app assigns Instructor 1 yet.
- **OQ#11** — Year level and block live on the user record in the mockup (seed + registration form). The roster depends on `block`.
- **NEW-29 (new — flag, not decided):** Nothing says what happens to unassigned students when the roster is forwarded. Behaviour now: forwarding is per group and is not blocked by ungrouped students; they stay ungrouped (Whiskey). The block desk lists them under "Not in a group yet". Options: (a) block forwarding until the whole block is grouped, (b) warn only, (c) leave as is. Also open: "forward block roster" reads as one action per block, but the mockup forwards per group.
- **NEW-30 (new):** WORKFLOWS names no email for S3.4 (title registration). None is sent: the title just changes everywhere.
- **R10 — shared code touched:** `stages.js` (topic gates, `openGates`), `caac.js` (`review.return`, concept-paper precondition), `guard.js`, `actions.js` (`submitReview`, `runGate`, `transition`, `addMember`), the stage builder, `GatePanel`, `DocumentsPanel`. All earlier tests pass.
  - **Prompt 2 (Student):** the concept paper now waits for the registered title (tests updated). A spot re-check of the student Documents tab is enough.
  - **Prompt 6 (Adviser):** the Adviser still approves drafts. Instructor 1 returns only.
  - **Prompt 9 (Instructor 2):** check the S5.8 email.

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181 and choose Dev tools → **Reset to seed**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Log in as **Prof. Bravo**. The worklist shows **Section WD-401 · Capstone 1**:
   - Block roster: "7 of 8 students in a group", with Whiskey not in a group
   - Review queue: "Topic Proposal v1 — Untitled — Group 1"
   - Groups by stage: G4 "Your step: Forward roster…", G1 "Approve one of the proposed topics first", G2 "Waiting on Panel Chair"
3. Open **G4** → Overview → **Forward roster to the Program Chair/Coordinator**. The panel now reads "Waiting on Program Chair/Coordinator".
4. Switch to **Prof. Alpha** → the worklist shows G4 with "Route adviser assignment…". The outbox has "Stage: Adviser Assignment" to alpha and the G4 students.
5. Back as **Bravo** → G1 → Documents. Choose Decision **Return for Major Revisions** → the Submit button stays disabled until you enter remarks. Switch to **Approve**, pick a topic under **Topic to approve** → Submit decision.
6. G1 → Overview → **Register the approved topic as the project title** ("Stays at this stage"). The header shows the new title. The record shows Previous titles and **Title registered**.
7. Switch to **Kilo Student** → Documents → Concept Paper → upload a PDF.
8. Back as **Bravo** → G1 → Documents → Concept Paper v1 → Approve (the note says it moves the group). The stage badge reads **Proposal Development**. History shows `Topic Proposal → Proposal Development`.
9. As **Kilo**, upload a Proposal Manuscript PDF. As **Bravo**, the decision list offers only Return / Reject, with "The Adviser approves drafts…". Return it with remarks → For Revision.
10. As **Bravo**, open `/projects/p_g3`. There is no upload, review or next-step button. Forms tab: FM-AAC-SOC-2004 says "Not your turn yet — waiting on Adviser".
11. Dev tools → set **G2 → Proposal Revision**. The next step is blocked ("FM-AAC-SOC-2004 still needs…"). Routing needs the Adviser + Panel signatures and a PC-assigned Instructor 2; the unit test covers it end to end: Foxtrot is emailed and G2 leaves Bravo's view.

## 9. §9 items found

None.

## 10. Impeccable audit (changed screens: block desk, review form, next-step panel)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | The block desk is a `section` labelled by its `h2`, and the roster is an `aside` with a label. Tab roving is the app-wide P2 |
| 2 | Performance | 4 | Review queue: one guard call per document, fine at this scale |
| 3 | Responsive | 3 | The desk stacks below 1180 px, roster first, and the groups table scrolls inside `.table-scroll` |
| 4 | Theming | 3 | Existing tokens only. No dark mode (systemic) |
| 5 | Implementation integrity | 4 | Detector: 0 findings. Rules and tables, no card grid |
| **Total** | | **17/20** | Good |

No P0 or P1 issues. P3 findings:
- Stage-builder history rows carry no role hat, so the History tab shows the actor without one for fabricated past steps.
- Dev only: after a hot reload of `AppContext.jsx`, React logs "useApp must be used inside <AppProvider>" once. A normal reload clears it, and production is unaffected.
