# CLAUDE.md

Guidance for Claude Code (claude.ai/code) in this repository.

**Read `GUIDE.md` first.** It holds the cost, secrets, deploy and live-project rules, and it applies to every task.

## What this is

The HAU-SOC Thesis & Capstone workflow system: React 18 + Vite 5, plain JS/JSX (no TypeScript), Firebase behind a swappable backend. Its job is to make the **workflow and its Context-Aware Access Control (CAAC)** testable end to end: sign in as any role, push a project through the life cycle, and watch permissions, worklists, emails and the audit trail respond.

## Commands

```bash
npm install
npm run dev             # http://localhost:5180; follows .env, which may be the live project
npm run dev:local       # in-browser store (.env.offline): no Firebase, no emulators
npm test                # Vitest: guard tests for WORKFLOWS §7 T1–T21 + service tests (src/__tests__)
npm run test:rules      # storage.rules + claims sync, against the running emulators
npm run test:triggers   # claims triggers on the Functions emulator (throwaway container)
npm run test:act        # writes through `act` under the real rules (throwaway container)
npm run build:functions # bundle src/services for `act` → functions/lib/app.js (gitignored)
npm run build
npm run preview
node scripts/dummy-docs/generate.mjs      # dummy manuscripts, forms, certificates → test-fixtures/dummy-documents (needs Chrome)
node scripts/pwa-icons/generate.mjs       # re-render public/ PWA icons (needs Chrome)
node scripts/live-spawn/spawn-live.mjs starter   # dummy accounts on the LIVE project; dry run until --confirm-live
node scripts/live-seed/unseed-live.mjs    # remove the test fixture's records from the LIVE project; dry run until --confirm-live
```

No linter or formatter is configured; match the surrounding code.

## Environments

| Run | Backend | Use for |
| --- | --- | --- |
| `npm test` | local store (pinned in `vite.config.js`) | all automated checks |
| `npm run dev:local` | in-browser store, mirrored to `localStorage` `hausoc.db.v14` | offline work |
| `docker compose up` | Firebase Emulator Suite, project `demo-local` (UI on 4000) | functions, rules, triggers |
| `docker compose -f docker-compose.live.yml up` | the project in `.env` (live) | browser checks |

- **`.env` may point at the live Firebase project.** Vite loads it, so a host dev server talks to live data.
- **Browser checks use the Docker app** on port 5180 through the `capstone-docker` launch config, which attaches to the running container. Don't start host dev servers on other ports. The two compose files share the port and container: `docker compose down` before switching.
- The app **starts empty**. Accounts come from registration or the test panel's spawner.
- If you change the store shape, bump the `hausoc.db.v14` key; stale browser data otherwise masks the change.
- On the emulators the open rules in `emulator/` load (the real `firestore.rules` deny client writes; `FIREBASE_CONFIG=firebase.json` loads them), `deliverOutbox` sends nothing, and data persists in `.emulator-data/`. More in `docs/DOCKER_GUIDE.md` and `docs/DOCKER_COMMANDS.md`.
- **PWA:** the service worker is off in dev. To test it, `VITE_BACKEND=local npm run build`, then the `capstone-pwa-preview` launch config (port 4173). It precaches the app shell only; updates wait for the user's Reload.

## Verifying a change

