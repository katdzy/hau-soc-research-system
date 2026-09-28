# HAU-SOC Thesis & Capstone Workflow System — Prototype

A working prototype of the **Development of a Web-Based Thesis and Capstone Project Management
and Workflow Automation System for HAU-SOC** (Holy Angel University, School of Computing).

The point of this build is to make the *workflow and its access control* testable end to end:
sign in as anyone, move a project through the whole life cycle, and watch Context-Aware Access
Control (CAAC), email and the audit trail respond. The screens follow the Figma wireframes
(*HAU-SOC Thesis & Capstone Management System — Wireframes*, S-00 to S-14); the rules follow the
finalized proposal manuscript and the Capstone 2 knowledge base.

---

## Running it

```bash
npm install && npm run dev
```

Open http://localhost:5180. No Firebase project, credentials or network are needed — the
default backend stores everything in the browser. Demo data loads on first run and can be
restored from **Administration → Reset demo data**.

## Signing in (S-00, S-01)

- **Register / sign in** — domain-restricted to `@hau.edu.ph` and `@student.hau.edu.ph`. With
  `VITE_BACKEND=firebase` this is Firebase Authentication: password, verification email and
  password reset. Locally the verification email is shown on screen (approve it to activate the
  account) and passwords are not checked. There is no OTP step.
- **Demo accounts** — one click, no password. Each is labelled with the roles it actually holds.

## Acting as — one context at a time

The top bar's **Acting as** switcher lists every role you hold. Each context has its own menu and
pages, and **only that role's policies apply while you act in it** — Mr. Almocera cannot sign his
advisee's weekly log from the Coordinator context; the system tells him to switch to Adviser.

| Context | Menu | Wireframes |
|---|---|---|
| Student | Dashboard · My Project · Submissions · Version History · Feedback & Annotations · Weekly Logs · Defense · Final Requirements | S-02 – S-06 |
| Adviser | Dashboard · My Advisees · Review Queue · Annotations · Weekly Logs · Defense Clearance · Revision Verification | S-07 – S-09 |
| Panel Member / Chair | Dashboard · Assigned Panels · Manuscripts · AI Summaries · My Annotations · Evaluation Form · Verdict Recording (Chair) · Revision Confirmation | S-10, S-11 |
| Program Coordinator | Dashboard · All Projects · Adviser Assignment · Panel Assignment · Defense Endorsement · Clearance Routing · Reports | S-12 – S-14 |
| Instructor 1 and 2, Dean, Associate Dean, URO, System Administrator | Worklist and the shared project workspace | not wireframed yet |

### Changes on top of the wireframes

- **Weekly logs belong to Capstone 2.** The Student's Weekly Logs item is locked through
  Capstone 1 and the dashboard shows the "weekly logs signed" tile only from Implementation.
- **Pending tasks are a checklist.** The dashboard lists what the group must do at this stage,
  ticked off as it happens, and what it is waiting on and from whom.
- **Days before deadline.** The tile names the deadline (revisions due, or the defense) and counts
  the days before it.
- **Progress trail.** The life-cycle stepper carries the date each checkpoint was reached.
- **No annotation counts.** Reviewer chips and annotation lists carry no totals.
- **No milestone or task module.** The required-documents panel on Submissions and Instructor 2's
  milestone confirmation are gone; the Adviser's FM-AAC-SOC-2005 no longer waits on it.
- **No in-system notifications.** Every workflow event is an email (Resend). The System
  Administrator has a read-only **Email Log** as the delivery record.
- **Students state the version before submitting.** Submissions shows the version number the
  upload will become, asks whether it is a chapter draft or the complete manuscript and what it
  contains, and needs a confirmation. The number is re-checked on submit, so two group members
  cannot both submit "v3".
- **How a student learns a manuscript came back.** A reviewer's annotations stay drafts until
  **Send feedback**, which publishes them with the review decision and emails the group once:
  subject ("Proposal Manuscript v2 returned — return for major revisions"), the reviewer's
  summary, every annotated location, and a button to that version's Feedback & Annotations. The
  reviewer sees the exact email; the group's checklist gains "Address the feedback on v2" and
  "Submit v3"; each annotation takes a resolution note.
- **Panel evaluations gate the verdict** (S-11): the Chair can record it only after every
  panelist has submitted an evaluation form.

---

## CAAC, not RBAC

Under RBAC a role carries a fixed set of permissions. Here **no role carries a permission on its
own**. Every permission is a *policy* — a role plus the context it applies in — and a capability
is granted only when both hold:

| Context | Example |
|---|---|
| Relationship to the project | A Student can submit only to the group they belong to |
| Workflow stage | A Panel Chair records a verdict only at Proposal or Final Defense |
| Program scope | A Program Chair/Coordinator acts only on projects in the programs they coordinate |
| Conflict | The Dean cannot approve an adviser assignment that names himself |
| Phase | Instructor 1 authority ends when the group moves to Capstone 2 |
| Acting context | Only the role you are acting as applies |

