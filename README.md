# HAU-SOC Thesis & Capstone Workflow System — Prototype

A working prototype of the **Development of a Web-Based Thesis and Capstone Project Management
and Workflow Automation System for HAU-SOC** (Holy Angel University, School of Computing).

The point of this build is to make the *workflow and its access control* testable end to end:
sign in as anyone, move a project through the whole life cycle, and watch Context-Aware Access
Control (CAAC), notifications and the audit trail respond. It follows the finalized proposal
manuscript and the Capstone 2 knowledge base.

---

## Running it

```bash
npm install && npm run dev
```

Open http://localhost:5180. No Firebase project, credentials or network are needed — the
default backend stores everything in the browser. Demo data loads on first run and can be
restored from **Administration → Reset demo data**.

## Signing in

- **Register / sign in** — domain-restricted to `@hau.edu.ph` and `@student.hau.edu.ph`.
  Registering sends a verification email with an approval button (shown on screen in the
  prototype); the account stays Inactive until it is approved. Student addresses receive the
  Student role; faculty addresses start with no Global Role. There is no OTP step.
- **Demo accounts** — one click, no password. Each is labelled with the roles it actually holds.

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
| **Dr. Marlon I. Tayag** | Dean · Adviser on Group 2 | Sees Group 2 at Adviser Approval but cannot approve it — he is the Adviser being approved |
| **Engr. Marites C. Bondoc** | No Global Role · Adviser on one project, Panel Member on another | Full version history on one; latest version only and private notes on the other |
| **Mr. Chris Almocera** | Program Chair/Coordinator (IT programs) · Adviser on the IoT project | Both dimensions grant on the same project; reports are scoped to his programs |
| **Asst. Prof. Espinosa** | No Global Role · teaches block WD-4A | Can create groups; loses access to a project once it moves to Capstone 2 |
| **Ms. Evelyn R. Castro** | University Research Office | Sees a project only while it is at URO Verification |

---

## A walkthrough

Group 5 starts at Group Formation. Each row is one sign-in and the step on its worklist.

| # | Sign in as | Do this | What it shows |
|---|---|---|---|
| 1 | Espinosa (Instructor 1) | Group 5 → **Forward roster** | Instructors form groups; students don't |
| 2 | Almocera (Coordinator) | Assign an Adviser → **Route for approval** | Blocked until an Adviser exists |
| 3 | Tayag or Rivera | **Approve adviser assignment** | Advisers are in place before ideation; no self-approval |
| 4 | Karl Dungca (Student) | Documents → submit a Topic Proposal and a Concept Paper | Every upload is a new immutable version |
| 5 | Espinosa | Approve both → **Register the approved topic** | The topic becomes the title; the old one is kept |
| 6 | Karl → the Adviser → Espinosa | Proposal Manuscript → Adviser approves → **Approve for proposal defense** | Adviser reviews; Instructor 1 gates the defense |
| 7 | Almocera | Assign Panel Chair and Members → confirm → Defense tab → **Publish schedule** | The Adviser is disabled in the panel picker; the AI summary is generated |
| 8 | Bondoc, on *Smart Queue* | Documents | Latest version only; the Chair's private note is withheld |
| 9 | Dr. Santos (Panel Chair) | Defense → **Record verdict** | Only the Chair can; FM-AAC-SOC-2004 issued, countdown starts, notes released |
| 10 | Lazaro (Instructor 2), on the IoT project | Weekly logs → **Confirm milestones** | The Adviser's recommendation waits for this |
| 11 | Almocera (Adviser there) | Approve the week 3 log → **Submit FM-AAC-SOC-2005** | Same person, acting through his project role |
| 12 | Castro (URO), on *Sentiment Analysis* | **Verify certificates and sign** | URO comes before the Dean |
| 13 | Tayag and Rivera | **Sign the Approval Sheet** | The second signature archives the project with a Pass result |
| 14 | Reyes (System Administrator) | Audit trail, Administration, Records archive | Every step, attributed; tag assignments and policies |

Six projects are seeded at different stages:

| Project | Parked at |
|---|---|
| Untitled — Group 5 (WD-4A) | Group Formation — walk the whole life cycle |
| Untitled — Group 2 (WD-4A) | Adviser Approval — the Dean-as-Adviser conflict |
| Smart Queue Management System | Proposal Defense — private notes, verdict, revision |
| IoT-Based Laboratory Equipment Tracking | Implementation — weekly logs, milestones, FM-AAC-SOC-2005 |
| Automated Student Feedback Sentiment Analysis | URO Verification — clearance, signatures, archiving |
| Barangay Health Records Digitisation Platform | Archived — records archive |

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
  returns the project to scheduling.
