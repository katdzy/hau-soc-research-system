# 08 — Panel Chair (Prompt 8)

**Date:** 2026-09-29 · **Persona:** Prof. Alpha (Panel Chair of G2; also Adviser of G1 and Program Chair/Coordinator) · **Backend:** local (port 5181)

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **174 / 174 pass**. 15 in `chair.test.js` (after the three decisions below); 2 older tests now pass the required remarks |
| Production build | Builds. No dev-tools strings in `dist/` |
| Browser walk-through | G2 → Defense: "Record verdict" disabled until remarks are written; the label switches to "Why a re-defense is needed" for Re-defense. Minor recorded → "Proposal Defense · Revisions", "Revision deadline: 7d left", required revisions shown in the record |
| Impeccable audit | Detector: 0 findings. Manual: no P0/P1 (§10) |
| Action checks | 5 / 5 pass (§3) |
| Negative tests | 4 / 4 pass, UI and guard (§4) |
| §7 scenarios | T2, T5 (inverse) and T18 pass |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/services/actions.js` | **Revision requirements are required text** for every verdict. Before, they were optional: a Minor or Major verdict could be recorded with an empty FM-2004. The error says "Write the required revisions." or, for a re-defense, "Say why a re-defense is needed." | S5.6, S7.6 |
| `src/components/panels/DefensePanel.jsx` | Required field, labelled per verdict ("Required revisions" / "Why a re-defense is needed"), with the button disabled until filled. (Later in this session the future-date note became a block, and a correction form was added — see below.) | S5.6, S7.6 |
| `src/__tests__/chair.test.js` (new) | 12 tests | — |

Everything else the prompt checks already worked: the values, the countdowns, one verdict per defense, note release, and emails.

### Follow-up in this session: NEW-40, NEW-41 and NEW-42 decided and built

| Decision | Flag | Built |
|---|---|---|
| **NEW-40:** the verdict can be recorded only after the defense's scheduled date and time | `VERDICT_AFTER_SCHEDULED_TIME = true` | `stages.js` `defenseNotHeld()` blocks the verdict gates (the worklist shows the reason); `recordVerdict` rejects; the Defense tab shows "The defense is scheduled for … Record the verdict after it is held." instead of the form |
| **NEW-41:** Re-defense → required changes and a countdown; the Adviser's approval of the revised manuscript returns the project to scheduling | `REDEFENSE_REVISION_DAYS = 'Major'` | Every verdict now leads to the revision stage. A Re-defense gets class "Re-defense" with the major-revision countdown, an FM-2004 record with the Chair's line only (no panel sign-off), and a new gate `RETURN_TO_PROPOSAL_DEFENSE` / `RETURN_TO_FINAL_DEFENSE` (handled by the Adviser's approval in the Documents tab) → Proposal / Final Defense Scheduling. During a re-defense, Instructor 1's "Move to Capstone 2" and the panel's Clearance sign-off do not apply (`applies`), including forced calls |
| **NEW-42:** the Panel Chair may correct a verdict once, within 24 hours, before anyone acts on it | `VERDICT_CORRECTION_HOURS = 24` | New capability `verdict.correct` (Panel Chair at the revision stages), guard action `correctVerdict` with `verdictCorrectionBlocker()` (window, once only, no revised manuscript, no other FM-2004 signature, no later defense). `correctVerdict` updates the defense, the countdown (still from the original recording), FM-2004 and its lines; audits `VERDICT_CORRECTED` before → after with the reason; emails the group and the Adviser. The Defense tab has a "Correct the verdict" form while it is allowed, and the record shows "Corrected … was “…”: reason" |

## 3. Action checks

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit (hat) | Notes |
|---|---|---|---|---|---|---|---|---|
| S5.6 | Minor (G2) | ✅ | ✅ Panel Chair only; remarks required | → Proposal Defense · Revisions (NEW-3 sub-status); countdown **7 days**; FM-2004 issued (Chair signed; Adviser, Member open) | **Students:** verdict, requirements, "Revisions due in 7 day(s)", "Upload the revised manuscript" ✅. **Adviser** ✅. **Instructor 1:** stage email ✅. **Panel:** status visible ✅ | ✅ "Revision requested" → group + Adviser | ✅ `VERDICT_RECORDED`, Panel Chair | — |
| S5.6 | Major | ✅ | ✅ | Countdown **14 days** | as above | ✅ | ✅ | From the Admin setting (flag `REVISION_DAYS` start value) |
| S5.6 / S7.7 | Re-defense | ✅ label changes | ✅ | → revision stage with required changes and a major-length countdown; the Adviser's approval → Proposal Defense Scheduling | PC: "Proposal defenses to schedule" once approved ✅ | ✅ "Re-defense" → group + Adviser | ✅ | NEW-41 decided |
| S7.6 | Final verdict, Minor (G2 at Final Defense) | ✅ | ✅ | → Final Revision | **Instructor 2 (Foxtrot), panel, Adviser:** verdict visible ✅ | ✅ | ✅ | — |
| S7.7 | Final re-defense | ✅ | ✅ | → Final Revision (changes) → the Adviser's approval → Final Defense Scheduling | **Instructor 2 can schedule again** ✅ | ✅ | ✅ | S7.7 → S7.3 |

One verdict per defense: a double submit (even with two different verdicts) records exactly one, and a later attempt is refused by the guard because the stage has moved on.

## 4. Negative tests

| Must not | UI | Guard |
|---|---|---|
| Adviser actions on G2 (T2) | ✅ The Panel section shows only the verdict step | ✅ Review decision denied; projectRoles `[Panel Chair]` |
| A Panel Member records the verdict (T5, inverse) | ✅ Echo sees "Only this project's Panel Chair can record the verdict." | ✅ Echo rejected; Alpha allowed with hat Panel Chair |
| Change a recorded verdict outside the NEW-42 rule | ✅ The correction form shows only while allowed | ✅ Refused for others, after 24 h, after a revised upload, or a second time; a second `recordVerdict` is refused |
| See another panelist's private note (R12) | Not built | ✅ The Chair cannot read Echo's note, even after release; Echo cannot read the Chair's |

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T2 | **Pass** | Verdict as Panel Chair; no adviser action |
| T5 | **Pass** (inverse) | Chair can, Member cannot |
| T18 | **Pass** | A Minor verdict's countdown, fast-forwarded past 7 days, flips to Overdue with the "Overdue Revision" email to the group and the Adviser |

**Notes on verdict (R12, guard only):** Before the verdict, Echo's private note is readable by Echo alone. After it, the students can read it (`viewPrivatePanelNotes` becomes allowed for them), and the Chair, the Adviser and other panelists still cannot.

## 6. Config flags used

| Flag | Value | Effect |
|---|---|---|
| `VERDICT_VALUES` | Minor / Major / Re-defense (OQ#10) | The only values accepted |
| `REVISION_DAYS` + Admin setting | 7 / 14 | Countdown per verdict |
| `PANEL_NOTES_RELEASE` | `students-on-verdict` (OQ#3) | Release on verdict, to students only |
| `PROPOSAL_REVISION` | `sub-status` (NEW-3) | Shown as "Proposal Defense · Revisions" |

## 7. Open items hit

- **OQ#10** — Mockup values in place (Passed with Minor / Major Revisions, Re-defense).
- **OQ#3** — Release on verdict to students (guard-tested).
- **NEW-3** — Proposal revision is a sub-status of Proposal Defense.
- **NEW-40 — decided:** the verdict waits until the scheduled time has passed (built, see §2).
- **NEW-41 — decided:** a Re-defense carries required changes and a countdown; the Adviser's approval returns it to scheduling (built, see §2).
- **NEW-42 — decided:** the Chair corrects once, within 24 hours, before anyone acts (built, see §2).
- **R10:** Only `recordVerdict`'s validation and the Defense tab changed. All earlier tests pass (two now pass remarks).

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181 and choose Dev tools → **Reset to seed**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Log in as **Prof. Alpha** → Panel section: G2 "Record the official verdict — ready".
3. G2 → **Defense** tab. "Record verdict" is disabled. Choose **Re-defense**: the field becomes "Why a re-defense is needed (required)". Choose **Passed with Minor Revisions**, type the required revisions → **Record verdict**.
4. The header shows "Proposal Defense · Revisions" and "Revision deadline: 7d left"; the record shows the required revisions. Forms: FM-AAC-SOC-2004 with Panel Chair signed, Adviser and Panel Member pending.
5. Switch to **November Student** → dashboard: latest verdict with the requirements, "Upload the revised manuscript for the Adviser", "Revisions due in 7 day(s)".
6. Dev tools → Outbox: "Revision requested" to the group and Prof. Charlie.
7. Switch to **AD Echo** → G2 → Defense: no verdict form.
8. Dev tools → **Reset to seed** → as **Prof. Alpha**, record **Re-defense** with a reason → G2 is at Proposal Defense Scheduling, and Alpha's PC queue "Proposal defenses to schedule" lists it.
9. Dev tools → **Load scenario T18** (G3's Minor-verdict countdown already expired) → as **Quebec Student**: Overdue flag; the outbox has "Overdue Revision" to the group and the Adviser. The fast-forward for G2's own countdown is in `chair.test.js`.

## 9. §9 items found

None.

## 10. Impeccable audit (changed screen: verdict form)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Radio group in a `fieldset` with a `legend`; the textarea is labelled; the future-date note uses `role="note"` |
| 2 | Performance | 4 | — |
| 3 | Responsive | 3 | Single column |
| 4 | Theming | 3 | Existing tokens only |
| 5 | Implementation integrity | 4 | Detector: 0 findings |
| **Total** | | **17/20** | Good |