Roles follow the manuscript's two dimensions:

- **Global Roles** — Student, Dean, Associate Dean, Program Chair/Coordinator, University Research
  Office, System Administrator. A user can hold several, or none.
- **Project-Based Roles** — Instructor 1, Instructor 2, Adviser, Panel Member, Panel Chair. Held
  per project, so one person can hold different ones on different projects.

The **CAAC Inspector** beside every project workspace lists, for each role you hold, what it grants
on *this* project at *this* stage — and what the same role would grant under a different context.
The service layer calls `authorize()` before every write, as each Cloud Function would.

### Personas worth signing in as

| Person | Standing | What to notice |
|---|---|---|
| **Karl Dungca** | Student, Group 5 | Proposal Manuscript v2 came back with annotations: checklist, Feedback & Annotations, Weekly Logs locked |
| **Dr. Marlon I. Tayag** | Dean · Adviser on Groups 5 and 2 | Two contexts. As Adviser he reviews Group 5; as Dean he cannot approve his own assignment on Group 2 |
| **Engr. Marites C. Bondoc** | Adviser on Group 4, Panel Member on Group 3 | Group 3's verdict waits for her evaluation form |
| **Dr. Helen V. Santos** | Panel Chair on four groups | Verdict Recording for Group 3 |
| **Mr. Chris Almocera** | Program Coordinator (IT) · Adviser on Group 1 | Program dashboard in one context, weekly-log sign-off in the other |
| **Ma. Cristina V. Reyes** | System Administrator | Accounts & CAAC, Audit Trail, Email Log |

---

## A walkthrough

Group 7 starts at Group Formation; Group 5 is mid-way through Proposal Development.

| # | Acting as | Do this | What it shows |
|---|---|---|---|
| 1 | Karl — Student | Dashboard → Feedback & Annotations → add a resolution note | How a returned version reaches the group |
| 2 | Karl — Student | Submissions → Proposal Manuscript, **Complete manuscript**, describe it, confirm **v3** | The student states the version before it goes in |
| 3 | Tayag — Adviser | Review Queue → **Review** → add a comment → decision → **Send feedback** | One email to the group with every annotation |
| 4 | Espinosa — Instructor 1 | Group 7 → **Forward roster** | Instructors form groups |
| 5 | Almocera — Program Coordinator | Adviser Assignment → pick an adviser → **Endorse to Dean / Assoc. Dean** | Routing slip; conflict checks |
| 6 | Tayag — Dean, then Rivera — Associate Dean | Group 2 → **Approve adviser assignment** | No self-approval |
| 7 | Bondoc — Panel Member | Evaluation Form → Group 3 → **Submit evaluation** | Unlocks the verdict |
| 8 | Santos — Panel Chair | Verdict Recording → confirm → **Record verdict** | Countdown, FM-AAC-SOC-2004, private notes released, emails |
| 9 | Almocera — Adviser | Weekly Logs → sign week 3 → Defense Clearance → **Submit FM-AAC-SOC-2005** | Capstone 2 only; same person, other context |
| 10 | Castro — URO, then Tayag and Rivera | Group 4 → **Verify and sign**, then **Sign the Approval Sheet** | URO before the Dean; archived with Pass |
| 11 | Reyes — System Administrator | Email Log, Audit Trail | Every email and every step, attributed |

Seven groups are seeded:

| Group | Parked at |
|---|---|
| Group 7 (WD-401) | Group Formation — walk the whole life cycle |
| Group 2 (WD-401) | Adviser Approval — the Dean-as-Adviser conflict |
| Group 5 (WD-401) | Proposal Development — v2 returned with annotations |
| Group 3 — Smart Queue Management System | Proposal Defense — evaluations, verdict |
| Group 1 — IoT-Based Laboratory Equipment Tracking | Implementation — weekly logs, FM-AAC-SOC-2005 |
| Group 4 — Automated Student Feedback Sentiment Analysis | URO Verification — clearance, signatures |
| Group 6 — Barangay Health Records Digitisation Platform | Archived — records archive |

---

## The life cycle

```
Capstone 1 · Ideation        Group Formation → Adviser Assignment → Adviser Approval → Topic Proposal
Capstone 1 · Proposal        Proposal Development → Panel Assignment → Proposal Defense Scheduling
                             → Proposal Defense → Proposal Revision
Capstone 2 · Implementation  Implementation & Monitoring → Final Defense Endorsement
                             → Final Defense Scheduling → Final Defense → Final Revision
Post-Defense Clearance       Final Requirements → URO Verification → Final Approval → Archived
```

- Verdicts: **minor revisions (7 days)**, **major revisions (14 days)**, or **re-defense**, which
  returns the project to scheduling. The Chair can change the revision period.
