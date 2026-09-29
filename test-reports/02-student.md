# 02 — Student (Prompt 2)

**Date:** 2026-09-29 · **Personas:** Kilo, Lima (G1), November (G2), Quebec (G3), Tango (G4), Whiskey (no group) · **Backend:** local (port 5181)
**Store key bumped to `hausoc.db.v4`**: Topic Proposal versions now carry five `topics`, and reviews carry `approvedTopic`. A browser still holding v3 data loads the new seed on its own.

## 1. Summary

| Check | Result |
|---|---|
| Unit tests (`npm test`) | **85 / 85 pass**. 25 are new in `student.test.js`. The 60 earlier tests still pass; one of them (T13 in `services.test.js`) was updated to the five-topic shape |
| Production build | Builds. No dev-tools strings in `dist/` |
| Browser walk-through (§8 script) | Five-topic upload with its validation (missing, duplicate, non-PDF), topic approval, concept paper unlocking, S5.3 video link (invalid, then valid) and the complete manuscript, panel sees latest only, G3 countdown, T18 overdue, pasted URL denied, T14, 375 px width. **No console errors** |
| Impeccable audit | Detector: 0 findings. Manual: no P0/P1 (§10) |
| Action checks | 14 / 14 pass (§3). S6.6 is a placeholder (OQ#12) |
| Negative tests | 8 / 8 pass, UI and guard (§4) |
| §7 scenarios | T4 (student side), T13, T14 and T18 pass. The annotation UI part of T4 is **Not built** (R12) |

## 2. Fixes made

| File | Change | Serves |
|---|---|---|
| `src/domain/caac.js` | `allowedDocTypes` now follows §3. **S5.3 / S7.4** were impossible before: `PROPOSAL_DEFENSE` accepts the complete Proposal Manuscript plus the video link, and `FINAL_DEFENSE` accepts the Final Manuscript plus the link. The video link was removed from Implementation, Final Defense Endorsement and Final Defense Scheduling, because its precondition is "Scheduled". New `uploadBlocker(b, type)`: topics close once one is approved, and the concept paper waits for an approved topic | S3.1, S3.5, S5.3, S7.4 |
| `src/domain/constants.js` | `TOPIC_COUNT = 5`, `isPdfFile`, `isVideoLink` (http/https with a real host), `topicsProblem`. The form and the service share them | Item 2 validation |
| `src/services/actions.js` · `submitDocument` | Guard-side validation: the PDF file is required and must be PDF (checks name and MIME type), five distinct topics, a valid video URL. **Version numbering moved inside the transaction** and the dedupe key is now per member: two members uploading at once get consecutive versions, and a double-click still records once. The Topic Proposal stores its `topics` | S3.1, T13, item 8, R7 |
| `src/services/actions.js` · `submitReview`, `REGISTER_TOPIC` | Approving a Topic Proposal requires choosing **one** of its five topics (`approvedTopic` on the review). Registration uses that topic as the title | S3.3, S3.4 |
| `src/services/actions.js` · `transition`, `APPROVE_ADVISER` | New **"Adviser appointed"** email to the group and the Adviser, naming the Adviser. It replaces the generic stage email for that step | S2.2, §4 Student emails |
| `src/services/actions.js` + `core.js` + `guard.js` | A private panel note's workflow-history entry is marked `privateTo` its author, and `viewBundle` hides it from everyone else. **Before, the group, the Adviser and the other panelists could see from History that a note existed** | T4, R3 |
| `src/domain/guard.js` | `assignmentVisibleToGroup`: the group sees the Adviser only after S2.2 approval, and the panel only after the PC confirms it. Before, a proposed Adviser showed on the students' Overview during Adviser Assignment and Approval | S2.2, S5.1 |
| `src/services/worklist.js` | `groupDue(b, ctx)`: what the group owes at each stage. It covers each expected upload (defense uploads must come after the schedule, revisions after the verdict), returned versions, the weekly log, and the countdown. This replaces the generic "N returned" count | §4 Student dashboard |
| `src/pages/Dashboard.jsx` | **Student dashboard** (`GroupDesk`): stage (§3.0 name + sub-stage), what's waiting on the group (each item links to the right tab), and who holds a pending submission when nothing is due. Also the countdown and **Overdue** flag, the defense schedule, the latest verdict with remarks, the group's faculty, and the five most recent notifications *(later removed: notifications are email only, by team decision)*. The T14 empty state is unchanged | §4 Student, item 1 |
| `src/pages/ProjectWorkspace.jsx` | `?tab=` opens a tab directly (used by the worklist links) | Item 1 |
| `src/components/panels/DocumentsPanel.jsx` | Versions are **grouped by document type**, newest first, with a version count (T13 history). The upload form has five topic fields for the Topic Proposal, an optional label, and client-side checks matching the service. Blocked types are shown with their reason. The file input clears after a submission. The Topic Proposal detail lists the five topics and marks the approved one. The review form asks the reviewer which topic they approve | S3.1, S3.3, T13, item 2 |
| `src/domain/stages.js` | Topic Proposal blurb: "five" topics, not "up to five" | S3.1 |
| `src/backend/seed.js`, `stageBuilder.js`, `localAdapter.js` | Five-topic Topic Proposals with an `approvedTopic` review. Store key → `v4` | Seed |
| `src/styles.css` | `.group-desk`, `.version-group`, `.topic-list`, built on existing tokens only | — |
| `src/__tests__/student.test.js` (new) | 25 tests (§3–§5 below) | — |
| `CLAUDE.md` | Store key → v4 | Docs |

## 3. Action checks

"UI" means checked in the browser this session. "Guard" means `student.test.js`.

| Step | Action | UI | Guard | State change | Reflects on (each role checked) | Email | Audit | Notes |
|---|---|---|---|---|---|---|---|---|
| S3.1 | Five topics + PDF (Kilo, G1) | ✅ | ✅ 4 topics, duplicate (case-insensitive), no file, `.docx` and a PDF name with a PNG MIME type all rejected | Topic Proposal v2, v1 → Superseded | Bravo (I1): "1 submission awaiting your decision" ✅. Alpha (Adviser): notified ✅ | ✅ "Topic Proposal submitted" → bravo, alpha | ✅ hat Student, v1 → v2 | Also written to history |
| S3.3 | (I1 approves one topic) | ✅ topic picker | ✅ approval without a topic rejected | review `approvedTopic` | Lima: "Approved topic: Canteen Pre-Order…" ✅ | ✅ Approved → group | ✅ | Instructor 1's step; changed so that S3.1 can work |
| S3.5 | Concept paper (Lima) | ✅ blocked with a reason until a topic is approved, then open | ✅ | Concept Paper v1 | I1 + Adviser ✅ | ✅ → bravo, alpha | ✅ | **Interim order, see NEW-24** |
| S4.1 | Proposal drafts | — | ✅ | Proposal Manuscript vN | Adviser worklist: "awaiting your decision" ✅; I1 notified | ✅ → I1 + Adviser | ✅ | — |
| S5.3 | Video link + complete manuscript (November, G2) | ✅ `youtube.com/…` rejected, `https://youtu.be/…` accepted; manuscript v3 | ✅ `https://x` and `javascript:` rejected; nothing accepted at Scheduling | Link v1, Proposal Manuscript v3 | **Echo (Panel) sees v3 only** ✅; student sees v1–v3 | ✅ → alpha (Chair), echo; **not** the Adviser | ✅ | AI summary: see R12 |
| S5.7 | Revised manuscript at Proposal Revision | — | ✅ | Revised vN | Adviser | ✅ → Adviser only | ✅ | — |
| S6.1 | Weekly log | — | ✅ empty text rejected; a second log while one is pending rejected | Week N Submitted | Adviser: "Logs to sign" | ✅ "Weekly log submitted" → Adviser | ✅ | NEW-9: Capstone 2 only |
| S6.3 | Manuscript drafts (Implementation) | — | ✅ | Final Manuscript vN | Adviser (I2 not notified — no annotate/decide) | ✅ → Adviser | ✅ | — |
| S6.6 | Deployment information | — | ✅ PDF | Deployment Information vN | Adviser, I2 (can read) | ✅ → Adviser | ✅ | **Placeholder** (OQ#12) |
| S6.8 | Export FM-2003 logs | Export button when logs exist | ✅ `exportWeeklyLogs` from Implementation on, denied before | CSV download | — | — | — | Not audited (read-only export) |
| S7.4 | Final manuscript + link (Quebec, G3 at Final Defense) | — | ✅ nothing accepted at Final Defense Scheduling | vN | Panel (Foxtrot, Bravo) | ✅ → panel | ✅ | — |
| S8.1 | Revised manuscript (G3, Final Revision) | ✅ task shown | ✅ | Revised vN | Delta (Adviser): "awaiting your decision" ✅ | ✅ → Delta only | ✅ | — |
| S9.1 / S9.2 | Editor's / Plagiarism certificates | — | ✅ `.jpg` rejected | certs vN | URO later | — (§3 lists none) ✅ | ✅ | Group's due list empties once both are in |
| S2.2 → Student | "Adviser appointed" | Dashboard shows the Adviser after approval | ✅ | — | Group + Adviser | ✅ "Adviser appointed", names Prof. Alpha | (gate audit) | New |

## 4. Negative tests (Must NOT)

| Must not | UI | Guard |
|---|---|---|
| See other groups (list or pasted URL) | ✅ Projects lists only their own group. `/projects/p_g1` as Quebec shows the generic "not available" page | ✅ `canView` false and `viewBundle` null for G2 at **all 18 stages** as Kilo |
| See approve / sign / verdict / assign / schedule controls | ✅ The Next-step panel is read-only. No review, sign or verdict forms | ✅ None in `allowedActions('Student', stage)` at any stage. Forced `submitReview`, `runGate`, `recordVerdict` rejected |
| Edit or delete a submitted file | ✅ No such control | ✅ No such service exists. A new upload is vN+1 |
| Create groups | ✅ No control | ✅ `createProject` rejected (Whiskey) |
| Submit to a stage that isn't active | ✅ Only the stage's types are offered; blocked ones say why | ✅ G4 (Group Formation) upload, Revised Manuscript and certificate at Topic Proposal, a weekly log before Implementation — all rejected |
| Annotate (R12) | Not built | ✅ `annotate` denied |
| Learn that a private panel note exists | ✅ | ✅ History entry hidden from students, the Adviser and the other panelist |
| See a proposed Adviser / panel before it is announced | ✅ "Awaiting appointment" | ✅ `viewBundle` filters it |

## 5. `WORKFLOWS.md` §7 scenarios

| T# | Result | Evidence |
|---|---|---|
| T4 (student side) | **Pass** (guard) · note UI **Not built** (R12) | Kilo cannot read Charlie's note before release (`canViewAnnotation`). A new private note leaves no History entry for Kilo, Alpha or Foxtrot |
| T13 | **Pass** (guard + UI) | No other group at any stage. No approve action at any stage. Re-upload creates v2 and supersedes v1. Versions are grouped per type in the UI |
| T14 | **Pass** (guard + UI) | Whiskey: "You are not in a project group yet", empty worklist, `canView` false everywhere |
| T18 | **Pass** (guard + UI) | Quebec sees the **Overdue** badge, "overdue by 1d", the urgent task "Revisions overdue by 1 day(s)" and the notification. Outbox "Overdue Revision" → students + Adviser |

R12 guard-only checks for the student: `viewAnnotations` allowed; `viewPrivatePanelNotes` only once the verdict releases them (PANEL_NOTES_RELEASE); `viewAiSummary` denied (AI_SUMMARY_AUDIENCE excludes Student), and `viewBundle` returns no summaries.

## 6. Config flags used

| Flag | Value | Effect for the student |
|---|---|---|
| `AI_SUMMARY_AUDIENCE` | Adviser, Panel Chair, Panel Member | Students cannot read the summary (OQ#2) |
| `PANEL_NOTES_RELEASE` | `students-on-verdict` | Notes become readable to the group after the verdict (OQ#3) |
| `REVISION_DAYS` / admin setting | 7 / 14 | Countdown on the dashboard |
| `VERDICT_VALUES` | Minor / Major / Re-defense | Latest-verdict badge |
| `PROPOSAL_REVISION` | `sub-status` | Dashboard shows "Proposal Defense · Proposal Defense · Revisions" |

No new flags.

## 7. Open items hit

- **NEW-9** — The weekly log stays Capstone 2 only (`weeklylog.submit` at Implementation). A log before then is rejected (tested). Still open.
- **OQ#2** — Students do not see the AI summary (flag). The role text says they do, Table 1 does not. Unchanged.
- **OQ#3** — Mockup default in place (guard-tested).
- **OQ#12** — Deployment information is a PDF document type: a placeholder, not modelled.
- **NEW-24 (new — for Prompt 3):** Topic order. WORKFLOWS runs S3.3 approve → S3.4 register → S3.5 concept paper → S3.6 approval moves the stage. The code's `REGISTER_TOPIC` gate *requires* an approved concept paper and *moves the stage*, so registering first would deadlock. **Interim:** the concept paper opens once a topic is approved (S3.3), and registration comes last. Prompt 3 should split the gate so that registering sets the title without moving the stage, and the concept-paper approval moves it.
- **NEW-25 (new):** S5.3 says the complete-manuscript upload "triggers AI summary". The existing stub (R12, not extended) still runs when the schedule is published, on the pre-defense draft. So the panel, which sees only the latest version, sees no summary for the complete manuscript. Wire it to the S5.3 / S7.4 upload when the feature is built (flag `AI_SUMMARY_TRIGGER`).
- **NEW-26 (new):** "Five proposed topics" doesn't say whether that means one document or five. Built as one Topic Proposal version: a PDF plus five required, distinct titles. Instructor 1 approves one of them.
- **NEW-27 (new, inferred):** The group sees its Adviser only after S2.2 and its panel only after the PC confirms it (S5.1). Before this pass the Overview showed a proposed Adviser. Confirm with the team.
- **NEW-28 (new):** WORKFLOWS gives no weekly-log cadence. The dashboard suggests "Submit this week's log" when nothing is pending and the last log is over 6 days old. This is a display hint only: the guard doesn't enforce any cadence.
- **R10 — shared code touched:** `caac.js` (`allowedDocTypes`), `guard.js` (`viewBundle`), `actions.js` (`submitDocument`, `submitReview`, `REGISTER_TOPIC`, `transition`), `worklist.js`, seed / stage builder (key v4). All 60 earlier tests pass.
  - **Prompt 3 (I1):** re-check the topic picker in the review form, and NEW-24.
  - **Prompt 5 (Dean/AD):** the "Adviser appointed" email.
  - **Prompt 7/8 (Panel):** S5.3 / S7.4 uploads now arrive during the defense stages. Pre-defense notes go on the complete manuscript.
  - **Prompt 1 does not need a re-run.**

## 8. Manual localhost script

1. Start the app, then open http://localhost:5181 and choose Dev tools → **Reset to seed**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Log in as **Kilo Student**. The dashboard shows "Conceptualization · Topic Proposal", "Topic Proposal v1 is waiting for a decision from Prof. Bravo", and the faculty list (Instructor 1 Prof. Bravo, Adviser Prof. Alpha, panel "Not yet").
3. **Projects** lists G1 only. Open `/projects/p_g2` → "This project is not available to you".
4. G1 → **Documents** → New submission (Topic Proposal). Click Submit with nothing filled → "Propose all 5 topics." Enter five topics, two of them the same → "Each proposed topic must be different." Fix it, attach a `.docx` → "Only PDF files can be submitted." Attach a PDF → Submit version 2. Expect v2 Submitted, v1 Superseded, grouped under "Topic Proposal · 2 versions". The five topics are listed.
5. The Concept Paper line reads "Instructor 1 has to approve one of your proposed topics first."
6. Dev tools → Outbox: "Topic Proposal submitted" → bravo, alpha.
7. Switch to **Prof. Bravo** → Worklist shows G1 with "1 submission(s) awaiting your decision". Open Documents → Decision: Approve → **Topic to approve**: pick one → Submit decision.
8. Switch to **Lima Student** → the dashboard says "Upload the concept paper for your approved topic". Dev tools → Outbox: the "Approved" email names the approved topic. Documents → Concept Paper → attach a PDF → Submit.
9. Switch to **November Student** (G2, Proposal Defense). The dashboard lists "Submit the complete proposal manuscript for the panel", "Submit the presentation video link" and the defense schedule. Documents → Presentation Video (link) → `youtube.com/watch?v=1` → rejected. Enter `https://youtu.be/demo` → accepted. Then submit Proposal Manuscript v3 as a PDF.
10. Switch to **AD Echo** → G2 → Documents lists Proposal Manuscript **v3 only** ("Panel members see the current version…"). The outbox shows both emails to alpha and echo, not charlie.
11. Switch to **Quebec Student** (G3). Expect "Revision deadline: 3d left", "Upload the revised manuscript for the Adviser", and the latest verdict "Passed with Minor Revisions" with its remarks.
12. Dev tools → **Load scenario T18** → as Quebec, expect an **Overdue** badge, "overdue by 1d", a red "Revisions overdue by 1 day(s)", and in Dev tools → Outbox the "Overdue Revision" email to the students and the Adviser.
13. Switch to **Whiskey Student** → "You are not in a project group yet", with no project data (T14).
14. Dev tools → **Set G1 to Implementation** → as Kilo, the dashboard says "Upload your manuscript draft" and "Submit the deployment information". The seeded week-1 log is recent, so no log reminder appears yet (NEW-28). Weekly logs → submit → the Adviser (Prof. Alpha) gets "Weekly log submitted".

## 9. §9 items found

None.

## 10. Impeccable audit (changed screens: student dashboard, Documents panel)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | The group desk is a `section` labelled by its `h2`. The topic inputs have `aria-label`s, and form errors use `role="alert"`. The rest are app-wide P2s: tabs without arrow-key roving, and a counted task list on the dashboard |
| 2 | Performance | 4 | The dashboard resolves CAAC once per user to name reviewers. That's fine at prototype scale (P3 if user counts grow) |
| 3 | Responsive | 3 | No horizontal scroll at 375 px, and the group desk stacks. Touch targets under 44 px are the existing pattern (P2) |
| 4 | Theming | 3 | Existing tokens only, no new colours. No dark mode app-wide (systemic) |
| 5 | Implementation integrity | 4 | Detector: 0 findings. It stays in the records-desk system (rules, mono data, crimson accent). The desk uses a two-column rule layout, not a card grid |
| **Total** | | **17/20** | Good |

No P0 or P1 issues. **P3:** the dashboard's "things to do" count includes the revision deadline line.

## 11. Re-run 2026-09-30 (after Prompt 10, URO)

Shared code changed in Prompt 10: `allowedDocTypes` now takes the bundle, the URO return paths, the student notice, and the monotonic clock. Re-checked in the browser (port 5181) and in tests (`student.test.js`, `uro.test.js`: all pass).

| Check | Result |
|---|---|
| S9.1 / S9.2 at Final Requirements | **Pass.** Both certificates upload as v1 (PDF); the due list empties ("Nothing is waiting on your group right now") |
| Upload outside the stage's types | **Pass** (unchanged tests: certificates at Topic Proposal rejected) |
| At URO Verification with no return | **Pass.** Nothing is accepted; no upload form |
| **New:** URO returns a certificate | Dashboard notice with the URO's remarks; urgent "Editor's Certificate v1 was returned — upload a revised version"; only that type can be uploaded → v2, v1 Superseded; the project goes back to the URO |
| **New:** URO returns the manuscript (NEW-46) | Project back at Final Requirements; "Final Manuscript v1 was returned — upload a revised version"; after v2 the Adviser is asked to sign the reissued Approval Sheet |
| Emails | "Returned by the URO" (group + Adviser). No new emails from students' own uploads |

No other change is needed for the Student.
