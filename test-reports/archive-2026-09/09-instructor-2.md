# 09 — Instructor 2 (Prompt 9)

**Date:** 2026-09-29 · **Persona:** Prof. Charlie (Instructor 2 of G3; also Adviser of G2 and Panel Member of G1) · **Backend:** local (port 5181)

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **192 / 192 pass**. 18 new in `instructor2.test.js`; 2 older tests updated for the split milestones and the readiness step |
| Production build | Builds. No dev-tools strings in `dist/` |
| Browser walk-through | Dashboard, Overview → Capstone 2 checks, Defense tab (T7), student and Adviser reflection, 375 px width: no horizontal overflow |
| Impeccable audit | Detector: 0 findings. Manual: one P2 (ambiguous labels) fixed (§10) |
| Action checks | 5 / 5 pass (§3) |
| Negative tests | 5 / 5 pass, UI and guard (§4) |
| §7 scenarios | T6 and T7 pass |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/pages/Dashboard.jsx` | **Bug:** at Final Defense Scheduling, Charlie's worklist said "1 item needs something from you", but the "Capstone 2 instructing" section said "Nothing due". The hat section dropped every gate that has an office `queue` ("Final defenses to schedule"), and office queues exist only for Global Roles, so the step showed nowhere. The hat section now keeps the gates its own hat grants | S7.3 |
| `src/pages/Dashboard.jsx` | §4 "Capstone 2 groups, milestones, readiness, schedules": each Instructor 2 row shows milestones (n of 2, approved logs), readiness (check, FM-2005, PC endorsement), the final-defense schedule and verdict, and post-defense requirements (from Final Revision on). Built from the guard-filtered bundle | §4 I2 |
| `src/services/actions.js` `assignRole` | **Leak:** an Instructor 2 assigned during the proposal revision got a "New assignment" email naming a project they could not open yet. Now nobody is emailed about an assignment that does not open the project to them; the S5.8 routing email (which does open it) tells them. Assignments that open the project right away still email at once | S5.8, R3 |
| `src/domain/constants.js`, `stages.js`, `actions.js`, `guard.js` | **S6.5 split into two milestone flags,** "revised manuscript" and "system components" (`CAPSTONE2_MILESTONES`), each confirmed on its own with an optional note. `milestonesConfirmedAt` is still set once both are in, so older data and code keep working (`milestoneStatus()` treats a legacy single confirmation as both). The "Milestones confirmed" email now goes once, when both are in | S6.5 |
| same + `caac.js`, `flags.js` | **NEW-43:** the readiness check is its own step (see §7) | S6.7 |
| same | **NEW-44:** post-defense course requirements (see §7) | S8.5 |
| `src/components/panels/Capstone2Checks.jsx` (new), `OverviewPanel.jsx`, `LogsPanel.jsx` | Overview tab → **"Capstone 2 checks"**: the two milestones, readiness and post-defense requirements, with who confirmed each and when. Instructor 2 gets the Confirm buttons (by capability); the group, Adviser and later offices read it. The milestone section **moved out of the Weekly logs tab** | S6.5, S6.7, S8.5 |
| `src/domain/stages.js` | The FM-2005 gate has a `steps` list (group logs + manuscript, both milestones → readiness → Adviser), so the Next-step panel says who acts in which order | S6.7 |
| `src/components/panels/DefensePanel.jsx` | **T7 UI:** before scheduling, whoever will publish the schedule sees "Publish the final defense schedule" with a disabled button and the steps that come first ("Endorse for final defense scheduling — Program Chair/Coordinator"). It reads the dormant `defense.schedule` grant, not a role name | S7.1, T7 |
| `src/components/panels/GatePanel.jsx` | Step list: added the missing "Weekly logs" tab name | — |
| `src/backend/stageBuilder.js` | Fills in both milestones and readiness past Implementation, and post-defense requirements past Final Requirements. The timeline shift now also moves the nested milestone dates (they showed future dates before this fix) | Dev tools |
| `src/services/worklist.js` | Instructor 2 tasks: milestones left, readiness (once it is allowed), post-defense requirements | §4 I2 |
| `src/__tests__/instructor2.test.js` (new) | 18 tests. A mutation check (reverting the assignment-email fix) fails the S5.8 test as expected | — |

**Store shape:** new optional project fields (`milestones`, `readiness*`, `postDefense*`). I did not bump the localStorage key: missing fields fall back to the old behaviour. Use **Reset to seed** to get the new seed values.

## 3. Action checks

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit (hat) | Notes |
|---|---|---|---|---|---|---|---|---|
| S5.8 | Project appears after routing | ✅ not on the worklist before; appears after | ✅ `canView` false at Proposal Revision, true from Implementation | — | — | ✅ "Stage: Implementation & Monitoring" → I2 (no earlier "New assignment") | — | Access runs Implementation → Archived (Capstone 2 + clearance phases) |
| S6.5 | Confirm milestones (×2) | ✅ Overview → Capstone 2 checks | ✅ Instructor 2 at Implementation only; each once | `milestones.{key}`; both → `milestonesConfirmedAt` | **Students** ✅ read-only rows. **Adviser (Delta)** ✅ and the FM-2005 step list | ✅ "Milestones confirmed" → Adviser + group, once | ✅ `MILESTONE_CONFIRMED`, Instructor 2 | §3 lists no email; the existing one is kept |
| S6.7 | Readiness check with the Adviser | ✅ enabled after both milestones; before that it shows "Confirm both Capstone 2 milestones first." | ✅ `confirmReadiness`; FM-2005 is refused until it is done | `readinessConfirmedAt/By/Note` | **Adviser:** FM-2005 blocker clears, and the step list moves on ✅ | ✅ "Ready for final defense" → Adviser | ✅ `READINESS_CONFIRMED`, Instructor 2 | NEW-43 |
| S7.3 | Publish final-defense schedule | ✅ dashboard "— ready"; Defense tab form | ✅ only at Final Defense Scheduling (after S7.1) | `defenses` row; → Final Defense | **Students, Adviser, panel** see the schedule ✅ | ✅ "Defense scheduled" → group, Adviser, Chair, Member | ✅ `DEFENSE_SCHEDULED`, Instructor 2 | A double submit records one defense |
| S8.5 | Post-defense course requirements | ✅ Overview (Final Revision, Final Requirements) | ✅ `requirements.confirm`, once | `postDefenseConfirmedAt/By/Note` | **Students, Adviser** read it ✅; dashboard row | none (§3: —) | ✅ `POST_DEFENSE_REQUIREMENTS_CONFIRMED`, Instructor 2 | NEW-44: nothing waits on it; the PC endorses without it |

A double-click on "Confirm" (readiness) in the browser recorded one audit row.

## 4. Negative tests

| Must not | UI | Guard |
|---|---|---|
| Annotate as Instructor 2 (T6) | ✅ No annotation UI exists (R12) | ✅ `annotate` is missing from `allowedActions('Instructor 2', s)` at every stage; a forced `addAnnotation` is rejected and writes nothing. `reviewDocument` is also rejected |
| Schedule before the PC endorsement (T7) | ✅ Disabled "Publish schedule" with the missing step named | ✅ `scheduleDefense` is rejected at Final Defense Endorsement; the worklist has no gate |
| Sign weekly logs (`WEEKLY_LOG_SIGNER` = Adviser) | ✅ No Approve/Return on logs | ✅ `signWeeklyLog` denied; a forced call leaves the log Submitted |
| Sign clearance forms (§9 DFD 7.0 leftover) | ✅ No Instructor 2 line on the Approval Sheet or FM-2004 | ✅ `signForm` rejected; no `ENDORSE_TO_URO` / `URO_VERIFY` / `FINAL_APPROVE` / `recordVerdict` / `RECOMMEND_FINAL_DEFENSE` / `ENDORSE_FINAL_DEFENSE` at any stage |
| Confirm milestones outside Implementation, or as another role | ✅ Buttons only for the capability | ✅ The Adviser, a student, and Charlie at Endorsement are all rejected |

**Multi-hat (item 5):** on G3 Charlie's `projectRoles` is `[Instructor 2]`: no review, annotate, log-signing, verdict or FM-2005. On G2 (Implementation), signing a log resolves to hat **Adviser**, and G2's milestones are refused (Foxtrot is G2's Instructor 2). On G1 (T5, Proposal Defense), annotate resolves to **Panel Member**. On the seed dashboard, G1 is absent (no panel yet), G2 sits under Advising, and G3 under Capstone 2 instructing.

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T6 | **Pass** | Guard rejects `annotate` for Instructor 2 at every stage, including a forced call; no annotation UI (R12) |
| T7 | **Pass** | UI: disabled "Publish schedule" naming the PC's endorsement. Guard: `scheduleDefense` rejected. After `ENDORSE_FINAL_DEFENSE` it is allowed, Charlie is emailed, and the dashboard shows "Publish the final defense schedule — ready" |
| T21 | **Pass** (Instructor 2 writes) | Every audit and history row Charlie writes carries hat "Instructor 2" |

## 6. Config flags used

| Flag | Value | Effect |
|---|---|---|
| `I2_READINESS_CHECK` (new) | `'own-step'` (NEW-43) | Readiness is Instructor 2's own step after both milestones; FM-2005 waits on it. `'milestones'` = the milestones count as the check |
| `POST_DEFENSE_REQUIREMENTS_STAGES` (new) | `['FINAL_REVISION', 'CLEARANCE']` (NEW-44) | When S8.5 is open; record only |
| `WEEKLY_LOG_SIGNER` | Adviser (OQ#7) | Instructor 2 does not sign logs |
| `INSTRUCTOR_2_ASSIGNER` | Program Chair/Coordinator (OQ#5) | Who attaches Instructor 2 |
| `AI_SUMMARY_AUDIENCE` | Adviser + Panel (OQ#2) | Instructor 2 does not read the AI summary (guard only, R12) |

## 7. Open items hit

- **NEW-43 — decided 2026-09-29 (this session):** S6.7 readiness is a separate Instructor 2 confirmation after both milestones, before the Adviser's FM-2005, and not a line on the form. **This settles NEW-37** from the Adviser report (06), except its "is 2 the right minimum number of logs?" part, which is still open.
- **NEW-44 — decided 2026-09-29 (this session):** S8.5 is open at Final Revision and Final Requirements, records who and when, and blocks nothing (Instructor 2 stays out of clearance routing, per §9).
- **OQ#5** — The PC assigns Instructor 2 (unchanged). New in this session: an assignment made before the project opens to Instructor 2 no longer emails them early.
- **OQ#7** — The Adviser signs logs; Instructor 2 confirms milestones, readiness and post-defense requirements.
- **S6.5 email** — §3 lists none; the existing "Milestones confirmed" email is kept (now sent once).
- **R10 — shared code touched:** `stages.js` (FM-2005 gate), `guard.js`, `worklist.js`, `Dashboard.jsx` (hat sections), `assignRole`, `stageBuilder.js`. All earlier tests pass. **Re-run needed:** the manual script in **06-adviser.md** step 7 ("Weekly logs → Confirm milestones") is now **Overview → Capstone 2 checks**, with two milestones plus readiness. Also consider re-running **04-program-chair** for the assignment email.

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181 and choose Dev tools → **Reset to seed**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Log in as **Prof. Charlie**. The worklist has G2 under Advising and G3 (Final Revision) under **Capstone 2 instructing**: milestones 2 of 2, readiness confirmed, final defense with its verdict, and "Confirm the post-defense course requirements". G1 is not listed.
3. Open G3 → Overview → **Capstone 2 checks** → S8.5, type a note, **Confirm**. The row shows your name, time and note. Dev tools → Outbox has no email for it.
4. Switch to **Quebec Student** → G3 → Overview: the same rows, read-only.
5. Dev tools → Set project to stage → G3 → **Implementation & Monitoring** → Apply. As **Charlie**, G3 → Overview: the Next-step list shows the group, your two milestones, then readiness, then the Adviser. Readiness says "Confirm both Capstone 2 milestones first." Confirm both milestones: readiness unlocks. Confirm it (double-click: it records once).
6. Switch to **Dean Delta** (Adviser) → Outbox has "Ready for final defense" for Delta. G3 Next step: FM-2005 is still blocked only by the second approved log and the Final Manuscript, if those are missing.
7. Dev tools → **Load scenario T7** → as **Charlie**, G3 → Defense: "Publish the final defense schedule" with a disabled button, "after: Endorse for final defense scheduling — Program Chair/Coordinator" (T7).
8. Switch to **Prof. Alpha** → Overview → **Endorse for final defense scheduling**. Back as **Charlie**: the dashboard shows "Publish the final defense schedule — ready"; Defense tab → set a date and venue → **Publish schedule**. The Outbox has "Defense scheduled" to the group, Delta, Foxtrot and Bravo.
9. T6: as Charlie on G3, no Documents tab has annotation tools (R12); the guard test is in `instructor2.test.js`.

## 9. §9 items found

None. Instructor 2 has no clearance signature (the DFD 7.0 leftover is not built).

## 10. Impeccable audit (changed screens: Capstone 2 checks, disabled schedule, Instructor 2 dashboard facts)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | P2 fixed: the repeated "Note (optional)" and "Confirm" controls now carry per-row accessible names. The disabled button is described by visible text |
| 2 | Performance | 4 | — |
| 3 | Responsive | 3 | 375 px: no horizontal overflow; `.kv` stacks |
| 4 | Theming | 3 | Existing tokens and classes only (`entry`, `kv`, `Badge`) |
| 5 | Implementation integrity | 4 | Detector: 0 findings |
| **Total** | | **17/20** | Good |
