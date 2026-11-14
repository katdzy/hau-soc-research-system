# HAU-SOC Thesis & Capstone Workflow System

The working system for **Development of a Web-Based Thesis and Capstone Project Management and
Workflow Automation System for HAU-SOC** (Holy Angel University, School of Computing).

Its job is to make the *workflow and its access control* testable end to end: sign in as any
role, push a project through the whole life cycle, and watch Context-Aware Access Control
(CAAC), the worklists, the emails and the audit trail respond.

React 18 + Vite 5, plain JavaScript/JSX, Firebase (Auth, Firestore, Cloud Storage, Cloud
Functions, FCM) behind a swappable backend, installable as a PWA.

> **Before you change anything, read [`GUIDE.md`](GUIDE.md).** The project runs on a paid
> Firebase plan and paid APIs. That file holds the cost, secrets, deploy and live-project
> rules, for people and AI assistants alike. Nobody runs `firebase deploy` without the team.

---

## Quick start

No Firebase, no credentials, no network:

```bash
npm install
npm run dev:local
```

Open http://localhost:5180. The app **starts empty**: there are no pre-made groups, students,
faculty or office holders. Make them with the test panel (below) or by registering.

`npm run dev` follows `.env` instead, and **`.env` may point at the live Firebase project**.
Use `dev:local` or Docker unless you mean to touch live data.

## Ways to run it

| Command | Backend | Use for |
|---|---|---|
| `npm run dev:local` | In-browser store (`.env.offline`), saved to `localStorage` | Quick offline work |
| `docker compose up` | Firebase Emulator Suite, project `demo-local` | Functions, rules, triggers; the normal dev setup |
| `docker compose -f docker-compose.live.yml up -d` | The live project named in `.env` | Browser checks with the dummy accounts only |
| `npm test` | Local store (pinned in `vite.config.js`) | All automated checks |

Both compose files use port 5180 and the same container: run `docker compose down` before
switching between them.

### Docker (recommended)