- FM-AAC-SOC-2004 is signed Panel Chair → Adviser → Panel Members. The Approval Sheet is signed
  Adviser → Panel → Program Chair/Coordinator → URO → Dean and Associate Dean.
- AI summaries (Gemini Flash) are generated automatically when a defense is scheduled, for the
  complete manuscript only, and always carry the AI disclosure label.
- Cleared projects go to a **records-table archive** searchable by the Dean and Associate Dean.
  There is no public gallery and no grade.

## How it is put together

```
src/domain/caac.js        CAAC policies and resolution: role × context → capability
src/domain/stages.js      the workflow — each stage's gate, its capability and its guard
src/domain/forms.js       form signing order
src/domain/constants.js   roles, verdicts, document types, official forms
src/services/actions.js   every state change: authorize → write → audit → notify
src/services/worklist.js  what each user owes the system right now
src/backend/              swappable data layer (local ↔ Firestore) + demo seed
src/components/panels/    the six workspace tabs
```

The workflow is data: the worklist, timeline, "Next step" panel and blocked-step messages all
render from `stages.js`, and every permission check reads `caac.js`. Changing the process or a
policy after adviser feedback means editing one file.

## What is stubbed, and what replaces it

| Stubbed | In production |
|---|---|
| Email | The notification channel — there is no in-app notification list (team decision 2026-09-29). The prototype records each email in the dev outbox; the Firebase build sends it through Resend. |
| Device notifications | Revision 2026-10-07 (flag `DEVICE_NOTIFICATIONS`): each email also shows as a phone/desktop notification for recipients who turned them on in the account menu — the same event and text. In production one Cloud Function, `deliverOutbox` (`functions/`, not deployed — needs the Blaze plan), sends each outbox entry as the email (Resend) and the push (FCM); devices register through `registerPushToken` and are removed on sign-out. Until push is configured, the open app shows them itself. iOS needs the app on the Home Screen (16.4+). |
| Verification email | Shown on screen. Firebase Authentication sends it; passwords are not stored locally. |
| File upload | File name and size are recorded, no binary. Firebase Cloud Storage holds the PDF. |
| AI summary | A labelled placeholder (one seeded summary shows the real structure). The Gemini call is audit-logged. |
| Digital signature | Name, role and timestamp against the form, in signing order. |
| PDF annotation | Location is typed (`p. 14, Sampling`) rather than drawn on the page. |

## Switching to Firebase

The service layer never touches Firestore directly — it goes through a repository with two
interchangeable adapters.

```bash
cp .env.example .env          # fill in the web app config
VITE_BACKEND=firebase npm run dev
```

Against the emulator, with Docker (nothing else to install):

```bash
docker compose up          # app on :5180, Emulator UI on :4000
```

The app container ignores `.env` for the backend and points at the emulators (project
`demo-local`), so it never touches the live project. Source is mounted, so edits hot-reload;
rerun `docker compose up --build -V` only after changing `package.json` or a Dockerfile.
Emulator data is saved to `.emulator-data/` on a clean stop (`docker compose down` or Ctrl+C)
and reloaded next time; delete the folder to start from the seed again.

The emulators load the open rules in `emulator/` by default, because `firestore.rules` denies
every client write (writes belong to Cloud Functions, which do not exist yet). To exercise the
real rules: `FIREBASE_CONFIG=firebase.json docker compose up`. For the in-memory backend in
Docker: `APP_BACKEND=local docker compose up`.

Without Docker:

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
5. **Who assigns Instructor 1 and 2 (#5).** Instructor 1 comes from teaching the block (the
   `sections` collection) and is assigned automatically on group creation; the Program
   Chair/Coordinator assigns Instructor 2. Assignments are recorded as Accepted.
6. **Adviser approval.** Either the Dean or the Associate Dean may approve, never their own
   assignment. Both sign the Approval Sheet at the end.
7. **Stage enum (#9).** Adviser Assignment precedes ideation, per the process.
8. **Verdicts (#10).** Minor revisions, major revisions, re-defense — no plain "Passed" or "Failed".
9. **Block and year level (#11).** Students carry `block` and `yearLevel`; blocks live in a
   `sections` collection that is not in the 17-entity ERD.
10. **Entity → collection mapping (#8).** Documented at the top of `src/backend/schema.js`.

Seed data uses the real names recorded for Instructor 1, the Program Coordinator and the Dean.
Every other name is invented filler — edit `src/backend/seed.js` before any demo outside the team.
