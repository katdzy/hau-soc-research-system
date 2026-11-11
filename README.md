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
npm install
npm run dev:local     # in-browser store: no Firebase, credentials or network
```

Open http://localhost:5180. `npm run dev` follows `.env` instead, which may point at the live
Firebase project. The app **starts empty** (decision 2026-11-02): there are no pre-made groups,
students, faculty, panels or admins. Accounts come from registration or from the test panel.

## Signing in

- **Register / sign in** — domain-restricted to `@hau.edu.ph` and `@student.hau.edu.ph`.
  Registering sends a verification email (in the local build it lands in the test panel's
  Outbox); the account stays Inactive until it is approved. Student addresses receive the
  Student role; faculty addresses start with no Global Role. There is no OTP step.
- **Test panel** (dev builds only) — the floating bubble on every screen, sign-in included.
  **Spawn** makes sections, students, groups, faculty and office holders; **People** signs in
  as any of them and lands on their next step; **Stage** jumps a group to any stage (not on a
  live project).

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

---

## A walkthrough

Open the test panel → **Spawn** → the starter set, then follow one group. Each step is one
sign-in from **People**; the dashboard's worklist shows what that account owes.

| # | Sign in as | Do this | What it shows |
|---|---|---|---|
| 1 | A student | Draft a group, invite classmates, submit it | Students draft; Instructor 1 approves or returns |
| 2 | The section's Instructor 1 | Approve the group → **Forward roster** | Authority comes from teaching the section |
| 3 | Program Chair/Coordinator | Assign an Adviser → route for approval | Blocked until an Adviser exists |
| 4 | Dean and Associate Dean | Approve the adviser assignment | Nobody approves an assignment that names themselves |
| 5 | A group member | Documents → Topic Proposal, Concept Paper, Proposal Manuscript | Every upload is a new immutable version |
| 6 | Adviser, then Instructor 1 | Review, annotate, approve for proposal defense | Annotations sit over the PDF; the file is never changed |
| 7 | Program Chair/Coordinator | Assign the panel → publish the schedule | The Adviser cannot sit on their own group's panel |
| 8 | Panel Member, Panel Chair | Read the latest version → **Record verdict** | Private notes stay hidden until the verdict |
| 9 | Instructor 2, Adviser | Weekly logs, milestones, FM-AAC-SOC-2005 | Same person, different role per project |
| 10 | University Research Office | Verify the certificates | URO comes before the Dean |
| 11 | Dean and Associate Dean | Final approval | The project is archived with a Pass result |
| 12 | System Administrator | Audit trail, Administration | Opens project records, never documents |

The §7 scenarios (T1–T21) run on a fixed fixture, the §6 test personas in
`src/backend/seed.js`, through `npm test`. The app itself never loads that fixture.

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
- Forms (FM-AAC-SOC-2004, FM-AAC-SOC-2005, the Approval Sheet) are signed **outside the system**
  (revision 2026-10-30): each signatory uploads their signed copy, in the order set in
  `src/domain/forms.js`. Blank forms are on the `/forms` page.
- AI summaries (Gemini Flash) are generated automatically when a defense is scheduled, for the
  complete manuscript only, and always carry the AI disclosure label.
- Cleared projects go to a **records-table archive**. The Dean and Associate Dean see the full
  record; every other signed-in account browses the metadata only. There is no public gallery
  and no grade.

## How it is put together

```
src/domain/caac.js        CAAC policies and resolution: role × context → capability
src/domain/stages.js      the workflow — each stage's gate, its capability and its guard
src/domain/forms.js       form signing order
src/domain/constants.js   roles, verdicts, document types, official forms
src/services/actions.js   every state change: authorize → write → audit → notify
src/services/worklist.js  what each user owes the system right now
src/backend/              swappable data layer (local ↔ Firestore) + the test fixture
src/components/panels/    the project workspace tabs
src/dev/                  the test panel (dev builds only)
```

The workflow is data: the worklist, timeline, "Next step" panel and blocked-step messages all
render from `stages.js`, and every permission check reads `caac.js`. Changing the process or a
policy after adviser feedback means editing one file.

## What is stubbed, and what replaces it

| Stubbed | In production |
|---|---|
| Email | The notification channel — desktop has no in-app notification list (team decision 2026-09-29); phones and tablets have one, the bell in the top bar, listing the same emails (decided 2026-11-07, flag `IN_APP_NOTIFICATIONS`). The prototype records each email in the dev outbox; the Firebase build sends it through Resend. |
| Device notifications | Revision 2026-10-07 (flag `DEVICE_NOTIFICATIONS`): each email also shows as a phone/desktop notification for recipients who turned them on in the account menu — the same event and text. In production one Cloud Function, `deliverOutbox` (`functions/`, not deployed — needs the Blaze plan), sends each outbox entry as the email (Resend) and the push (FCM); devices register through `registerPushToken` and are removed on sign-out. Until push is configured, the open app shows them itself. iOS needs the app on the Home Screen (16.4+). |
| Verification email | Recorded in the test panel's Outbox locally. Firebase Authentication sends it; passwords are not stored locally. |
| File upload | The PDF is kept in the browser (IndexedDB). Firebase Cloud Storage holds it in the Firebase build. |
| AI summary | A labelled placeholder unless `VITE_GEMINI_API_KEY` is set on a dev server; the Gemini call is audit-logged. Production builds never carry the key, and on the server (`act`) it is always the placeholder. |

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
`demo-local`), so it never touches the live project. Source is mounted, so edits hot-reload.
Dependencies live in Docker volumes and reinstall on their own when `package.json` or a lock
file changes; rerun `docker compose up --build` only after changing a Dockerfile.
Emulator data is saved to `.emulator-data/` on a clean stop (`docker compose down` or Ctrl+C)
and reloaded next time; delete the folder to start empty again.

**On another PC (Windows, macOS or Linux)** — the only thing to install is
[Docker Desktop](https://www.docker.com/products/docker-desktop/) (on Windows, with the WSL 2
backend). No Node, no firebase CLI, no `.env`:

```bash
git clone <repo> && cd hau-soc-research-system
docker compose up --build    # first start builds the images: several minutes
```

Then open http://localhost:5180 (Emulator UI: http://localhost:4000). Other machines on the
same network can open `http://<this PC's IP>:5180`; the app finds the emulators on whichever
host served the page. Uploads need a secure context, though, so test file uploads on the PC
running Docker (localhost).