The only thing to install is [Docker Desktop](https://www.docker.com/products/docker-desktop/)
(on Windows, with the WSL 2 backend). No Node, no Firebase CLI, no `.env`.

```bash
git clone https://github.com/katdzy/hau-soc-research-system.git
cd hau-soc-research-system
git checkout dev
docker compose up --build      # the first build takes several minutes
```

| Service | What it runs | URL |
|---|---|---|
| `app` | Vite dev server, hot reload | http://localhost:5180 |
| `emulators` | Auth, Firestore, Storage, Functions | http://localhost:4000 (Emulator UI) |
| `functions-build` | Rebuilds the `act` bundle (`functions/lib/app.js`) when a source file changes | — |

- Compose overrides `.env`, so this stack never reaches the live project.
- Every write goes through the **`act` Cloud Function** on the Functions emulator, as it will
  in production. `APP_WRITE_PATH=direct docker compose up` makes the browser write itself.
- The emulators load the open rules in `emulator/`. `FIREBASE_CONFIG=firebase.json docker
  compose up` loads the real `firestore.rules` and `storage.rules` instead.
- `APP_BACKEND=local docker compose up` runs the in-browser store inside Docker.
- `deliverOutbox` sends no email or push on the emulators.
- Emulator data is saved to `.emulator-data/` on a clean stop and reloaded next time. Delete
  the folder to start empty. `docker compose down -v` also clears the dependency volumes.

Ports, Windows notes and troubleshooting: [`docs/DOCKER_GUIDE.md`](docs/DOCKER_GUIDE.md).
Command cheat sheet: [`docs/DOCKER_COMMANDS.md`](docs/DOCKER_COMMANDS.md).

### Without Docker

```bash
npm i -g firebase-tools
firebase emulators:start
VITE_USE_EMULATORS=true VITE_BACKEND=firebase npm run dev
```

`.env.example` lists every variable. `VITE_WRITE_PATH` picks where writes go: `functions` (the
`act` function) or `direct` (the browser writes to Firestore). Empty means `functions` on the
emulators and `direct` on a live project. There is no automatic fallback between them.

---

## Signing in

- **Register** — limited to `@hau.edu.ph` and `@student.hau.edu.ph`. Registration sends a
  verification email (on the local store it lands in the test panel's Outbox), and verifying
  activates the account. Student addresses get the Student role; faculty addresses start as
  Faculty with no Global Role until the System Administrator grants one. There is no OTP.
- **Test panel** (dev builds only) — the floating bubble on every screen, sign-in included;
  `` ` `` toggles it.

| Tab | What it does |
|---|---|
| People | Sign in as anyone and land on their next step |
| Spawn | Make sections, students, groups, faculty and office holders |
| Stage | Jump a group to any stage, with plausible prerequisite data |
| Outbox | Every email the system recorded |
| Trail | The audit trail and workflow history |
| Rules | The CAAC policies in force |

The panel also has checkpoints and a wipe. On a live project only People, Spawn, Outbox, Trail
and Rules show: People signs in as the dummy accounts in `src/dev/live-accounts.json`
(gitignored), and Spawn changes dummy data only.

Every test account carries `demo: true` and is never emailed directly.

---

## CAAC, not RBAC

Under RBAC a role carries a fixed set of permissions. Here **no role carries a permission on its
own**. Every permission is a *policy*: a role, a capability, and the context it applies in. A
capability is granted only when all three hold.

| Context | Example |
|---|---|
| Relationship to the project | A Student submits only to the group they belong to |
| Workflow stage | A Panel Chair records a verdict only at the Proposal or Final Defense |
| Program scope | A Program Chair/Coordinator acts only on projects in the programs they coordinate |
| Conflict of interest | Nobody approves an adviser assignment that names themself |
| Phase | Instructor 1 authority ends when the group moves to Capstone 2 |

Roles have two dimensions:

- **Global Roles** — Student, Dean, Associate Dean, Program Chair/Coordinator, University
  Research Office, System Administrator. A user can hold several, or none.
- **Project-Based Roles** — Instructor 1, Instructor 2, Adviser, Panel Member, Panel Chair. Held
  per project, so one person can hold different roles on different projects.

Someone who holds several roles switches between them with the **"Acting as"** menu; each
context has its own rail and desk. The **CAAC Inspector** beside every project lists what each
of your roles grants on *this* project at *this* stage, and why a denied action is denied.

Every state change passes one guard on the service side. Hiding a button is never the only
check: the call itself is refused.

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

- **Groups:** students draft their own group, invite classmates from their section and submit
  it once it is full; the section's Instructor 1 approves or returns it. Instructor 1 can also
  create a group directly. Program Chairs/Coordinators set up sections and name who teaches each.
- **Adviser approval:** the Dean and the Associate Dean both approve, in any order. Either can
  return the assignment to the Program Chair/Coordinator with remarks.
- **Documents** are immutable: a new upload is a new version and the old one becomes
  Superseded. Reviewers annotate over the PDF; the file itself is never changed.
- **Panels** see only the latest version. Private panel notes stay hidden until the Panel Chair
  records the verdict. The Adviser cannot sit on their own group's panel.
- **Verdicts:** Passed with Minor Revisions (7 days), Passed with Major Revisions (14 days) or
  Re-defense. The System Administrator can change the periods. Overdue revisions are flagged.
- **Forms are signed outside the system** (FM-AAC-SOC-2004, FM-AAC-SOC-2005, the Approval
  Sheet): each signatory downloads the latest copy, signs it, and uploads the signed PDF or
  scan, in the order set in `src/domain/forms.js`. Weekly logs (FM-AAC-SOC-2003) are uploaded
  and the Adviser marks them reviewed. Blank forms are on the `/forms` page.
- **AI summary** (Gemini) of the manuscript is made when a defense is scheduled and always
  carries the AI disclosure label. The Adviser and the panel can read it.
- **Clearance:** the URO verifies the certificates (or returns them to the group) before the
  Dean and the Associate Dean give final approval.
- **Archive:** cleared projects go to a records table. The Dean and Associate Dean see the full
  record; every other signed-in account browses the metadata only. There is no public gallery
  and no grading.

### A walkthrough

Open the test panel → **Spawn** → the starter set, then follow one group. Each row is one
sign-in from **People**; the dashboard's worklist shows what that account owes.

| # | Sign in as | Do this | What it shows |
|---|---|---|---|
| 1 | A student | Draft a group, invite classmates, submit it | Students draft; Instructor 1 approves or returns |
| 2 | The section's Instructor 1 | Approve the group → **Forward roster** | Authority comes from teaching the section |
| 3 | Program Chair/Coordinator | Assign an Adviser → route for approval | Blocked until an Adviser is named |
| 4 | Dean and Associate Dean | Approve the adviser assignment | Nobody approves an assignment that names themself |
| 5 | A group member | Documents → Topic Proposal, Concept Paper, Proposal Manuscript | Every upload is a new immutable version |
| 6 | Adviser, then Instructor 1 | Review, annotate, approve for the proposal defense | Annotations sit over the PDF |
| 7 | Program Chair/Coordinator | Assign the panel → publish the schedule | The Adviser cannot sit on the panel |
| 8 | Panel Member, Panel Chair | Read the latest version → **Record verdict** | Private notes stay hidden until the verdict |
| 9 | Instructor 2, Adviser | Weekly logs, milestones, FM-AAC-SOC-2005 | Same person, different role per project |
| 10 | University Research Office | Verify the certificates | The URO comes before the Dean |
| 11 | Dean and Associate Dean | Final approval | The project is archived with a Pass result |
| 12 | System Administrator | Audit log, accounts, role configuration | Opens project records, never documents |

On the live project the Stage tab is off, so later stages are covered by `npm test` or the
emulator stack. Per-role test prompts are in [`docs/ROLE_TEST_PROMPTS.md`](docs/ROLE_TEST_PROMPTS.md);
reports go to `test-reports/`.

---

## Notifications and devices

- **Email is the notification channel.** Each event is recorded once in the `outbox`
  collection; the `deliverOutbox` function sends it through Resend and, for devices that
  opted in, as a push through FCM. A device notification shows only a neutral line, never the
  email's text.
- **Phones and tablets** also get a bell in the top bar listing the same emails. Desktop has
  neither the bell nor device notifications.
- **Phones and portrait tablets are view only.** A banner says so, and every control that
  writes is removed and refused.
- **PWA:** the app installs to the Home Screen (iOS 16.4+ for notifications). The service
  worker is off in dev; to test it, run `VITE_BACKEND=local npm run build`, then preview on
  port 4173. Updates wait for the user's Reload.

---

## How it is put together

The workflow and the permission model are **data**; the UI renders from them. The worklist,
timeline, "Next step" bar and blocked-step messages all come from `stages.js`, and every
permission check reads `caac.js`. Changing the process or a policy means editing one file.

```
src/domain/          rules, no I/O
  caac.js              policies and resolution: role × capability × context
  guard.js             the one guard: canView, canDo, viewBundle (the read-side filter)
  stages.js            the stage machine: each stage's gates, capability and preconditions
  flags.js             every open choice and team decision, with where each is wired
  forms.js             official forms and signing order
  settings.js          admin-editable values (revision periods, …)
  workspaces.js        "Acting as" contexts and their rail
  uploads.js           file checks before upload
src/services/        the write path
  actions.js           every state change: authorize → transaction → audit → notify
  api.js               what components import; routes calls to actions.js or the `act` function
  core.js              builds the per-project bundle CAAC reads
  worklist.js          what each user owes right now
src/backend/         swappable repository (local store ↔ Firestore), file storage,
                     and the test fixtures (seed.js, npcs.js, stageBuilder.js)
src/components/      shell, dialogs, PDF viewer, project workspace panels
src/pages/           dashboards (desks), work views, admin, records, reports, sections
src/dev/             the test panel (dev builds only)
functions/           Cloud Functions: act, deliverOutbox, push tokens, claims sync, overdueRevisions
scripts/             dummy documents, PWA icons, live dummy-account tools, functions build
rules-tests/         rules, claims-trigger and `act` tests against the emulators
```

### Writes and reads

- **Writes:** in the Firebase build, each call in `services/remote.js` goes to the `act` Cloud
  Function, which runs the same `actions.js` as the signed-in caller inside one Firestore
  transaction. `firestore.rules` refuses writes from the browser. Uploaded PDFs are checked in
  the browser, stored, then verified by `act` before the version is recorded.
- **Reads:** Firestore Security Rules decide them from custom claims that mirror CAAC, which is
  what lets the app use real-time listeners. `firestore.rules` mirrors the `project.view`
  policies in `caac.js`, and `storage.rules` copies the upload types each stage accepts; tests
  fail when they drift.

### Current deployment state

- **The Cloud Functions are not deployed.** The live project runs on the `direct` write path,
  so the guard runs in the browser only there.
- **AI summary:** a labelled placeholder unless `VITE_GEMINI_API_KEY` is set on a dev server.
  Production builds never carry the key; on the server it is always the placeholder until the
  call moves into `act`.
- App Check is not set up yet.

The full list of known gaps is in `GUIDE.md` §9.

---

## Commands

```bash
npm install
npm run dev               # http://localhost:5180, follows .env (may be live)
npm run dev:local         # in-browser store, no Firebase
npm test                  # Vitest: CAAC scenarios T1–T21 and service tests (src/__tests__)
npm run test:rules        # storage.rules + claims sync, against running emulators
npm run test:triggers     # claims triggers on the Functions emulator (throwaway container)
npm run test:act          # writes through `act` under the real rules (throwaway container)
npm run build:functions   # bundle src/services for `act` → functions/lib/app.js
npm run build
npm run preview
```

Tools in `scripts/`:

```bash
node scripts/dummy-docs/generate.mjs        # dummy manuscripts, forms, certificates (needs Chrome)
node scripts/pwa-icons/generate.mjs         # re-render the PWA icons (needs Chrome)
node scripts/live-spawn/spawn-live.mjs starter   # dummy accounts on the LIVE project
node scripts/live-seed/unseed-live.mjs      # remove test-fixture records from the LIVE project
```

The two live scripts are dry runs until `--confirm-live`. Ask the team before running either
for real.

No linter or formatter is configured; match the surrounding code.

---

## Documentation

| File | What it decides |
|---|---|
| [`GUIDE.md`](GUIDE.md) | Cost, secrets, deploys, live-project rules |
| [`docs/WORKFLOWS.md`](docs/WORKFLOWS.md) | Roles, stages, permissions, cross-role behavior, what is out of scope (§9). Wins over this README and the code |
| [`src/domain/flags.js`](src/domain/flags.js) | Every open choice: team decisions and mockup defaults, with sources |
| [`CLAUDE.md`](CLAUDE.md) | Architecture, invariants and how to verify a change |
| [`docs/DOCKER_GUIDE.md`](docs/DOCKER_GUIDE.md) | Running and testing with Docker, Windows notes, troubleshooting |
| [`docs/DOCKER_COMMANDS.md`](docs/DOCKER_COMMANDS.md) | Docker command reference |
| [`docs/ROLE_TEST_PROMPTS.md`](docs/ROLE_TEST_PROMPTS.md) | Per-role test prompts |

**Out of scope** (never build): OTP, a public gallery, grading or rubrics, chat, Kanban,
in-app editing, video uploads, evaluation-form screens.
