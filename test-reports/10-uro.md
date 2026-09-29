# 10 — University Research Office (Prompt 10)

**Date:** 2026-09-29 · **Persona:** URO Uniform · **Backend:** local (port 5181)

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **209 / 209 pass**: 15 in `uro.test.js`, 2 in `clock.test.js`. 70 full runs with no failure after the clock fix (§2 follow-up) |
| Production build | Builds. No dev-tools strings in `dist/` |
| Browser walk-through | URO queue → return the Editor's Certificate → student notice, remarks and upload of v2 → URO emailed → clear → AD Echo's "Projects for final approval". 375 px: no page overflow |
| Impeccable audit | Detector: 0 findings. Manual: no P0/P1 (§10) |
| Action checks | 3 / 3 pass (§3) |
| Negative tests | 4 / 4 pass, UI and guard (§4) |
| §7 scenarios | T11 and T12 pass |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/domain/flags.js`, `caac.js`, `guard.js` | **Return path built** (`URO_RETURN_PATH` was "not wired"). New capability `uro.return` (URO, at URO Verification only) and guard action `uroReturn` with `uroReturnBlocker()`: certificates only (NEW-45, flag `URO_RETURNABLE`), at least one chosen, none still pending | S9.4, NEW-7 |
| `src/services/actions.js` `returnToGroup` (new) | Remarks required. The returned versions become **For Revision** (never overwritten). An entry is appended to `project.uroReturns` (who, when, remarks, types, document ids). The project stays at URO Verification. Audit `URO_RETURNED` (before → after, hat URO) + history; email "Returned by the URO" → group + Adviser | S9.4, R6, R8 |
| `src/domain/caac.js` `allowedDocTypes(stage, b)` | At URO Verification the group may upload **only the certificates still outstanding** from the last return (as vN+1; the old version becomes Superseded). Nothing else is accepted there | S9.4, R8 |
| `src/services/actions.js` `submitDocument` | When the last returned certificate is replaced, the URO gets a "Certificates resubmitted" email, and the project is back in "Clearances to verify" | S9.4 |
| `src/domain/stages.js` | URO gate: blocked while a return is outstanding ("Returned to the group on … Waiting for a new …"); `verifies` lists the three items for the queue. `uroReturnOutstanding()` compares document ids, not timestamps: a test showed an upload in the same millisecond as the return was missed | S9.4 |
| `src/services/actions.js` `runGate` | On URO_VERIFY, the verified certificates are marked **Approved**. The stage email carries §3's event, **"Fully cleared project endorsed"** (to the Dean, AD, group and Adviser) | S9.4 |
| `src/components/panels/UroReview.jsx` (new), `OverviewPanel.jsx` | Overview → **"Clearance verification"**: the current version, submitter, date and status of each certificate and the manuscript; "Open the documents"; the return form (checkboxes for the two certificates and required remarks); the history of returns, which the group and Adviser also see | §4 URO, S9.4 |
| `src/pages/Dashboard.jsx` | "Clearances to verify" lists what to check per project (Editor's Certificate vN · Plagiarism Clearance Certificate vN · Final Manuscript vN). The student's group desk shows the URO's remarks while a return is open, and the worklist shows "… v1 was returned — upload a revised version" (urgent) | §4 URO, §4 Student |
| `src/components/panels/DocumentsPanel.jsx` | A returned certificate version shows "Returned by the URO" with the remarks. The upload form offers only the returned type(s) | S9.4 |
| `src/components/panels/Capstone2Checks.jsx` | Instructor 2's checks (Prompt 9) no longer show to an office that opens the project only for its own step (URO, Dean, AD): only to the group and the project's faculty | R3 (need-to-know) |
| `src/backend/seed.js`, `stageBuilder.js`, `actions.js` `createProject` | New project field `uroReturns: []`. Setting a stage clears it | Dev tools |
| `src/__tests__/uro.test.js` (new) | 10 tests. A mutation check (making returns never outstanding) fails 2 of them as expected | — |

### Follow-up 2026-09-30: the four open concerns

| # | Concern | Fix |
|---|---|---|
| 1 | Intermittent test failure (NEW-47) | **Fixed at the source.** `src/backend/clock.js` `nowIso()` hands out strictly increasing timestamps. Every write now uses it: services, `core.js` audit/history/outbox, and both adapters. Checks like "revised after the verdict", "newest form" and "later defense" can no longer tie in the same millisecond. Proof: the old time-based URO check that flaked before passes 30/30 with the clock (the id-based check is kept anyway). `clock.test.js` added. **70 full-suite runs across these changes: 0 failures** |
| 2 | Manuscript problem at the URO (NEW-46) | **Built, flag `URO_MANUSCRIPT_RETURN = 'to-final-requirements'`.** The return form also offers the Final Manuscript, with a note saying what happens. Returning it: the manuscript version becomes For Revision; the Approval Sheet is **voided** (kept, with its signatures, as the record) and **reissued**; the project goes back to **Final Requirements** (audit `STAGE_URO_RETURN_MANUSCRIPT`, hat URO; email "Returned by the URO" → group, Adviser, PC). The Adviser cannot sign the new sheet until the group uploads a new Final Manuscript ("The URO returned it — waiting for the group’s new Final Manuscript"), then gets "Approval Sheet to sign". Adviser → panel → PC → URO → Dean/AD follows as usual; clearing marks the new manuscript Approved. A voided form can never be signed. `'off'` = certificates only |
| 3 | Team questions: does the URO sign the Approval Sheet; which URO emails | **Both are now switchable Mockup defaults** (the team still decides). `URO_SIGNS_APPROVAL_SHEET = true` (off = no URO line; the clearance is recorded in the audit trail and history, and the Dean/AD sign as usual — tested). `URO_EMAILS = { endorsedToUro, certificatesResubmitted }` (each tested off) |
| 4 | Reports to re-run: 05 Dean/AD, 02 Student | **Re-run 2026-09-30,** browser + tests. See the re-run notes at the end of each report. Both pass |

## 3. Action checks

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit (hat) | Notes |
|---|---|---|---|---|---|---|---|---|
| S9.4 | Queue "Clearances to verify" | ✅ G3 with the three items and versions | ✅ opens at URO Verification only | — | — | ✅ "Stage: URO Verification" → URO (on the PC endorsement) | — | §4 "certificates + manuscript" |
| S9.4 | Clear ("Verify certificates and sign") | ✅ Next step button | ✅ URO only; blocked while a return is open | URO line on the Approval Sheet signed; certificates Approved; → Final Approval | **AD Echo**: G3 opens and appears in "Projects for final approval" for the first time ✅. **Dean Delta** (also G3's Adviser): same queue ✅. **URO**: the project leaves the worklist ✅ | ✅ "Fully cleared project endorsed" → Dean, AD, group, Adviser | ✅ `STAGE_URO_VERIFY`, University Research Office | Double submit → one transition |
| S9.4 | Return to group with remarks | ✅ checkboxes + required remarks; the form hides while a return is open | ✅ certificates only; remarks required; not twice | Returned versions For Revision; `uroReturns` entry; stage unchanged | **Students:** notice with remarks, urgent task, only the returned type uploadable → v2, v1 Superseded ✅. **Adviser:** email, return history ✅. **URO:** gate blocked "Waiting for a new …" until replaced; then back in the queue with "Certificates resubmitted" ✅ | ✅ "Returned by the URO" → group + Adviser; "Certificates resubmitted" → URO | ✅ `URO_RETURNED`, University Research Office | NEW-45 |

## 4. Negative tests

| Must not | UI | Guard |
|---|---|---|
| See the project before the PC endorses (T12) | ✅ Not on the worklist; a pasted URL shows "not available" | ✅ `canView` false; `URO_VERIFY` and `uroReturn` rejected |
| Annotate or decide on the manuscript (R12) | ✅ No annotation or review tools | ✅ `annotate` and `reviewDocument` rejected, including forced calls; no `document.history` |
| Take any earlier workflow action | ✅ Only the URO step shows | ✅ At every stage `allowedActions(URO)` holds only view/read, `URO_VERIFY`, `uroReturn` (URO Verification only) and `signForm`. A forced `signForm` on the Approval Sheet is rejected: that line is signed through the gate |
| Return the manuscript, or return as anyone else | ✅ The form offers the two certificates only | ✅ Rejected for the Final Manuscript; Adviser, PC, student, Admin and Panel Chair are all rejected |

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T11 | **Pass** | At URO Verification, `FINAL_APPROVE` is rejected for Dean Delta and AD Echo (UI: no step for them). After the URO clears, both have it ready |
| T12 | **Pass** | At Final Requirements (certificates in, before the PC endorses) the URO sees nothing, and the guard rejects both URO actions |

## 6. Config flags used

| Flag | Value | Effect |
|---|---|---|
| `URO_REVIEW_LEVELS` | 1 (NEW-10) | One URO verify step |
| `URO_RETURN_PATH` | on (NEW-7) | The return path is available (now wired) |
| `URO_RETURNABLE` (new) | Editor's Certificate, Plagiarism Clearance Certificate (NEW-45) | Certificates the URO may return; the project stays with the URO |
| `URO_MANUSCRIPT_RETURN` (new) | `'to-final-requirements'` (NEW-46) | The manuscript may be returned too; back to Final Requirements, sheet reissued |
| `URO_SIGNS_APPROVAL_SHEET` (new) | true (Mockup default, for the team) | The URO's line 4 on the Approval Sheet |
| `URO_EMAILS` (new) | both on (Mockup default, for the team) | URO emailed on endorsement and on resubmission |

## 7. Open items hit

- **NEW-45 — decided 2026-09-29 (this session):** the URO returns certificates only. The project stays with the URO, and the Approval Sheet signatures stand.
- **NEW-46 — decided 2026-09-30:** a manuscript problem sends the project back to Final Requirements with a reissued Approval Sheet (flag `URO_MANUSCRIPT_RETURN`; §2 follow-up).
- **NEW-10:** "First and Second Level" review is still undefined; one step is built.
- **NEW-7:** the URO return path is built. The Dean/AD return path for adviser assignments is still not built (see 05).
- **Does the URO sign the Approval Sheet itself? (not explicit):** still for the team. Now the Mockup default flag `URO_SIGNS_APPROVAL_SHEET` (true: line 4, signed by running "Verify certificates and sign"; both settings tested).
- **URO emails (not stated in the manuscript)** — still for the team; switchable with `URO_EMAILS`. What the mockup does by default:
  - URO receives "Stage: URO Verification" when the PC endorses.
  - URO receives "Certificates resubmitted" after a return.
  - The group and Adviser receive "Returned by the URO".
  - The Dean, AD, group and Adviser receive "Fully cleared project endorsed" (§3's event name) on clearing.
- **NEW-47 — fixed 2026-09-30:** same-millisecond timestamp races. Every timestamp now comes from the monotonic `nowIso()` (§2 follow-up).
- **R10 — shared code touched:** `allowedDocTypes` (now takes the bundle), `submitDocument`, `runGate` (URO_VERIFY email event and certificate status), the Dashboard queue, `Capstone2Checks` visibility. All earlier tests pass. Worth re-running: **05 Dean/AD** (email event name is now "Fully cleared project endorsed", not "Stage: Final Approval") and **02 Student** (return path at URO Verification).

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181 and choose Dev tools → **Load scenario T12**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Log in as **URO Uniform**. "Clearances to verify" is empty, and /projects/p_g3 says "not available" (T12).
3. Dev tools → **Load scenario T11** (G3 at URO Verification). As **URO Uniform**: "Clearances to verify" lists G3 with Editor's Certificate v1, Plagiarism Clearance Certificate v1 and Final Manuscript v1.
4. Open G3 → Overview → **Clearance verification**. Tick **Editor's Certificate**, write the remarks → **Return to the group**. The return shows under "Returned to the group" as "Waiting for a new version"; the Next step says "Returned to the group on … Waiting for a new Editor's Certificate."
5. Switch to **Quebec Student** → dashboard: the URO's notice with the remarks, and "Editor's Certificate v1 was returned — upload a revised version". Documents: v1 shows "Returned by the URO"; the upload form offers only Editor's Certificate → attach a PDF → **Submit version 2**.
6. Dev tools → Outbox: "Returned by the URO" (group + Dean Delta as Adviser) and "Certificates resubmitted" (URO).
7. As **URO Uniform** → G3 → **Verify certificates and sign**. The workspace returns to the worklist; G3 has left it.
8. Switch to **AD Echo**: "Projects for final approval" lists G3 (T11: before step 7 Echo could not open it). The Outbox has "Fully cleared project endorsed".
9. NEW-46: Dev tools → **Load scenario T11** → as **URO Uniform**, tick **Final Manuscript**. The note explains the consequence. Write remarks → **Return to the group**; you are sent back to the worklist ("moved to Final Requirements"). As **Dean Delta** → G3 → Forms: the old Approval Sheet is **Void** with its signatures, the new one is circulating, and it says "The URO returned it — waiting for the group’s new Final Manuscript". As **Quebec Student**, upload a Final Manuscript (v2): Delta gets "Approval Sheet to sign", and the chain continues as usual.

## 9. §9 items found

None.

## 10. Impeccable audit (changed screens: Clearance verification, URO queue list, student notice, returned-version remarks)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Checkboxes in a `fieldset` with a `legend`; the remarks field is labelled and required; the student notice uses `role="status"`. The disabled "Return" button shows its reason as text |
| 2 | Performance | 4 | — |
| 3 | Responsive | 3 | 375 px: no page overflow; the verification table scrolls inside `.table-scroll` |
| 4 | Theming | 3 | Existing tokens and classes only (`note`, `entry`, `Badge`, `table-scroll`) |
| 5 | Implementation integrity | 4 | Detector: 0 findings |
| **Total** | | **17/20** | Good |
