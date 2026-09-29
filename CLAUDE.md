# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A clickable prototype of the HAU-SOC Thesis & Capstone workflow system (React 18 + Vite 5, plain JS/JSX, no TypeScript). Its job is to make the **workflow and its Context-Aware Access Control (CAAC)** testable end to end: sign in as any persona, push a project through the life cycle, and watch permissions, worklists, emails (dev outbox) and the audit trail respond.

## Commands

```bash
npm install
npm run dev        # http://localhost:5180 (port pinned in vite.config.js)
npm test           # Vitest: guard tests for §7 T1–T21 + service/write-path tests (src/__tests__)
npm run build
npm run preview
node scripts/dummy-docs/generate.mjs   # dummy manuscripts, forms and certificates → test-fixtures/dummy-documents (needs Chrome; macOS for TOC page numbers)
```

- **`.env` may point at the live Firebase project** (`VITE_BACKEND=firebase`). Vite and Vitest both load it. Tests are pinned to the local backend (`vite.config.js` `test.env`, `backend/index.js`); for browser checks use the `capstone-prototype-local` launch config (port 5181, `VITE_BACKEND=local`). Dev-tools resets refuse to run against a live project.
- No linter or formatter is configured. Beyond `npm test`, verify by running the app and walking the §7 scenarios in `docs/WORKFLOWS.md` — **Dev tools → Load scenario T#** sets each one up.
- Default backend is `local` (in-memory, mirrored to `localStorage` key `hausoc.db.v8`); seed data (§6 personas, G1–G4) loads on first run and can be restored from **Dev tools → Reset seed** (dev builds only). If you change the seed or the store shape, bump the key or reset — stale browser data will otherwise mask the change.
- Firebase: `cp .env.example .env`, then `VITE_BACKEND=firebase npm run dev`. Against emulators: `firebase emulators:start` + `VITE_USE_EMULATORS=true VITE_BACKEND=firebase npm run dev`.
- Docker: `docker compose up` runs the Vite app (5180) and the Firebase Emulator Suite (UI on 4000; Firestore 8080, Auth 9099, Functions 5001, Storage 9199).

## Workflow reference — source of truth

