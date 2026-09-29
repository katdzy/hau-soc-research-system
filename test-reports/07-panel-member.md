# 07 — Panel Member (Prompt 7)

**Date:** 2026-09-29 · **Personas:** Prof. Charlie (G1 panel via T4/T5/T16), Prof. Bravo (G3), AD Echo (G2) · **Backend:** local (port 5181)

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **159 / 159 pass**. 9 are new in `panel.test.js` |
| Production build | Builds. No dev-tools strings in `dist/` |
| Browser walk-through | Echo's **Panel** section (counts, proposal defense schedule, "Proposal Manuscript v2 · Approved"). Bravo's Next step on G3: the signing sequence with his line 5th. No console errors |
| Impeccable audit | Detector: 0 findings. Manual: no P0/P1 (§10) |
| Action checks | 4 / 4 pass (§3) |
| Negative tests | 5 / 5 pass, UI and guard (§4) |
| §7 scenarios | T4 (guard), T5, T15 and T16 pass |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/domain/stages.js`, `src/services/actions.js` | **S8.4: the last FM-2004 signature now completes the revisions and opens Clearance**, as WORKFLOWS S8.4 and §3.0 say ("FinalRevision → Clearance: Adviser + Panel sign FM-2004"). Before, the mockup waited for an extra **"Close revisions and open clearance" click by Instructor 2**, a step WORKFLOWS does not have. The final-revision gate is now `COMPLETE_FINAL_REVISION` (handled in the Forms tab, capability `revision.verify`). On the last signature: the revision countdown becomes Completed, the Approval Sheet is issued to the Adviser, and the stage moves to Clearance (email to the group, with the Panel Member as actor) | S8.4, §3.0 |
| `src/domain/caac.js` | New capability `revision.verify` for the Adviser and panel at Proposal/Final Revision, so their Next-step panel shows the signing sequence and a Forms shortcut. Instructor 2's `revision.close` at Final Revision is removed (unused now) | S5.7, S8.4 |
| `src/services/actions.js` | **S5.7:** when FM-2004 is fully signed after the proposal defense, Instructor 1 is emailed "Revisions verified" (S5.8 is theirs). **S9.3b:** when the whole panel has signed the Approval Sheet, the **Program Chair/Coordinator is emailed** ("Approval Sheet to endorse"). Before, nobody was: the PC's line is signed through a workflow step, so the next-signer email skipped it | S5.7, S9.3b |
| `src/pages/Dashboard.jsx` | The **Panel** section shows Revisions to verify · Forms to sign counts and, per project, the open defense (date, venue) and the **latest manuscript version** the panelist may read (linked) | §4 Panel dashboard |
| `src/backend/stageBuilder.js` | History uses `COMPLETE_FINAL_REVISION` | Seed |
| `src/__tests__/panel.test.js` (new) | 9 tests | — |

## 3. Action checks

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit (hat) | Notes |
|---|---|---|---|---|---|---|---|---|
| S5.5 / S7.5 | Private notes, AI summary | **Not built (R12)** | ✅ Notes readable by the author only: not the Panel Chair, not the Adviser, not students before the verdict; after release students yes, other panelists never. `viewAiSummary`: panel yes, students no | — | — | — | — | OQ#2, OQ#3 defaults |
| S5.7 | Sign FM-2004 after the proposal defense (Echo, G2) | Forms tab; "Verify the revisions and sign…" task | ✅ only after the Adviser signs | Form Signed; stage stays at Proposal Revision | **Instructor 1: "Revisions verified" email** ✅; I1's next step unblocks (if an I2 is assigned) | ✅ → Bravo | ✅ `SIGNATURE_APPLIED` | S5.8 remains Instructor 1's |
| S8.4 | Sign FM-2004 after the final defense (Bravo, G3) | Forms; step list shows him 5th | ✅ "Not your turn yet — waiting on Adviser" | **All signed → revision Completed → stage Clearance**; countdown cleared; Approval Sheet issued | Adviser: "Approval Sheet to sign" ✅. Students: "Stage: Final Requirements" ✅ | ✅ | ✅ `STAGE_COMPLETE_FINAL_REVISION`, Panel Member | Instructor 2 no longer clicks anything here |
| S9.3b | Sign the Approval Sheet (G3 at Clearance, T12) | Forms; "Approval Sheet to sign" task | ✅ after the Adviser; Chair and Members in any order | Panel lines signed | **PC: "Approval Sheet to endorse" email and a ready ENDORSE_TO_URO in the queue** ✅ | ✅ → Alpha | ✅ | — |

## 4. Negative tests

| Must not | UI | Guard |
|---|---|---|
| Record the verdict (T5) | ✅ "Only this project's Panel Chair can record the verdict." | ✅ `recordVerdict` rejected; absent from `allowedActions('Panel Member', *)` |
| See other panelists' notes (T4) | Not built (R12) | ✅ Author only; never between panelists, even after release |
| Sign before the Adviser verifies | ✅ Step list and Forms say "waiting on Adviser" | ✅ `signForm` rejected |
| See older manuscript versions (T15) | ✅ Only v2 is listed | ✅ The superseded version is not in the bundle; `viewDocumentHistory` denied. There is no per-document URL, so no pasted link can reach an older version |
| Adviser or reviewer actions; other projects | ✅ | ✅ Review decision and log signing denied; Echo cannot open G1; Bravo on G2 resolves to Instructor 1 only |

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T4 | **Pass** (guard; UI not built — R12) | Author-only visibility, including against the Panel Chair |
| T5 | **Pass** | Charlie cannot record G1's verdict |
| T15 | **Pass** | Echo sees Proposal Manuscript v2 only |
| T16 | **Pass** | G1 appears on Charlie's worklist while he is on the panel and disappears when the PC removes him |

## 6. Config flags used

| Flag | Value | Effect |
|---|---|---|
| `AI_SUMMARY_AUDIENCE` | Adviser + Panel (OQ#2) | Panel may read the summary (guard only) |
| `PANEL_NOTES_RELEASE` | `students-on-verdict` (OQ#3) | Released to students, never between panelists (guard only) |
| `SAME_PANEL_BOTH_DEFENSES` | true (NEW-6, decided) | The proposal panel carries over to the final defense (tested) |

## 7. Open items hit

- **OQ#2 / OQ#3** — Defaults in place, guard-tested (R12).
- **NEW-6** — The same panel carries over (decided); the PC can change it at Final Defense Endorsement.
- **Behaviour change (aligns with WORKFLOWS):** Final Revision → Clearance now happens on the last FM-2004 signature (S8.4). Instructor 2's role at Final Revision is S8.5 (confirm post-defense course requirements), which is not a gate. **Prompt 9 (Instructor 2) should build and check S8.5.**
- **NEW-39 (new):** WORKFLOWS names no email for S5.7 → S5.8. Instructor 1 is now told "Revisions verified" when FM-2004 is fully signed after the proposal defense (inferred from "each next actor").
- **R10:** `stages.js` (final-revision gate), `caac.js` (`revision.verify`), `actions.js` (`signForm`), the stage builder, Dashboard. All earlier tests pass. Prompt 9 is affected (see above).

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181 and choose Dev tools → **Reset to seed**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Log in as **AD Echo** → **Panel**: G2 with the proposal defense schedule and "Latest manuscript: Proposal Manuscript v2". G2 → Documents lists v2 only ("Panel members see the current version…").
3. Switch to **Prof. Bravo** → open G3 → Next step: the FM-2004 sequence (Chair ✓, the group now, Adviser, then Bravo 5th). Forms: "Not your turn yet — waiting on Adviser".
4. As **Quebec Student** → G3 → Documents → upload a Revised Manuscript (PDF). As **Dean Delta** → approve it → Forms → **Sign as Adviser**.
5. As **Prof. Bravo** → Panel section: "Verify the revisions and sign FM-AAC-SOC-2004" → Forms → **Sign as Panel Member**. G3 moves to **Final Requirements** at once. Bravo stays on the page, because the panel still signs the Approval Sheet there.
6. Dev tools → Outbox: "Approval Sheet to sign" to Dean Delta and "Stage: Final Requirements" to the group.
7. Dev tools → **Load scenario T12** → as **Dean Delta**, sign the Approval Sheet → as **Prof. Bravo**, sign → as **Prof. Foxtrot**, sign. The outbox has "Approval Sheet to endorse" to Prof. Alpha, and Alpha's **Approval Sheets to endorse** queue shows G3 ready.
8. Dev tools → **Load scenario T16** → as **Prof. Charlie**, G1 is under Panel. As **Prof. Alpha**, unassign Charlie. As **Charlie**, G1 is gone.

## 9. §9 items found

None.

## 10. Impeccable audit (changed screen: Panel section)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | The defense and manuscript facts are a `dl`; the manuscript link names the version |
| 2 | Performance | 4 | `viewBundle` once per panel row |
| 3 | Responsive | 3 | The facts stack under the title at phone width |
| 4 | Theming | 3 | Existing tokens only |
| 5 | Implementation integrity | 4 | Detector: 0 findings |
| **Total** | | **17/20** | Good |
