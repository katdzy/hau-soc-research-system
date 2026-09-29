# 11 — End-to-end handoff walkthrough (Prompt 11)

**Date:** 2026-09-30 · **Group:** G5 "Barangay Health Queue" (WD-401), created fresh from three newly registered students · **Backend:** local (browser on port 5183, `capstone-prototype-local-alt`)

**Cast (G5 only).**
- Prof. Bravo: Instructor 1.
- Prof. Alpha: Program Chair/Coordinator only, with no hat on G5, so NEW-11 visibility is tested cleanly.
- Prof. Charlie: Adviser.
- Dean Delta and AD Echo: adviser approval and final approval.
- Prof. Foxtrot: Panel Chair.
- Prof. Katrina Sy and Prof. Jomar Enriquez (NPC faculty): Panel Members.
- Prof. Dennis Uy (NPC): Instructor 2, with no reviewer hat, so "I2 never marks" is tested cleanly.
- URO Uniform, Admin Sierra.
- Students: Golf Five, Hotel Five, India Five.

No stage controls, scenario loader or stage builder were used. The only dev tools used were:
- the outbox's **Verify my email** button (S0.2);
- **Attach dummy PDF** in the upload form;
- the overdue job, run with a simulated clock (S8.2, see §2).

## 1. Summary

