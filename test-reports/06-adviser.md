# 06 — Adviser (Prompt 6)

**Date:** 2026-09-29 · **Personas:** Prof. Alpha (Adviser of G1), Prof. Charlie (G2), Dean Delta (G3) · **Backend:** local (port 5181)

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **150 / 150 pass**. 11 are new in `adviser.test.js`; one student test updated for the new task label |
| Production build | Builds. No dev-tools strings in `dist/` |
| Browser walk-through | Dean Delta's **Advising** section: counts for drafts, logs, revisions and forms; G3 correctly shows nothing due (see the FM-2004 fix). No console errors |
| Impeccable audit | Detector: 0 findings. Manual: no P0/P1 (§10) |
| Action checks | 7 / 7 pass (§3) |
| Negative tests | 6 / 6 pass, UI and guard (§4) |
| §7 scenarios | T1 (log signing), T4 (guard), T8 and T17 pass |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/domain/forms.js` | **Bug: the Adviser could verify final revisions without any.** At Final Revision the FM-2004 check accepted *any* approved revised manuscript, including the one from the proposal defense, so Dean Delta was offered "FM-AAC-SOC-2004 awaiting your signature" before the group had revised anything. The check now requires a revised manuscript submitted after this form's verdict, and approved | S8.3, S5.7 |
| `src/domain/forms.js` | The Adviser signs the Approval Sheet only after both certificates are uploaded (S9.3a precondition "S9.1–S9.2 (inferred)"). The Next-step list already showed that order; now the guard enforces it | S9.3a |
| `src/services/worklist.js` | Adviser tasks say what they are and carry a `kind`: drafts to review, **revised manuscript to verify against the panel's required revisions**, logs to approve and sign, "Verify the revisions and sign FM-AAC-SOC-2004", "Approval Sheet to sign" | §4 Adviser dashboard |
| `src/pages/Dashboard.jsx` | The **Advising** section opens with the four §4 counts: Drafts to review · Logs to sign · Revisions to verify · Forms to sign (highlighted when non-zero). The program summary hides long program names at phone width (P3 from Prompt 4) | §4 |
| `src/styles.css` | `.hat-counts`, `.prog-long` — existing tokens | — |
| `src/__tests__/adviser.test.js` (new) | 11 tests | — |

## 3. Action checks

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit (hat) | Notes |
|---|---|---|---|---|---|---|---|---|
| S4.2 / S6.4 | Return a draft (G1) | Review form, remarks required | ✅ return without remarks rejected | For Revision | Students: "vN was returned — upload a revised version" ✅ | ✅ Revision requested → group | ✅ `REVIEW_DECISION`, Adviser | Annotating is guard-only (R12) |
| — | Student uploads vN+1 | — | ✅ | v(N+1) Submitted; vN Superseded, **unchanged otherwise**, still readable by Adviser and group | Adviser: "submission awaiting your decision" ✅ | ✅ → I1 + Adviser | ✅ | File name of each version preserved |
| S4.2 | Approve | ✅ | ✅ Double-click records once (T17) | Approved | I1: approval for defense unblocked | ✅ Approved → group | ✅ | — |
| S6.2 | Return / approve + e-sign a weekly log (T1) | Weekly logs tab | ✅ remarks required to return; I2 cannot sign (OQ#7) | Returned / Approved + `signedBy` | Students: log status and "resubmit" task ✅. I2: sees the status ✅ | ✅ → group | ✅ `WEEKLY_LOG_SIGNED` / `_RETURNED`, Adviser | — |
| S6.7 | FM-2005 (G1) | Next step, with blockers in order | ✅ blocked: 2 signed logs → Final Manuscript → I2 milestones | Form signed; → Final Defense Endorsement | **PC: "Recommendations to endorse"** ✅ | ✅ Stage email → PC (except the actor), group | ✅ `FORM_SUBMITTED`, Adviser | Readiness check: see §7 |
| S8.3 | Verify revisions (G3) | "Revised manuscript to verify…" task, then Forms | ✅ **blocked until a revised manuscript for this verdict is uploaded and approved** | FM-2004 Adviser line signed | **Panel (Bravo): "Verify the revisions and sign FM-AAC-SOC-2004"** ✅ | ✅ "FM-AAC-SOC-2004 to sign" → Bravo | ✅ `SIGNATURE_APPLIED`, Adviser | — |
| S9.3a | Sign the Approval Sheet (G3 at Clearance) | "Approval Sheet to sign" task | ✅ blocked until both certificates are uploaded | Line 1 signed | **Panel Chair + Member: "Approval Sheet to sign"** ✅ | ✅ → Foxtrot, Bravo | ✅ Adviser | — |

## 4. Negative tests

| Must not | UI | Guard |
|---|---|---|
| See panelists' private notes (T4) | Not built (R12) | ✅ `canViewAnnotation` false; `viewBundle` returns none; `viewPrivatePanelNotes` denied |
| Record a verdict | ✅ The verdict form shows only for the Panel Chair | ✅ Charlie on G2 rejected |
| Sign the Approval Sheet before revisions are complete | ✅ The sheet does not exist until final revisions close | ✅ Not issued at Final Revision; certificates required at Clearance |
| Act on another adviser's group | ✅ | ✅ Alpha's review on G2 rejected (she is its Panel Chair); Delta cannot open G1 |
| Edit or delete student files | ✅ No control | ✅ No such service; every decision changes status only |
| Annotate outside the review stages (R12) | Not built | ✅ Charlie cannot annotate G2 at Proposal Defense |

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T1 | **Pass** (log signing; annotation guard-only) | Alpha approves and signs G1's log with hat Adviser |
| T4 | **Pass** (guard) | The Adviser never sees a panelist's private note |
| T8 | **Pass** | Delta: every G3 document and version; projectRoles `[Adviser]` |
| T17 | **Pass** | A double-clicked log approval (existing test) and a double-clicked review decision both record once |

## 6. Config flags used

| Flag | Value | Effect |
|---|---|---|
| `WEEKLY_LOG_SIGNER` | Adviser (OQ#7) | Only the Adviser signs logs; Instructor 2 follows progress |
| `BLOCK_ADVISER_ON_PANEL` | true | The Adviser never holds a panel hat on the same group |

## 7. Open items hit

- **OQ#7** — The Adviser signs weekly logs (default). DFD 5.0's "Instructor 2 sign-offs" is kept to milestone confirmation.
- **NEW-9** — Logs start in Capstone 2 (unchanged).
- **NEW-37 (new — flag, not decided): the "readiness check with Instructor 2" before FM-2005 is not specified.** Current proxy: FM-2005 is blocked until Instructor 2 has confirmed the Capstone 2 milestones, at least 2 weekly logs are signed, and a Final Manuscript exists. Open questions: is milestone confirmation *the* readiness check, or a separate joint sign-off? Should Instructor 2 co-sign FM-2005? Is 2 the right minimum number of logs?
- **NEW-38 (new, inferred):** The Adviser signs the Approval Sheet only after both certificates are uploaded (S9.3a lists S9.1–S9.2 as an inferred precondition). Confirm.
- **R10:** `forms.js` (`canSign`) and `worklist.js` task labels changed. Panel signing (Prompt 7) uses the same `canSign`: the panel's FM-2004 lines still open only after the Adviser signs. All earlier tests pass.

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181 and choose Dev tools → **Reset to seed**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Log in as **Dean Delta** → **Advising**: G3 with "Nothing due from you as Adviser", and counts all 0. G3 → Forms: FM-2004 says "The group has not uploaded its revised manuscript for this verdict yet."
3. Switch to **Quebec Student** → G3 → Documents → Revised Manuscript → upload a PDF.
4. As **Dean Delta** → "Revisions to verify 1" → open G3 → Documents → approve the revised manuscript → Forms → **Sign as Adviser**.
5. Switch to **Prof. Bravo** → Panel section: "Verify the revisions and sign FM-AAC-SOC-2004". The outbox has "FM-AAC-SOC-2004 to sign" to Bravo.
6. Dev tools → **Load scenario T1** → as **Prof. Alpha** → G1 → Weekly logs → **Return with remarks** (disabled until remarks are typed) or **Approve and sign**. As **Kilo**: the log status and the "resubmit" task.
7. Continue T1: approve the log; as **Kilo**, upload a Final Manuscript; as **Prof. Foxtrot** (G1's Instructor 2), Weekly logs → **Confirm milestones**; as **Prof. Alpha**, Overview → **Submit FM-AAC-SOC-2005**. G1 moves to Final Defense Endorsement and appears in Alpha's PC queue "Recommendations to endorse".
8. Dev tools → set **G3 → Final Requirements** (Clearance) → as **Dean Delta**, Forms: "Waiting for the group to upload: Editor's Certificate, Plagiarism Clearance Certificate". As **Quebec**, upload both; as **Delta**, sign the Approval Sheet. The outbox has "Approval Sheet to sign" to Foxtrot and Bravo.

## 9. §9 items found

None.

## 10. Impeccable audit (changed screens: Advising section, program summary)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | The counts are a `dl` (term + value); highlighted counts also change text colour and weight, not colour alone |
| 2 | Performance | 4 | — |
| 3 | Responsive | 3 | The counts wrap; long program names are hidden under 860 px (code + hover title remain) |
| 4 | Theming | 3 | Existing tokens only |
| 5 | Implementation integrity | 4 | Detector: 0 findings |
| **Total** | | **17/20** | Good |