If something is off:

- **A port is "not available" / "access forbidden" (Windows).** Hyper-V reserves port ranges
  that can include 4000–9199. `netsh interface ipv4 show excludedportrange protocol=tcp`
  lists them; restarting Windows (or `net stop winnat` then `net start winnat` as
  administrator) usually frees them. Another program on 5180, 4000, 8080, 9099, 9199 or 5001
  causes the same error.
- **"The server did not answer"** — `docker compose ps` should list `emulators` as healthy;
  `docker compose logs emulators` shows why it is not.
- **Start completely over** (images, dependencies, emulator data):
  `docker compose down -v`, delete `.emulator-data/`, then `docker compose up --build`.
- Clone outside OneDrive-synced folders; on Windows, a clone inside the WSL file system
  (`\\wsl$\…`) also starts and hot-reloads noticeably faster than one on `C:\`.

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
   Chair/Coordinator sets up each section and names its instructor (Sections page, revision
   2026-11-07) and assigns Instructor 2. Assignments are recorded as Accepted.
6. **Adviser approval.** The Dean and the Associate Dean both approve, in any order (flag
   `ADVISER_APPROVAL`), never their own assignment.
7. **Stage enum (#9).** Adviser Assignment precedes ideation, per the process.
8. **Verdicts (#10).** Minor revisions, major revisions, re-defense — no plain "Passed" or "Failed".
9. **Block and year level (#11).** Students carry `block` and `yearLevel`; blocks live in a
   `sections` collection that is not in the 17-entity ERD.
10. **Entity → collection mapping (#8).** Documented at the top of `src/backend/schema.js`.

Where this list and `docs/WORKFLOWS.md` disagree, `WORKFLOWS.md` is the source of truth.