1. `npm test`.
2. In the Docker app, use the **test panel** (floating bubble on every screen, `` ` `` toggles): sign in as the dummy accounts, spawn people and groups, read the outbox and audit trail.
3. On a live project the panel has no Stage tab, checkpoints or wipe. Cases that need a group at a later stage are covered by `npm test`, or by the emulator stack where the Stage tab works.

## Source of truth

- **`docs/WORKFLOWS.md`** decides roles, stages, permissions and cross-role behavior. Where the README or current code disagree with it, follow `WORKFLOWS.md`.
- **`src/domain/flags.js`** holds every open choice. "Mockup default" entries are placeholders, not team decisions; `FLAG_NOTES` says where each is wired. Add new ones there, never as scattered constants.
- **Never build anything in `WORKFLOWS.md` §9** (out of scope): OTP, public gallery, grading/rubrics, chat, Kanban, in-app editing, video uploads, `EVALUATION_FORM` screens.
- Per-stage work follows the five checks in `WORKFLOWS.md` §1 (actor screen, CAAC guard, state change, reflection on other roles' screens, side effects) and the prompt template in §10. Per-role test prompts are in `docs/ROLE_TEST_PROMPTS.md`; reports go to `test-reports/`.

## Architecture

The workflow and the permission model are **data**; the UI renders from them.

### `src/domain/` — rules, no I/O

- **`caac.js` — permissions.** A policy is `role × capability × context condition` (`g(...)` for Global Roles, `p(...)` for Project-Based Roles). Conditions compose (`at(stage…)`, `from(stage)`, `during(phase…)`, `member`, `inScope`, `notTheAdviser`, `all(...)`) and describe themselves, so a denial names the condition that failed. `resolveContext(user, bundle)` gives one user's grants on one project at its stage; `resolveInstitution(user, snap)` does the same for non-project capabilities. Inactive or unverified accounts get no grants. `document.read` is separate from `project.view`. Permission overrides (`permissionOverrides`) can only remove a grant.
- **`guard.js` — the one guard.** `canView(user, bundle)`, `canDo(user, action, bundle, target)`; `ACTIONS` maps each action (and each stage gate) to its capability and allowed document states. `viewBundle(user, bundle)` is the read-side filter: the UI renders from it, never from a raw bundle. `allowedDocTypes(stage)` says which uploads a stage accepts.
- **`stages.js` — the stage machine.** `STAGES` is ordered; each stage declares `gates` `{ action, capability, next, requires(bundle), handledIn?, signs?, done? }`. `next` may be a function, or `null` for a gate that records its effect without moving the stage. `handledIn` gates run from a tab, not `runGate`. Timeline, worklist, "Next step" and blocked-step messages derive from this file: change process order or a precondition here, not in components.
- **`forms.js`** (forms and signing order), **`settings.js`** (admin-editable values in `settings/global`, flag as fallback), **`uploads.js`** (PDF checks and fingerprint), **`workspaces.js`** ("Acting as" contexts and their rail), **`annotations.js`**, **`groupNames.js`**, **`constants.js`**.

### `src/services/` — the write path

Every state change in `actions.js` runs: `authorizeOn(actor, projectId, action, target)` (reads the session and store fresh; the `snap` a component passes is ignored) → `perform(key, fn)` (in-flight dedupe + one transaction) → `logAudit` + `logHistory` → `notify` (an email recorded in `outbox`). Stage moves go through `transition()`, which notifies whoever holds the next gate's capability, resolved through CAAC. `runGate()` executes gates. `core.js` builds the per-project **bundle** that CAAC and the stage guards consume. `worklist.js` computes what each user owes from CAAC + bundle.

**Components import service calls from `services/api.js`, never `actions.js`.** Locally it is `actions.js`. In the Firebase build, when `VITE_WRITE_PATH` is `functions`, each call listed in `services/remote.js` goes to the `act` Cloud Function as `{ name, args }`; `act` runs the same `actions.js` (bundled by `scripts/functions/build.mjs`) as the caller the ID token names, inside one Firestore transaction (`functions/app/store.js`). With `direct`, the browser writes to Firestore itself and the guard runs in the browser only; that is the path on the live project while `act` is not deployed. There is no automatic fallback.

A submitted PDF is uploaded by the browser after `checkSubmission`; `act` then verifies the stored object (`functions/app/files.js`) before recording it. `submitDocument` takes the `File` itself, never caller-supplied name, size or type.

### `src/backend/` — swappable repository

`index.js` picks `localAdapter` or `firebaseAdapter` from `VITE_BACKEND`; both expose the same surface (`subscribe`, `add`, `update`, `get`, `replaceAll`, …). **Services and components go through `db`, never Firestore directly.** `schema.js` lists the collections. `files.js` stores submitted bytes (IndexedDB locally, Cloud Storage on Firebase), write-once per version, read through `getBlob`. The only other Firebase touchpoints are `services/authService.js`, `services/push.js` (`call()` for callables) and `db.watch()` for a single document.

`seed.js`, `npcs.js` and `stageBuilder.js` are **test fixtures**: the automated tests, `src/dev/scenarios.js` and the dummy-docs generator use them; the app never loads the seed. `stageBuilder.js` puts a project at any stage with plausible prerequisite data.

### `functions/`

`index.js` exports `act`, `deliverOutbox` (each `outbox` entry → email through Resend + push through FCM), `registerPushToken` / `unregisterPushToken`, the custom-claims triggers and `refreshClaims`, and `overdueRevisions` (hourly). `claims.js` builds claims, `syncClaims.js` writes them, `mailRouting.js` decides who an email may reach. **The functions are not deployed.**

### UI

- `state/AppContext.jsx` subscribes to the adapter and exposes the snapshot (`snap`) and the signed-in user (`me`). Components call services with `(me, snap, …)` through `components/useAction.jsx`, which shows guard errors inline.
- **UI code checks capabilities, never role names.**
- `components/Shell.jsx` is the frame: rail, "Acting as" switcher, "Next step" bar, notification bell. `components/Workspace.jsx` keeps the selected context; `pages/Dashboard.jsx` picks the desk (`pages/dashboards/`); the rail's pages are in `pages/WorkViews.jsx`. Contexts are presentation only. A new rail entry needs its route in `App.jsx` (`workspaces.test.js` checks).
- `pages/ProjectWorkspace.jsx` hosts the tab panels in `components/panels/` and the `CaacInspector`.
- Step modals use `components/Dialog.jsx`. `components/ManuscriptViewer.jsx` renders PDFs with pdf.js and draws annotations as an overlay; positions are page fractions, so the file is never written to.
- Styling: `src/styles.css` with CSS variables; `pages.css` loads after it. Don't redefine a component's classes in `pages.css`.
- **Phones and portrait tablets are view only** (`PHONE_VIEW_ONLY`): `components/ViewOnly.jsx` shows a banner, `<Act>` drops every control that writes, and `useAction` refuses the call. **Wrap every new control that writes in `<Act>`.** It is a device rule, not CAAC.
- **Notifications are email.** Phones and tablets also get device notifications (`src/notifications.js`, `public/sw-notify.js`) and a bell listing the same outbox emails; desktop has neither. A device notification shows only the general line from `src/deviceNotice.js`. Per-browser support rules are in `src/browserSupport.js`.

### Dev tools — `src/dev/`

`TestPanel.jsx` loads only behind `import.meta.env.DEV`. Tabs: **People** (sign in as anyone), **Spawn** (`Spawner.jsx`, pure store transforms in `spawn.js`), **Stage** (jump a group to any stage), **Outbox**, **Trail**, **Rules**, plus checkpoints and wipe. On a live project only the tabs marked `onLive` in `TABS` show; People signs in as the dummy accounts in `src/dev/live-accounts.json` (gitignored), and Spawn posts its changes to the dev server's `/__live-spawn` (`scripts/live-spawn/devServer.mjs`), which accepts changes to dummy data only.

## Invariants

- **Every action passes the one guard** (global role + role on that project + stage). Hiding a button is not enough; the service call must refuse too.
- **Documents are immutable.** A new upload is a new `versionNumber`; the previous one becomes `Superseded`.
- **The audit log is append-only.**
- **Panel roles see only the latest document version.** Private panel annotations stay hidden until the Panel Chair records the verdict.
- **Forms are signed outside the system** (FM-AAC-SOC-2004, FM-AAC-SOC-2005, Approval Sheet), in the order in `src/domain/forms.js`: an 'upload' line takes the signatory's signed copy (PDF/JPG/PNG), a 'confirm' line is recorded in the system. Weekly logs (FM-AAC-SOC-2003) are uploaded files the Adviser marks reviewed.
- **The System Administrator opens project records but never documents.**
- **Test accounts are never emailed.** Seed personas, NPCs and spawned accounts carry `demo: true`; `deliverOutbox` sends their mail to `MAIL_REDIRECT_TO` or not at all. Keep `demo: true` on any test account you add.
- **Custom claims mirror `resolveContext`** (`claims.test.js` checks). `userId` in the claims is the `users` id, not the Auth uid, so rules compare owners with `me()`, never `request.auth.uid`.
- **`firestore.rules` mirrors the `project.view` policies in `caac.js`; `storage.rules` copies `allowedDocTypes()`.** Change them together (`storageRules.test.js` fails on drift).
- **Registration is limited to `@hau.edu.ph` / `@student.hau.edu.ph`** (`EMAIL_DOMAINS` in `constants.js`).