| Check | Result |
|---|---|
| Browser walk-through | **S0.1 → S10 done in the UI** on the local backend. Every step was driven through the actor's own buttons and forms. The other personas' dashboards were read after each step (see §10) |
| Scripted walk (`src/__tests__/handoff.test.js`, new) | **Pass.** G5 goes S0 → S10 through the write path only. After every step the walk records three things: whose turn it is (from every persona's worklist), who can open G5, and which emails and audit entries were written. It checks them against §5. It covers the returned concept paper (S3.6), a returned weekly log (S6.2), a re-defense (S7.7), an overdue revision (S8.2) and a URO return (S9.4) |
| Unit tests (`npm test`) | **226 / 226 pass** (225 before, plus the walk) |
| Production build | Builds. No dev-tools strings in `dist/` |
| Handoff breaks found | **7, all fixed** (§4). One of them, the Projects page crash, blocked group creation for everyone |
| Decisions the docs don't make | 9 (§5) |
| §5 "Waiting on" | Matches at every step (§3) |

The session paused once at S5.2, when the tool-permission check stopped answering. It resumed from the same browser state; nothing was re-seeded or set with stage controls.

## 2. Timeline

"Turn next" means whoever has an open, unblocked gate or a task on G5 right after the step; the group counts once. "Sees G5" lists who can open the project. Admin Sierra can open every project record (§2.2) and is left out of that column. Only G5's emails and audit entries are listed.

| Step | Actor (hat) | What changed | Email → to | Audit (hat) | Turn next | Sees G5 | Browser evidence |
|---|---|---|---|---|---|---|---|
| S0.1 | Three students | Register with WD-401. Accounts are Inactive, with no role | Account verification → each address | `ACCOUNT_REGISTERED` ×3 | — | — | ✅ Register form. Admin → Accounts lists 4 pending (Prof. Papa + the 3) |
| S0.2 | Students | Click the verification button. `emailVerified` is set, role Student, still Inactive | — | `EMAIL_VERIFIED` ×3 | — | — | ✅ outbox button |
| S0.3 | Admin Sierra (System Administrator) | Activates the three | — (§3 lists none) | `ACCOUNT_STATUS_CHANGED` ×3 (System Administrator) | — | — | ✅ Admin → Accounts → Activate |
| S0.4 | Golf Five | Signs in | — | — | — | — | ✅ Empty state: "You are not in a project group yet… Instructor 1 of your section (WD-401) creates the groups" (T14) |
| S1.1 | Prof. Bravo (Instructor 1) | G5 created with Bravo as Instructor 1; 3 members added (3 of 4) | Added to a group → each student | `PROJECT_CREATED`, `MEMBER_ADDED` ×3 (Instructor 1) | I1 | I1, students | ✅ Projects → New project group (after fix 1), then Overview → Add a student. The section roster listed the three under "Not in a group yet". Students: group workspace, "Adviser — Awaiting appointment" |
| S1.2 | Bravo (I1) | → Adviser Assignment | Stage: Adviser Assignment → students, PC | `STAGE_ENDORSE_ROSTER` (I1) | PC (gate waits on the PC's own assignment) | I1, students, **PC** | ✅ PC dashboard: G5 in **Needs adviser**, "Assign an Adviser before routing." |
| S2.1 | Prof. Alpha (PC) | Charlie assigned (still a proposal), then routed → Adviser Approval | Stage: Adviser Approval → students, Dean, AD. **Charlie is not emailed yet** (by design, S2.2) | `ROLE_ASSIGNED`, `STAGE_ROUTE_ADVISER` (PC) | Dean, AD | I1, students, Dean, AD. The PC drops out; Charlie still cannot open G5 | ✅ PC is sent back to the worklist. Students still see "Awaiting appointment": the proposal is not shown to them |
| S2.2a | Dean Delta (Dean) | Approval recorded (1 of 2) | Adviser assignment to approve → AD | `ADVISER_APPROVAL_RECORDED` (Dean) | AD | same | ✅ Dean's queue "Adviser assignments to approve · 0 of 2". After approving, Next step shows "Done: Dean · Now: Associate Dean" |
| S2.2b | AD Echo (Associate Dean) | → Topic Proposal | **Adviser appointed** → students, Adviser, I1 | `STAGE_APPROVE_ADVISER` (AD) | Students | I1, Adviser, students. Dean and AD drop out | ✅ Students see "Adviser — Prof. Charlie" and "Submit your 5 proposed topics" |
| S3.1 | Golf (Student) | Topic Proposal v1 | Topic Proposal submitted → I1, Adviser | `DOCUMENT_SUBMITTED` (Student) | I1 ("awaiting your decision"), Adviser ("draft to read — you may return it") | same | ✅ |
| S3.2 | Charlie (Adviser) | v1 returned (For Revision) | Revision requested → students | `REVIEW_DECISION` (Adviser) | Students | same | ✅ **after fix 2**; before it, the Adviser had no return option at Topic Proposal. Student desk: "Topic Proposal v1 was returned — upload a revised version" |
| S3.1b | Hotel | Topic Proposal v2 (v1 Superseded) | → I1, Adviser | `DOCUMENT_SUBMITTED` | I1, Adviser | same | ✅ |
| S3.3 | Bravo (I1) | Approves "Barangay Health Queue" | Approved → students (the email names the topic) | `REVIEW_DECISION` (I1) | I1 (register the title) | same | ✅ topic picker |
| S3.4 | Bravo (I1) | Title registered | — (§3: none) | `REGISTER_TOPIC` (I1) | Students | same | ✅ the title shows everywhere |
| S3.5 | India | Concept Paper v1 | Concept Paper submitted → I1, Adviser | `DOCUMENT_SUBMITTED` | I1, Adviser | same | ✅ |
| S3.6 | Charlie (Adviser), Bravo (I1) | Charlie annotates v1 three ways: **selected words** (p. 1), **Mark area** (p. 2), a **general note**. Bravo returns v1 | Revision requested → students | `ANNOTATION_ADDED` ×3 (Adviser), `REVIEW_DECISION` (I1) | Students | same | ✅ Students see "Annotations · 3" on v1, with the two page marks drawn. After v2: v1 is **Superseded and still has its 3 notes**; v2 shows "No annotations visible" |
| S3.6 | Golf / Bravo | v2 uploaded; Bravo approves → Proposal Development | Approved → students; Stage: Proposal Development → students, Adviser | `REVIEW_DECISION`, `STAGE_APPROVE_CONCEPT_PAPER` (I1) | Students | same | ✅ |
| S4.1 | Golf | Proposal Manuscript v1 | → Adviser, I1 | `DOCUMENT_SUBMITTED` | Adviser (decides), I1 (may return) | same | ✅ |
| S4.2 | Charlie (Adviser) | Words + area + general note on v1, then returns it. Hotel uploads v2 | Revision requested → students; submitted → Adviser, I1 | `ANNOTATION_ADDED` ×3, `REVIEW_DECISION` (Adviser) | Students, then Adviser | same | ✅ v1 keeps its 3 notes after v2; v2 is clean |
| S4.2 | Charlie | Approves v2 | Approved → students | `REVIEW_DECISION` (Adviser) | I1 | same | ✅ |
| S4.3 | Bravo (I1) | → Panel Assignment | Stage: Panel Assignment → students, Adviser, PC | `STAGE_APPROVE_FOR_DEFENSE` (I1) | PC (waits on own assignment) | + PC | ✅ PC: G5 in **Needs panel**, "A Panel Chair must be assigned." The panel still cannot open G5 |
| S5.1 | Alpha (PC) | Foxtrot as Chair; Sy and Enriquez as Members; panel confirmed → Proposal Defense Scheduling | Assigned to a panel → each panelist; Stage → students, Adviser | `ROLE_ASSIGNED` ×3, `STAGE_CONFIRM_PANEL` (PC) | PC (schedule) | + panel | ✅ |
| S5.2 | Alpha (PC) | Proposal defense published (NEW-2: the PC schedules) → Proposal Defense. **The AI summary would happen here, but it is not built (R12).** The existing stub runs now, on v2 | Defense scheduled → students, Adviser, panel; Stage → students, Adviser, Chair | `DEFENSE_SCHEDULED`, `AI_SUMMARY_GENERATED` (stub), `STAGE_SCHEDULE_PROPOSAL_DEFENSE` (PC) | Students (complete manuscript + video link); each panelist "No pre-defense notes recorded yet" | − PC | ✅ Defense tab form, with the time set an hour earlier (NEW-51). The Panel Chair's verdict step is already **ready before S5.3** (NEW-55) |
| S5.3 | India | Proposal Manuscript v3 (complete) + video link. **Per NEW-4, the AI summary belongs here**, on v3 | Proposal Manuscript / Presentation Video submitted → panel | `DOCUMENT_SUBMITTED` ×2 | Panel | same | ✅ upload + video link |
| S5.5 | Each panelist | One private note each, on v3 | — | `ANNOTATION_ADDED` (Panel Chair / Panel Member); the history entry is private to its author | The reminder clears **only for the author** each time | same | ✅ Each panelist's version list shows only "Proposal Manuscript v3" (T15) |
| S5.5 check | — | Who sees which private note | | | | | ✅ In each person's own Documents tab: Chair 1 (own), Sy 1 (own), Enriquez 1 (own), Charlie 0, Golf 0. Sy's Defense tab: "Only this project’s Panel Chair can record the verdict" (T5) |
| S5.6 | Foxtrot (Panel Chair) | Minor → Proposal Defense · Revisions. FM-2004 issued with the Chair's line signed. 7-day countdown. Private notes released | Revision requested → students, Adviser; Stage → students, Adviser, I1, PC | `VERDICT_RECORDED`, `STAGE_RECORD_PROPOSAL_VERDICT` (Panel Chair) | Students (upload), PC ("Assign an Instructor 2") | + PC (assigning I2 is a PC step) | ✅ "Revisions due in 7 day(s)". Golf sees all 3 notes, each marked **released**. Foxtrot and Sy see only their own; Charlie sees none |
| S5.7 | Golf; Charlie; Sy; Enriquez | Revised manuscript → Adviser approves → Adviser signs FM-2004 → both Members sign | Revised Manuscript submitted → Adviser; FM-2004 to sign → Sy, Enriquez; **Revisions verified** → I1 | `DOCUMENT_SUBMITTED`, `REVIEW_DECISION`, `SIGNATURE_APPLIED` ×3 | Adviser → Members → PC and I1 | same | ✅ Before approving, Charlie's Forms tab says "Approve the revised manuscript before verifying compliance". The sign buttons appear in order. After the last signature the students' countdown is gone (fix 4) |
| S5.8 | Alpha (PC), then Bravo (I1) | Uy assigned as I2 (no email yet: G5 is not open to him). I1 routes → Implementation | Stage: Implementation → students, Adviser, **I2** | `ROLE_ASSIGNED` (PC), `STAGE_CLOSE_PROPOSAL_REVISION` (I1) | I2 (milestones), students | + I2; **− I1** (NEW-6, `I1_ACCESS_AFTER_ROUTING = none`); − PC | ✅ Bravo reopening G5 gets "This project is not available to you" |
| S6.1–S6.2 | Golf; Charlie | Week 1 submitted → **returned** ("List who did what") → resubmitted as week 1 → approved and signed. Week 2 → approved | Weekly log submitted → Adviser; Revision requested / Approved → students | `WEEKLY_LOG_SUBMITTED`, `WEEKLY_LOG_RETURNED`, `WEEKLY_LOG_SIGNED` (Adviser) | Adviser ⇄ students | same | ✅ Student desk: "Week 1 log was returned — resubmit it". The log list ends Week 1 Returned · Week 1 Approved · Week 2 Approved |
| S6.3–S6.4 | Golf; Charlie | Final Manuscript v1; words + area + general note; returned; v2; approved | → Adviser; Revision requested / Approved → students | `ANNOTATION_ADDED` ×3, `REVIEW_DECISION` ×2 | Adviser ⇄ students | same | ✅ v1 keeps its 3 notes, v2 is clean. **Uy's viewer shows the 3 notes but no Select text, Mark area, annotation or decision controls** (T6) |
| S6.5 | Uy (I2) | Both milestones confirmed, plus readiness (NEW-43) | Milestones confirmed → Adviser, students; Ready for final defense → Adviser | `MILESTONE_CONFIRMED` ×2, `READINESS_CONFIRMED` (I2) | Adviser, students | same | ✅ Capstone 2 checks → Confirm ×3 |
| S6.6 | India | Deployment information (PDF) | → Adviser | `DOCUMENT_SUBMITTED` | Adviser | same | ✅ |
| S6.7 | Charlie (Adviser) | FM-2005 → Final Defense Endorsement | Stage → students, PC | `FORM_SUBMITTED`, `STAGE_RECOMMEND_FINAL_DEFENSE` (Adviser) | PC | + PC | ✅ PC: G5 in **Recommendations to endorse**. Uy's Defense tab: Publish schedule is disabled, "Not available until the project reaches Final Defense Scheduling" (T7) |
| S7.1 | Alpha (PC) | Endorsed → Final Defense Scheduling. S7.2: the panel is kept (`SAME_PANEL_BOTH_DEFENSES`) | Stage → students, Adviser, I2 | `STAGE_ENDORSE_FINAL_DEFENSE` (PC) | I2 | − PC | ✅ |
| S7.3 | Uy (I2) | Final defense published. **The AI summary would happen here** (the stub runs now, on Final Manuscript v2; R12) | Defense scheduled → students, Adviser, panel | `DEFENSE_SCHEDULED`, `AI_SUMMARY_GENERATED` (stub), `STAGE_SCHEDULE_FINAL_DEFENSE` (I2) | Students, Chair | same | ✅ |
| S7.4 | Golf | Final Manuscript v3 + video link (**the AI summary belongs here, per NEW-4**) | → panel | `DOCUMENT_SUBMITTED` ×2 | Panel Chair; every panelist gets "No pre-defense notes recorded yet" (**after fix 3**) | same | ✅ all three reminders present |
| S7.5 | Each panelist | One private note each | — | `ANNOTATION_ADDED` | The reminder clears only for the author | same | ✅ Sy's note uses Mark area. Chair and Enriquez see only their own; Charlie and Hotel see none |
| S7.6 | Foxtrot | **Re-defense** → Final Revision (re-defense sub-path). Notes released to the students | Re-defense → students, Adviser; Stage → students, Adviser, Members | `VERDICT_RECORDED` (Panel Chair) | Students | same | ✅ Hotel sees all three notes, released (Sy's shown as "p. 1 · marked area"); Sy sees only hers. Uy's row reads "The group is revising for a re-defense; confirm the post-defense requirements after it passes", with no Confirm button (fix 5) |
| S7.7 | Hotel; Charlie; Uy; India; Foxtrot | Revised manuscript → Adviser approves → back to Final Defense Scheduling → I2 re-schedules → Final Manuscript v4 + link → **Major** → Final Revision (14 days) | submitted; Approved; Stage → students, I2; Defense scheduled; Revision requested | `STAGE_RETURN_TO_FINAL_DEFENSE` (Adviser), `DEFENSE_SCHEDULED` (I2), `VERDICT_RECORDED` | Students | same | ✅ The panelists' reminder reappears for the re-defense. Major gives 14 days |
| S8.2 | System | Countdown run out (overdue job run with the clock at now + 15 days) → Overdue | **Overdue Revision** → students, Adviser | `REVISION_OVERDUE` (System) | Students | same | ✅ The job was run from the page with the clock 15 days ahead. Student desk shows an **Overdue** badge; the Defense tab shows "Major · overdue" (**after fix 7**; before it, the Defense tab showed nothing) |
| S8.1 | Golf | Late revised manuscript | → Adviser | `DOCUMENT_SUBMITTED` | Adviser | same | ✅ |
| S8.3–S8.4 | Charlie; Sy; Enriquez | Adviser approves and signs FM-2004; the Members sign → revisions Completed → Final Requirements. Approval Sheet issued | FM-2004 to sign → Members; **Approval Sheet to sign → Adviser**; Stage → students, Adviser, PC | `SIGNATURE_APPLIED` ×3, `FORM_ISSUED`, `STAGE_COMPLETE_FINAL_REVISION` (Panel Member) | Students (certificates) | + PC | ✅ Charlie is emailed "Approval Sheet to sign" but has nothing to do yet (NEW-49) |
| S8.5 | Uy (I2) | Post-defense requirements confirmed | — | `POST_DEFENSE_REQUIREMENTS_CONFIRMED` (I2) | Students | same | ✅ |
| S9.1–S9.2 | Golf; Hotel | Editor's and Plagiarism certificates | — (§3: none) | `DOCUMENT_SUBMITTED` ×2 | Adviser ("Approval Sheet to sign") | same | ✅ |
| S9.3a–c | Charlie; Foxtrot, Sy, Enriquez; Alpha | Adviser signs → the panel signs → the PC endorses and signs → URO Verification | Approval Sheet to sign → panel; **to endorse → PC**; Stage → students, Adviser, URO | `SIGNATURE_APPLIED` ×5, `STAGE_ENDORSE_TO_URO` (PC) | URO | + URO; − PC. **Dean and AD still cannot open G5** | ✅ PC: **Approval Sheets to endorse**, "6 of 7 steps done" |
| S9.4 | URO Uniform | **Returns** the Plagiarism certificate with remarks; India uploads v2; the URO verifies and signs → Final Approval | Returned by the URO → students, Adviser; Certificates resubmitted → URO; **Fully cleared project endorsed** → students, Adviser, Dean, AD | `URO_RETURNED`, `SIGNATURE_APPLIED`, `STAGE_URO_VERIFY` (URO) | Students → URO → Dean, AD | + Dean, AD (first time since S2.2); − URO | ✅ The URO's viewer has no marking tools. Return form: a checkbox and remarks. The student sees "Plagiarism Clearance Certificate v1 was returned", and the upload offers **only** that type |
| S9.5 | Delta (Dean), Echo (AD) | Both sign → Archived, Pass | Final approval → AD; Stage: Archived → students, Adviser | `FINAL_APPROVAL_SIGNED`, `STAGE_FINAL_APPROVE` (AD) | — | Dean, AD, Adviser, I2, panel, students | ✅ Dean and AD viewers have no marking tools. After Delta signs: "You have signed. Waiting on: Associate Dean." Students: "Completed · Result: Pass" |
| S10 | Dean/AD, Admin | Records archive (Dean/AD); project record (Admin) | — | — | — | — | ✅ Dean's Records lists G5 with its members and Adviser (the research area shows "Not yet set", NEW-56). Admin opens G5 with **Overview and History only**, no Documents tab (T20) |

Every G5 audit entry carries a role hat (asserted in the walk).

## 3. `WORKFLOWS.md` §5 check

| Stage | §5 "Waiting on" | What G5 showed | OK? |
|---|---|---|---|
| Group Formation | I1 | I1 only; students see "awaiting adviser" | ✅ |
| Adviser Assignment | PC → Dean + AD | First the PC (the gate waits on the PC's own assignment), then the Dean and AD in any order. I1 and the students see "awaiting" | ✅ |
| Conceptualization | Students ⇄ I1 + Adviser | Both reviewers get the queue item on every upload; after fix 2 the Adviser can act on it | ✅ |
| Proposal Development | Students ⇄ I1 + Adviser | The Adviser decides; I1 may return | ✅ |
| Proposal Defense | PC → Students → Panel Chair → Students/Adviser/Panel → I1 | As listed. The panel sees G5 from S5.1 only | ✅ |
| Implementation | Students ⇄ Adviser; I2; Adviser (FM-2005). PC not involved until FM-2005 | As listed. The PC cannot open G5 until S6.7 | ✅ |
| Final Defense | PC → I2 → Students → Panel Chair | As listed | ✅ |
| Final Revision | Students → Adviser → Panel; countdown visible | As listed. The countdown shows for the students and the Adviser; I2 sees the status on the Defense tab | ✅ |
| Clearance | Students → Adviser → Panel → PC → URO → Dean + AD; Dean/AD only after URO | As listed | ✅ (stall noted in §5, NEW-49) |
| Archived | Records (Dean/AD), archive (Admin) | Dean and AD can open it; Admin sees the record | ✅ |

## 4. Where the handoff broke or stalled — fixed

| # | Where | What broke | Fix | Files |
|---|---|---|---|---|
| 1 | S1.1 | **The Projects page crashed for every user** ("COURSES is not defined"), so Instructor 1 could not create a group at all. It was a regression from an earlier edit | Import `COURSES` | `src/pages/Projects.jsx` |
| 2 | S3.2, S3.6 | The Adviser could annotate at Topic Proposal but **could not return the topics or the concept paper**, although §3 gives both steps to "Instructor 1 / Adviser". The group got no decision from the Adviser until Instructor 1 acted | The Adviser now holds `review.return` at Topic Proposal; approving stays with I1 (§3: "I1 is the gate, Adviser reviews"). There, the review form's note now says "Instructor 1 approves topics and the concept paper"; it wrongly said "The Adviser approves drafts" | `src/domain/caac.js`, `src/components/panels/DocumentsPanel.jsx` |
| 3 | S7.5, S7.7 | **"No pre-defense notes recorded yet" never appeared at the final defense or the re-defense.** Any note by that panelist satisfied it, including notes from the proposal defense | Only notes made after the last recorded verdict count | `src/services/worklist.js` |
| 4 | S5.7 → S5.8 | **The proposal countdown kept running after the panel had verified the revisions**; it stopped only when I1 routed the group. A slow I1 would get the group flagged overdue and emailed, and meanwhile the students kept seeing "Revisions due in N days" with nothing left to do | The last FM-2004 signature now completes the proposal revisions, as the final-defense one already did at S8.4. Routing still completes them too (idempotent) | `src/services/actions.js` (`signForm`) |
| 5 | S7.6 → S7.7 | During a **re-defense**, Instructor 2 was asked to "Confirm the post-defense course requirements" before the defense had been passed | New `postDefenseBlocker()`: the step is blocked while the group revises for a re-defense. Applied in the guard and the worklist; the Capstone 2 checks row shows the reason | `src/domain/stages.js`, `src/domain/guard.js`, `src/services/worklist.js`, `src/components/panels/Capstone2Checks.jsx` |
| 6 | S3.2 | The review form's return-only note assumed Instructor 1 on drafts | See 2 | `DocumentsPanel.jsx` |
| 7 | S8.2 | Once a revision was flagged **Overdue**, the Defense tab showed **nothing** for it (the countdown rendered only while Pending). The red flag §3 asks for appeared on the dashboard only | "overdue" badge and countdown while Overdue | `src/components/panels/DefensePanel.jsx` |

Also noted, not fixed: two weekly logs submitted on the same day show the same period ("Sep 23 – Sep 30"), because the period is always the 7 days before submission. It is harmless for this walk, but worth a look if logs are ever back-filled.

**R10 — shared code touched:** one policy in `caac.js`, one check in `guard.js`, `worklist.js`, `signForm` in `actions.js`, and a new helper in `stages.js`. All earlier tests pass. Reports worth re-running:
- **03 Instructor 1** and **06 Adviser**: S3.2/S3.6, return by the Adviser.
- **07 Panel Member** and **08 Panel Chair**: the reminder at the final defense.
- **09 Instructor 2**: S8.5 during a re-defense.
- **02 Student**: the proposal countdown now ends at the last FM-2004 signature, and the Defense tab shows the overdue flag.

## 5. Decisions the docs don't make (new gaps)

| ID | Where | Question | What the mockup does now |
|---|---|---|---|
| NEW-48 | S5.7, S8.2 | Does the revision countdown measure the **group's** upload, or the whole verification (Adviser + panel)? S8.2 says "deadline passed, not completed". A group that uploads on day 2 is still flagged overdue if the Adviser or the panel sign after the deadline | Whole verification: Overdue unless FM-2004 is fully signed by the deadline |
| NEW-49 | S8.4 → S9.3a | The Adviser gets "Approval Sheet to sign" when the sheet is issued (S8.4), **before** the certificates exist, and cannot sign until S9.1–S9.2. Nobody tells the Adviser when the certificates arrive (§3 lists no email for S9.1/S9.2) | Email at issue only. The worklist task appears once both certificates are in |
| NEW-50 | S5.2/S5.3, S7.3/S7.4 | AI summary timing, for when it is built (R12). The stub runs **when the schedule is published**, on the latest manuscript at that moment. That is before the group uploads the complete manuscript the panel reads (S5.3: "triggers AI summary"). NEW-4's default says "complete manuscript at a defense milestone" | Stub at publish time, not extended (R12). Build it on the S5.3/S7.4 upload |
| NEW-51 | S5.2, S7.3 | May a defense be scheduled **in the past**, to record one already held? The date field accepts any date, and with NEW-40 a past date opens the verdict form at once. This walk relied on it | Allowed |
| NEW-52 | S7.6 | After a **re-defense** verdict, the Panel Members get the "Stage: Final Revision" email although nothing is theirs until the re-defense. The stage email goes to everyone who holds one of the stage's gates, including the FM-2004 gate, which does not apply during a re-defense | Emailed |
| NEW-53 | S5.8, S6 | The panel keeps G5 open through all of Implementation (from S5.1 on, `SAME_PANEL_BOTH_DEFENSES`) with nothing to do there. §5 only says "Panel sees project only from S5.1" | Visible, read-only |
| NEW-54 | S1.1 | Instructor 1 can create and forward a group smaller than `GROUP_SIZE` (G5 has 3 of 4). Nothing says whether a short group is allowed | Allowed (the gate needs at least 1 member) |
| NEW-55 | S5.2–S5.3, S7.3–S7.4 | The Panel Chair can record the verdict as soon as the scheduled time has passed, **even if the group has not yet submitted the complete manuscript and video link** (S5.3/S7.4). Should the verdict wait for them? | Not required |
| NEW-56 | S3.4, S10 | No step in the workflow sets the **research area**. It is created as "Not yet set" and stays that way into the Records archive and the reports | Not set by any step |

## 6. Negative checks along the way

| Must not | Result |
|---|---|
| The proposed Adviser sees G5, or is emailed, before S2.2 | ✅ Hidden; no email |
| The students see the proposed Adviser before approval | ✅ "Awaiting appointment" |
| The PC opens G5 outside PC steps (NEW-11) | ✅ Hidden at Conceptualization, Proposal Development, Implementation, Final Defense, URO Verification and Final Approval |
| The Dean or AD open G5 between S2.2 and S9.4 | ✅ Hidden (T9, T11) |
| The URO sees G5 before the PC endorses (T12) | ✅ |
| The panel sees older versions (T15) | ✅ At both defenses the version list holds only the latest |
| A Panel Member records the verdict (T5) | ✅ No form; the guard rejects it |
| Any panelist, the Adviser or a student sees a private note before the verdict (T4) | ✅ At both defenses, UI and guard |
| Panelists see each other's notes after the verdict | ✅ Never |
| **Marking tools** for Instructor 2, the URO, the Dean, the AD or the System Administrator | ✅ The guard rejects `annotate` for all five at Adviser Approval, Implementation, Final Defense, URO Verification and Final Approval (asserted in the walk). **UI:** Uy (S6.4), URO Uniform (S9.4), Dean Delta and AD Echo (S9.5) open the manuscript with no Select text, Mark area, annotation or decision controls; Admin Sierra has no Documents tab |
| I2 schedules before the PC endorses (T7) | ✅ Disabled; the guard rejects it |
| I1 keeps access after routing (NEW-6 = none) | ✅ G5 is gone for Bravo |
| The Adviser signs FM-2004 before approving the revised manuscript | ✅ No sign button; the Forms tab says why |
| The group uploads anything but the returned certificate at URO Verification | ✅ Only that type is offered |

## 7. Config flags used

All at their current values:
- `FACULTY_BASE_IDENTITY` on; `ACCOUNT_ACTIVATION` email+admin; `GROUP_SIZE` 4.
- `ADVISER_APPROVAL` both; `BLOCK_SELF_APPROVAL` on.
- `PROPOSAL_DEFENSE_SCHEDULER` PC; `PROPOSAL_REVISION` sub-status.
- `PANEL_NOTES_RELEASE` students-on-verdict; `VERDICT_VALUES` Minor/Major/Re-defense; `VERDICT_AFTER_SCHEDULED_TIME` on.
- `REVISION_DAYS` 7/14; `REDEFENSE_REVISION_DAYS` Major.
- `WEEKLY_LOG_SIGNER` Adviser; `I2_READINESS_CHECK` own-step; `INSTRUCTOR_2_ASSIGNER` PC.
- `I1_ACCESS_AFTER_ROUTING` none; `SAME_PANEL_BOTH_DEFENSES` on; `PC_PROGRAM_VISIBILITY` summary-outside-pc-steps.
- `POST_DEFENSE_REQUIREMENTS_STAGES` Final Revision, Clearance.
- `URO_RETURN_PATH` on; `URO_RETURNABLE` certificates; `URO_SIGNS_APPROVAL_SHEET` on; `URO_EMAILS` both on.
- `AI_SUMMARY_*`: not built (R12).

## 8. Manual localhost script

1. Start the app with the command below, open http://localhost:5181, then Dev tools → **Reset to seed**:

   ```bash
   VITE_BACKEND=local npm run dev -- --port 5181
   ```

2. Sign out → **Register**: "Golf Five", golf.five@student.hau.edu.ph, WD, 2022-0501, WD-401. Repeat for Hotel Five and India Five.
3. Sign in as **Admin Sierra** → Dev tools → Outbox → **Verify my email** ×3 → Administration → Accounts → **Activate** the three.
4. Switch to **Golf Five**. Expect the empty state naming WD-401's Instructor 1.
5. As **Prof. Bravo**: Worklist → "Create a project group" → title "Untitled — Group 5 (WD-401)" → Create. Open it, add the three students, then **Forward roster**.
6. As **Prof. Alpha**: G5 is in "Needs adviser". Assign Prof. Charlie as Adviser → **Route**. Charlie still cannot open G5.
7. As **Dean Delta** → Approve. As **AD Echo** → Approve. The students now see "Adviser — Prof. Charlie".
8. As Golf: Documents → Topic Proposal with five topics → Attach dummy PDF → Submit.
9. As **Prof. Charlie**: Documents → Decision "Return for Major Revisions", with a comment (fix 2).
10. As Hotel: submit topics v2. As **Bravo**: approve one topic, then Overview → **Register the approved topic**.
11. As India: upload the Concept Paper.
12. As **Charlie**, on v1: **Select text**, select words, comment → Add annotation. Then **Mark area**, drag a box → Add. Then a comment with no mark → Add.
13. As **Bravo**: return v1.
14. As a student: v1 shows "Annotations · 3" and two marks. Upload v2. Expect v1 Superseded and still showing its notes, and v2 with none. As Bravo, approve v2.
15. Repeat steps 12–14 for the Proposal Manuscript, with Charlie deciding. As Bravo: **Approve group for the proposal defense**.
16. As **Alpha**: G5 is in "Needs panel". Assign Prof. Foxtrot as Panel Chair and Prof. Katrina Sy and Prof. Jomar Enriquez as Panel Members → **Confirm panel**. Then Defense → a time earlier today, a venue → **Publish schedule**.
17. As a student: upload the complete Proposal Manuscript and a video link.
18. As each panelist (Foxtrot; Sy and Enriquez are in the NPC list): add a note on the latest version. Expect each to see only their own, and "No pre-defense notes recorded yet" to leave only the author's worklist. Charlie and the students see none.
19. As **Foxtrot**: Defense → Minor, with required revisions → Record. Expect the students to see all three notes, marked released, and each panelist to see only their own.
20. As a student: upload the Revised Manuscript. As Charlie: approve it, then Forms → sign FM-2004. As Sy, then Enriquez: sign. Expect the students' "Revisions due" line to disappear (fix 4).
21. As **Alpha**: assign Prof. Dennis Uy as Instructor 2. As **Bravo**: Move the group on to Capstone 2. Expect G5 to be gone for Bravo.
22. Weekly logs: submit week 1 → Charlie **returns** it → resubmit → approve. Submit week 2 → approve.
23. Final Manuscript draft: Charlie annotates it three ways and returns it. As Uy: expect the notes to be visible with no marking tools. Upload v2 → Charlie approves.
24. As **Uy**: confirm both milestones and readiness. As a student: submit the Deployment information. As **Charlie**: Submit FM-2005.
25. As **Alpha**: Endorse. As **Uy**: publish the final defense (a time earlier today).
26. As a student: upload the final manuscript and a link. Expect every panelist's reminder to be back (fix 3); each panelist adds a note.
27. As **Foxtrot**: record **Re-defense**. Expect Uy to have no post-defense task (fix 5).
28. As a student: upload a revised manuscript. As Charlie: approve it (back to scheduling). As Uy: publish again. As a student: upload again. As Foxtrot: record **Major**.
29. Overdue: Dev tools → Run overdue check does nothing until the 14 days pass. To simulate on a dev build, run this in the browser console:

    ```js
    (await import('/src/services/actions.js')).flagOverdueRevisions(Date.now() + 15 * 864e5)
    ```

    Expect the students and Charlie to get "Overdue Revision", and the Defense tab to show "overdue" (fix 7).
30. As a student: upload the revised manuscript. As Charlie: approve it and sign FM-2004. As Sy, then Enriquez: sign. The project moves to Final Requirements.
31. As Uy: confirm the post-defense requirements. As students: upload both certificates. Then Charlie, Foxtrot, Sy and Enriquez sign the Approval Sheet, and **Alpha** endorses.
32. As **URO Uniform**: Overview → Clearance verification → tick Plagiarism Clearance Certificate, add remarks → Return. As a student: upload v2. As URO: **Verify certificates and sign**.
33. Dean Delta and AD Echo now see G5 in "Projects for final approval". Both sign → Archived. Dean → Records lists G5.

## 9. §9 items found

None.

## 10. Notes on method

- The scripted walk is `src/__tests__/handoff.test.js`. Running `HANDOFF_TRACE=<file> npx vitest run src/__tests__/handoff.test.js` writes the full step-by-step trace as JSON.
- In the browser, each actor's screen was driven through its own buttons and forms, using DOM clicks and inputs. After each step, the dashboards of the personas not being driven were read through the app's own `worklist()`, which is what the dashboards render from. The key dashboards were also opened directly: the students' group desk, the PC's queues, the Dean's approval queue, the Advising/Instructing cards and the Records archive.
- Word selection used a DOM Range on the PDF text layer followed by `mouseup`, the same path a real selection takes. Mark area used pointer events on the page's capture layer.
- No screenshots could be taken: the pane was hidden, and later covered. The evidence is the page text.
- While the pane was hidden, the PDF viewer does not draw (no animation frames, no intersection events). For that tab only, `requestAnimationFrame` and `IntersectionObserver` were replaced with versions that don't need a visible page. No app code was changed for it.