- `docs/WORKFLOWS.md` is the source of truth for roles, stages, permissions (CAAC) and cross-role behavior. Where the README's "Decisions the prototype had to make" or current code disagree with it, follow `WORKFLOWS.md`.
- **Every action must pass one guard** that checks the user's global role + their role on that project + the project stage (§2.2). Hiding a button is not enough — the service call must reject it too.
- Items marked **"Mockup default"** are placeholders, not team decisions. Each lives behind a named flag in `src/domain/flags.js` (with `FLAG_NOTES` saying where it is wired). Add new ones there rather than scattering constants.
- **Never build anything listed in §9** (obsolete / out of scope): e.g. OTP, public gallery, grading/rubrics, student-formed groups, chat, Kanban, in-app editing, video uploads, `EVALUATION_FORM` screens.
- The seed (`src/backend/seed.js`) uses the **§6 test personas** (Prof. Alpha … Admin Sierra, plus Prof. Foxtrot as G3's Panel Chair and Prof. Papa awaiting activation), groups G1–G4 and one ungrouped student. `src/backend/npcs.js` adds NPC students and faculty (`npc: true`) so every program has **three groups of four** (flag `GROUP_SIZE`): G1–G4 are topped up, and NW, EMC, CYB and CS get the rest. No §7 scenario depends on an NPC; tests that list a group's members read them from the store. `src/backend/stageBuilder.js` puts any project at any stage with plausible prerequisite data; the seed and the dev tools both use it.
- `docs/ROLE_TEST_PROMPTS.md` holds the per-role test prompts; reports go to `test-reports/`.
- Per-stage polishing follows the five checks in §1 (actor screen, CAAC guard, state change, reflection on other roles' screens, side effects) and the prompt template in §10.

## Architecture

The workflow and the permission model are **data**; the UI renders from them.

**`src/domain/caac.js` — permissions.** No role carries a permission on its own. Each policy is `role × capability × context condition` (`g(...)` for Global Roles, `p(...)` for Project-Based Roles). Conditions are composable (`at(stage…)`, `from(stage)`, `during(phase…)`, `member`, `inScope`, `notTheAdviser`, `all(...)`) and self-describing, so denials explain which condition failed.
- `resolveContext(user, bundle)` → `{ grants, active, dormant, projectRoles, … }` for one user on one project at its current stage. `resolveInstitution(user, snap)` does the same for non-project capabilities (group creation, reports, admin). Inactive or unverified accounts resolve to no grants.
- `document.read` is separate from `project.view`: the System Administrator opens project records (§2.2) but never documents.
- **Permission overrides** (flag `PERMISSION_OVERRIDES = 'deny-only'`, collection `permissionOverrides`): `evaluate()` drops a revoked capability into `dormant` with the override as the reason. An override can only remove a grant, never add one. Bundles carry `overrides` (this project + `projectId: null`).
- Admin-editable settings live in `settings/global`, read through `src/domain/settings.js` (e.g. `revisionDaysOf(snap)`, falling back to the flag).

**`src/domain/guard.js` — the one guard (§2.2).** `canView(user, bundle)` and `canDo(user, action, bundle, target)`; `ACTIONS` maps every action name (plus one per stage gate) to its capability and allowed document/log states; `allowedActions(hat, stage, docState)` generates the role hat × stage table. `viewBundle(user, bundle)` is the read-side filter — the UI renders from it, never from a raw bundle (latest-version-only for the panel, private notes per `canViewAnnotation`, AI summary per audience).
- `allowedDocTypes(stage)` controls which uploads each stage accepts.
- UI code checks **capabilities**, never role names.

**`src/domain/stages.js` — the stage machine.** `STAGES` is an ordered list; each stage declares `gates` with `{ action, capability, next, requires(bundle), handledIn?, signs?, done? }`. `next` may be a function (e.g. re-defense loops back to scheduling), or `null` for a gate that records its effect without moving the stage (S3.4 title registration); `done(bundle)` drops a completed gate from `openGates()`. `handledIn` gates run from a tab, not `runGate` (e.g. `APPROVE_CONCEPT_PAPER` fires when Instructor 1 approves the concept paper in `submitReview`). Timeline, worklist, "Next step" panel and blocked-step messages all derive from this file. Changing process order or a gate's precondition should be a change here, not in components.

**`src/services/` — the write path.** Every state change in `actions.js` follows: `authorizeOn(actor, projectId, action, target)` (reads the signed-in session and the store fresh — the `snap` components pass is ignored) → `perform(key, fn)` (in-flight dedupe + `db.transaction`, all-or-nothing) → `logAudit({ actorId, hat, before, after })` + `logHistory` → `notify` (email only — mock email in the `outbox` collection; there is no in-app notification inbox, by team decision). Stage moves go through `transition()`, which writes `workflowHistory` and notifies whoever holds the next gate's capability (resolved through CAAC, not a fixed role list). `runGate()` is the generic gate executor; gate-specific side effects are branches on `gate.action`. `core.js` builds the per-project **bundle** (project + members, assignments, documents, reviews, defenses, forms, history…) that both CAAC and stage guards consume. `worklist.js` computes "what each user owes right now" purely from CAAC + bundle.

**`src/backend/` — swappable repository.** `index.js` picks `localAdapter` or `firebaseAdapter` from `VITE_BACKEND`; both expose the same surface (`subscribe`, `add`, `update`, `get`, `replaceAll`, …). Services and components must go through `db`, never Firestore directly. `schema.js` lists collections and documents the manuscript-ERD → collection mapping. `files.js` keeps submitted PDF bytes (IndexedDB locally, Cloud Storage + `storage.rules` on Firebase), write-once per version; `sampleFiles.js` pairs seeded documents, which have no bytes, with the dummy PDFs in `test-fixtures/`. `authService.js` is the only other Firebase touchpoint (registration/login/email verification).

**`src/state/AppContext.jsx`** subscribes to the adapter and exposes the whole snapshot (`snap`, arrays per collection), the signed-in user `me`, and demo controls. Components call service functions with `(me, snap, …)`; `components/useAction.jsx` wraps calls so guard errors surface inline instead of throwing.

**Dev tools (R9).** `src/dev/` — the sign-in **demo panel** (`DemoPanel.jsx`: personas grouped by project cast, by role, and §7 scenarios by project; picking someone signs in straight onto the tab where their next step is, from `worklistRow`), the rail persona switcher, `/dev` page (scenario loader T1–T21, set stage, reset, overdue job, outbox, audit/history viewer, flags, allowedActions). Loaded only behind `import.meta.env.DEV`, so production builds drop it.

**Annotations.** `components/ManuscriptViewer.jsx` renders the PDF with pdf.js (legacy build, lazy-loaded) and draws annotations as an overlay; reviewers select words or drag an area. Positions are page fractions (`domain/annotations.js`), so the file is never written to; `addAnnotation` validates them.

**UI.** `pages/ProjectWorkspace.jsx` hosts the tab panels in `components/panels/` plus the `CaacInspector` (shows active vs dormant grants per role for the current project/stage). Styling is a single `src/styles.css` with CSS variables.

## Invariants to preserve

- Documents are immutable: a new upload is a new `versionNumber`; the previous one becomes `Superseded`. Never overwrite.
- Audit log is append-only.
- Panel roles see only the latest document version; private panel annotations stay hidden until the Panel Chair records the verdict.
- Forms (FM-AAC-SOC-2004, Approval Sheet) are signed in the order defined in `src/domain/forms.js`.
- `firestore.rules` mirrors the `project.view` policies in `caac.js` — keep them in step when changing visibility.
- Registration is restricted to `@hau.edu.ph` / `@student.hau.edu.ph` (`EMAIL_DOMAINS` in `constants.js`).