- FM-AAC-SOC-2004 is signed Panel Chair → Adviser → Panel Members. The Approval Sheet is signed
  Adviser → Panel → Program Chair/Coordinator → URO → Dean and Associate Dean.
- AI summaries (Gemini Flash) are generated automatically when a defense is scheduled, from the
  latest *complete* manuscript only, and always carry the AI disclosure label.
- Cleared projects go to a **records-table archive** searchable by the Dean and Associate Dean.
  There is no public gallery and no grade.

## How it is put together

```
src/domain/caac.js        CAAC policies and resolution: role × context → capability
src/domain/contexts.js    "Acting as" contexts and each context's menu
src/domain/stages.js      the workflow — each stage's gate, its capability and its guard
src/domain/forms.js       form signing order
src/domain/constants.js   roles, verdicts, document types, official forms
src/services/actions.js   every state change: authorize → write → audit → email
src/services/views.js     checklist, progress trail, deadline, review queue
src/pages/student|faculty|coordinator/   the wireframed context pages
src/components/panels/    the shared project workspace tabs
```

## What is stubbed, and what replaces it

| Stubbed | In production |
|---|---|
| Email | Written to the `emails` send record (Email Log). `notificationService.js` sends it through Resend. |
| Verification email | Shown on screen. Firebase Authentication sends it; passwords are not stored locally. |
| File upload | File name and size are recorded, no binary. Firebase Cloud Storage holds the PDF. |
| AI summary | A labelled placeholder (one seeded summary shows the real structure). The Gemini call is audit-logged. |
| Digital signature | Name, role and timestamp against the form, in signing order. |
| PDF annotation | Location is typed (`p. 14 · Sampling`); the wireframe's in-PDF highlight tool replaces it. |
| Version comparison | Compares what each version declared and what came back on it; no PDF text diff. |

## Switching to Firebase

The service layer never touches Firestore directly — it goes through a repository with two
interchangeable adapters.

```bash
cp .env.example .env          # fill in the web app config
VITE_BACKEND=firebase npm run dev
```

Against the emulator:

```bash
npm i -g firebase-tools
firebase emulators:start
VITE_USE_EMULATORS=true VITE_BACKEND=firebase npm run dev
```

`firestore.rules` follows the split in the Review of Related Literature: **writes go only through
Cloud Functions**, and **reads are decided by the rules** using the caller's CAAC claims, which is
what lets the app use real-time listeners. The rules mirror the `project.view` policies in
`src/domain/caac.js` — keep the two in step.

---

## Decisions the prototype had to make

These are open in the knowledge base (`Open Questions.md`). Each is isolated so it is cheap to
reverse, and each is worth settling in the manuscript.

1. **CAAC read path (#1).** Writes through Cloud Functions, reads through CAAC-aware rules. The
   manuscript's "all CRUD through Cloud Functions" and "deny direct client access" sentences
   need rewording to match.
2. **AI-summary audience (#2).** Panel Chair, Panel Members, Adviser and the group can read it.
3. **Panel-note visibility (#3).** Private notes are released to the group when the Panel Chair
   records the verdict.
4. **Account verification (#4).** Self-verification through the email approval button; the System
   Administrator grants Global Roles and can suspend accounts.
5. **Who assigns Instructor 1 and 2 (#5).** The System Administrator (`instructor.assign`).
   Instructor 1 is assigned per Capstone 1 block (the `sections` collection): the block's instructor
   creates its groups and becomes Instructor 1 on each, and reassigning the block moves groups still
   in Capstone 1. Instructor 2 is assigned per project from Proposal Revision onward. The Program
   Chair/Coordinator assigns the Adviser and Panel. Assignments are recorded as Accepted.
6. **Adviser approval.** Either the Dean or the Associate Dean may approve, never their own
   assignment. Both sign the Approval Sheet at the end.
7. **Stage enum (#9).** Adviser Assignment precedes ideation, per the process.
8. **Verdicts (#10).** Minor revisions, major revisions, re-defense — no plain "Passed" or "Failed".
9. **Block and year level (#11).** Students carry `block` and `yearLevel`; blocks live in a
   `sections` collection that is not in the 17-entity ERD.
10. **Entity → collection mapping (#8).** Documented at the top of `src/backend/schema.js`.
11. **Wireframe vs. manuscript.** S-14 has the Associate Dean review the panel assignment and
    schedule before anyone is notified; the manuscript gives the Associate Dean no such step, so
    the prototype publishes the panel and schedule directly. S-12 also lists "Endorse for final
    approval · cleared by URO" for the Coordinator; the manuscript puts the Coordinator's
    endorsement *before* the URO, which the prototype follows. Worth settling in both places.

Seed data uses the real names recorded for Instructor 1, the Program Coordinator and the Dean.
Every other name is invented filler — edit `src/backend/seed.js` before any demo outside the team.
