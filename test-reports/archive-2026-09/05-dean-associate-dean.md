# 05 — Dean and Associate Dean (Prompt 5)

**Date:** 2026-09-29 · **Personas:** Dean Delta (Dean; Adviser of G3), AD Echo (Associate Dean; Panel Member of G2) · **Backend:** local (port 5181)

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **139 / 139 pass**. 10 are new in `dean.test.js` |
| Production build | Builds. No dev-tools strings in `dist/` |
| Browser walk-through (§8 script) | Echo approves CYB Group 1, then Delta's queue shows "1 of 2 approvals done" and the step panel shows Echo ✓ and the Dean as Now. G3 archived: student sees **Completed · Result: Pass**. Records search from the dashboard (`/records?q=iot`). No console errors |
| Impeccable audit | Detector: 0 findings. Manual: no P0/P1 (§10) |
| Action checks | 5 / 5 pass (§3) |
| Negative tests | 5 / 5 pass, UI and guard (§4) |
| §7 scenarios | T8, T9 and T11 pass |
| **NEW-5** | Deadlock found, then **decided this session: the other office approves alone** (§7). Built and tested |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/domain/stages.js` | `FINAL_APPROVE` lists the whole Approval Sheet chain as steps (Adviser, Panel, PC, URO signed; Dean and AD open, in any order). Adviser approval already listed both offices (added before this prompt) | S9.5, S2.2 "1 of 2" |
| `src/pages/Dashboard.jsx` | Queue rows show progress ("1 of 2 approvals done"). **Records archive** search on the dashboard for `records.search` holders (opens `/records?q=…`). Student desk for an archived project: **Completed** and **Result: Pass** badges with the archive date | S2.2, S10.1, S9.5 "students see Completed" |
| `src/pages/Records.jsx` | Reads `?q=` so the dashboard search lands filtered | S10.1 |
| `src/styles.css` | `.records-search` — existing tokens | — |
| `src/domain/stages.js`, `src/services/actions.js`, `src/backend/stageBuilder.js`, `src/domain/flags.js` | **NEW-5 decision.** When the PC routes an assignment, the project records which approving office the named Adviser holds (`adviserOffices`). `requiredAdviserApprovers(b)` leaves that office out, so the other office approves alone. The step panel shows the named office as "Named as the Adviser, so this office does not approve". Only the required office is emailed. Store key → `hausoc.db.v8` | NEW-5, S2.2 |
| `src/__tests__/dean.test.js` (new) | 10 tests | — |

The dashboard queues themselves ("Adviser assignments to approve", "Projects for final approval"), the per-hat sections and the school summary came from Prompt 4, built on the same code. Delta's G3 appears under **Advising**, Echo's G2 under **Panel**.

## 3. Action checks

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit (hat) | Notes |
|---|---|---|---|---|---|---|---|---|
| S2.2 | First approval (Echo, CYB1) | ✅ Step panel: AD ✓, Dean **Now** | ✅ second click by Echo: "You have approved. Waiting on: Dean" | `adviserApprovals.Associate Dean` | **Delta: queue shows "1 of 2 approvals done"** ✅ | ✅ "Adviser assignment to approve" → Delta | ✅ `ADVISER_APPROVAL_RECORDED`, Associate Dean | Any order (flag `both`) |
| S2.2 | Second approval (Delta) | ✅ | ✅ | → Topic Proposal (Conceptualization) | Adviser: group under **Advising** ✅. Students: adviser name shown ✅. Delta and Echo: project gone (T9) ✅ | ✅ "Adviser appointed" → Adviser + group | ✅ `STAGE_APPROVE_ADVISER`, Dean | — |
| S9.5 | First final signature (Echo, G3) | ✅ Step panel lists the full chain | ✅ | AD line signed; stays at Final Approval | Delta: step is Now | ✅ "Final approval" → Delta | ✅ `FINAL_APPROVAL_SIGNED` | — |
| S9.5 | Second final signature (Delta) | ✅ | ✅ | → **Archived**, status Archived, result Pass, Approval Sheet Signed, documents Archived | **Students: "Completed · Result: Pass"** ✅. Records table lists G3 ✅ | ✅ "Stage: Archived" → group | ✅ `STAGE_FINAL_APPROVE`, Dean | "Completed" is shown from Archived + Pass (no separate status value) |
| S10.1 / S10.3 | Records search; reports | ✅ Dashboard search → filtered Records; school-wide summary + Reports | `records.search`, `report.generate` | — | — | — | — | Seed has no archived project; archive one first (§8 step 7) |

## 4. Negative tests

| Must not | UI | Guard |
|---|---|---|
| Approve before the PC routes the assignment | ✅ Not in the queue; pasted URL shows "not available" | ✅ `canView` false at Adviser Assignment; `runGate` rejected |
| Sign before the URO clears (T11) | ✅ G3 at URO Verification shows no final-approval step to Delta (he sees it as its Adviser); Echo cannot open it | ✅ `FINAL_APPROVE` rejected |
| Annotate where they hold no reviewer hat (R12) | Not built | ✅ `annotate` denied at Adviser Approval and at Final Approval; `addAnnotation` rejected |
| Approve an assignment naming themselves (NEW-5) | ✅ Blocked, with the reason "you are not the Adviser being approved"; the other office approves alone | ✅ Rejected; the assignment completes with the other office (both directions tested) |
| Office hat leaking into the other persona's project | ✅ | ✅ Echo cannot open G3; Delta cannot open G2 |

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T8 | **Pass** | Delta: every G3 document version and history (Adviser hat), at every stage |
| T9 | **Pass** | Checked at all 18 stages for both Delta and Echo: visible **only** at Adviser Approval, Final Approval and Archived. Pasted URLs elsewhere show the generic page |
| T11 | **Pass** | No final signature at URO Verification (guard and UI) |

## 6. Config flags used

| Flag | Value | Effect |
|---|---|---|
| `ADVISER_APPROVAL` | `both` | Both offices, any order; "1 of 2" shown |
| `BLOCK_SELF_APPROVAL` | true (decided in Prompt 0; extended in Prompt 5) | The named office cannot approve; the other office approves alone |

## 7. Open items hit

- **NEW-5 — decided this session.** With `ADVISER_APPROVAL = both` and `BLOCK_SELF_APPROVAL = true`, an assignment naming the Dean (or the AD) could never complete: the other office approved, the named one could not, and nobody else could. §6 makes Dean Delta a real Adviser (G3), so this is not hypothetical. **Decision: the other office approves alone.** Built as described in §2 and tested both ways.
- **NEW-7 — not built, listed.** There is no reject/return path for an adviser assignment. A Dean or AD who disagrees can only leave it unapproved. The URO return path (NEW-7, URO prompt) is separate.
- **NEW-35 (new):** S9.5 says the status becomes "Completed". The data model uses `status: 'Archived'` and `archiveResult: 'Pass'`; the UI shows "Completed". Confirm whether a separate Completed status is wanted.
- **NEW-36 (new, seed):** The seed has no archived project, so the records table is empty until a project is archived (dev tools set-stage, or the S9.5 flow). A past cohort could be seeded if the team wants records data by default.
- **R10:** The dashboard, Records, the adviser-approval gate (required offices) and the stage builder changed. No CAAC policy change. All earlier tests pass; the seed gains `adviserOffices` (store key v8).

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181 and choose Dev tools → **Reset to seed**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Log in as **AD Echo**. **Adviser assignments to approve** lists CYB Group 1 ("0 of 2 approvals done"). **Panel** shows G2 (Panel Member).
3. Open CYB Group 1 → **Approve adviser assignment**. The step panel shows Associate Dean ✓ and Dean **Now**. A second click says "You have approved. Waiting on: Dean".
4. Switch to **Dean Delta**. The queue shows CYB Group 1 with "1 of 2 approvals done". **Advising** lists G3. Approve → you return to the worklist ("moved to Topic Proposal…").
5. Dev tools → Outbox: "Adviser appointed" to Prof. Noel Pascual (CYB1's Adviser) and the four students. Switch to **Prof. Noel Pascual**: CYB1 is under **Advising**.
6. Open `/projects/p_cyb1` as Delta → "This project is not available to you" (T9).
7. Dev tools → set **G3 → Final Approval** → as **AD Echo**, open G3 → **Sign the Approval Sheet (final approval)**. As **Dean Delta** → sign. G3 is Archived.
8. Switch to **Quebec Student** → dashboard: **Completed · Result: Pass**, "Your project is completed and archived on …".
9. As **Dean Delta** → Worklist → **Records archive** → search "iot" → G3 is listed (title, research area, students, adviser, term, Pass).
10. Dev tools → **Load scenario T11** → as **Dean Delta**, G3 has no final-approval step.

## 9. §9 items found

None.

## 10. Impeccable audit (changed screens: dashboard queues/records, student completed state)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | The records search is a `role="search"` form with a labelled input; badges carry text. Tab roving is the app-wide P2 |
| 2 | Performance | 4 | — |
| 3 | Responsive | 3 | The search form stays inside 560 px and wraps on narrow screens. P3: the "Institutional" nav label shares a row with links at phone width (pre-existing) |
| 4 | Theming | 3 | Existing tokens only |
| 5 | Implementation integrity | 4 | Detector: 0 findings |
| **Total** | | **17/20** | Good |

## 11. Re-run 2026-09-30 (after Prompt 10, URO)

Shared code changed in Prompt 10: the URO clearance email, the Approval Sheet URO line (now flag `URO_SIGNS_APPROVAL_SHEET`), the return paths, and the monotonic clock. Re-checked in the browser (port 5181) and in tests (`dean.test.js`, `uro.test.js`: all pass).

| Check | Result |
|---|---|
| T11 — no final signature at URO Verification | **Pass** (guard: Delta and Echo rejected; UI: no step for them) |
| URO clears → project reaches the Dean and AD for the first time | **Pass.** AD Echo cannot open G3 before; after, "Projects for final approval · Ready", "5 of 7 steps done" |
| Email on arrival | **Pass, changed:** the event is now **"Fully cleared project endorsed"** (§3's name), to Dean, AD, group and Adviser. It was "Stage: Final Approval" |
| Step list | Adviser, Panel Chair, Panel Member, PC, **URO ("Verified the certificates and signed")**, then Dean and AD in any order. With `URO_SIGNS_APPROVAL_SHEET` off, the URO step drops out and archiving still works (tested) |
| Echo signs → Delta signs → Archived, Pass, "Stage: Archived" email | **Pass** |
| What Echo sees at Final Approval | Next step, record, members, faculty. Instructor 2's Capstone 2 checks and the URO section no longer show to the offices (Prompt 10) |
| T9 | **Pass** (unchanged tests) |

No other change is needed for the Dean/AD.
