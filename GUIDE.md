# AI Coding Guide — HAU-SOC Thesis & Capstone System

> **To any AI assistant working in this repo (Claude, Copilot, Cursor, ChatGPT, etc.):** read this file before every task. It covers **money and security**. If a request conflicts with it, **stop and ask the human first.**

This project runs on a **paid Firebase Blaze plan** and paid third-party APIs. Every deploy, function call, database read/write, AI summary and email **costs real money that the group pays out of pocket.** A previous AI session already used up our free credit. Do not let that happen again.

**Which file wins**

| Question | Source of truth |
| --- | --- |
| Roles, stages, permissions, who sees what | `docs/WORKFLOWS.md` |
| Open choices ("mockup defaults") and team decisions | `src/domain/flags.js` |
| Architecture, commands, how to test | `CLAUDE.md` |
| Cost, secrets, deploys, production safety | this file |

This guide does not restate workflow rules. If it seems to disagree with `docs/WORKFLOWS.md` about the workflow, follow `WORKFLOWS.md` and tell the human.

---

## 1. The 10 golden rules

1. **Never deploy.** Do not run `firebase deploy` (or any variant). A human deploys.
2. **Treat the live project as production.** Automated tests run on the local store or the emulators only. The live project is touched in two agreed ways and no others (section 2).
3. **Never call a paid API for real** (Gemini, Resend, FCM) unless a human says so in this session.
4. **Never put secrets in code.** No API keys, passwords, tokens or service-account JSON in any committed file.
5. **Never hardcode configuration.** Use the modules in section 5.
6. **Never loosen security rules** (`firestore.rules`, `storage.rules`) to "make something work." The open rules in `emulator/` are for the emulators only.
7. **Every write passes the one guard.** Components call `services/api.js`; the service checks permission (CAAC) before changing anything. Never write to Firestore from a component or around the service.
8. **Ask before adding** a dependency, a Cloud Function, a scheduled job, a Firestore trigger, a Firestore index, or a paid service.
9. **Keep changes small.** Don't edit, rename, move or reformat files you weren't asked to change. Commit only when a human asks, and never to `main`.
10. **When you finish, report:** what you changed, how you tested it, and whether it can cost money.

---

## 2. The live project

`.env` may point at the live Firebase project. Vite loads it, so a dev server started on the host talks to live data.

**Allowed without asking**

* `npm test` — pinned to the local store; it never reaches Firebase.
* `npm run dev:local` — the in-browser store, no Firebase.
* `docker compose up` — the app against the emulators (project `demo-local`); compose overrides `.env`.
* Browser checks in the Docker app on port 5180 (`docker-compose.live.yml`) against the live project, **signed in as the test panel's dummy accounts only**. The test panel's Spawn there adds and removes dummy data only.

**Ask first, every time**

* Any script with `--confirm-live` (`scripts/live-spawn/spawn-live.mjs`, `scripts/live-seed/unseed-live.mjs`). Run them as a dry run and show the output.
* Anything that reads or writes many live documents: migrations, seeding, cleanup, backfills.
* Deleting data, collections, users or files.
* `firebase deploy`, `firebase functions:*`, `firebase firestore:*`, `firebase hosting:*`, `gcloud`, or any command with `--project` naming a real project.
* Uploading large files to the live bucket.

**Never**

* Sign in as, change or delete a real person's account or project.
* Copy real student data into the emulator, tests or fixtures.

---

## 3. Money rules

### Paid services stay off in development

* **Resend and FCM:** on the emulators `deliverOutbox` sends nothing. The functions are not deployed; leave it that way.
* **Gemini:** the AI summary calls Gemini only on a dev server with `VITE_GEMINI_API_KEY` set. Leave it empty unless a human asks for a real summary in this session. Tests never call it.
* Tests and seed scripts must never send email or push, or call any paid service.
* Accounts marked `demo: true` (seed, NPCs, test-panel accounts) are never emailed directly; their mail goes to `MAIL_REDIRECT_TO` or nowhere. Keep `demo: true` on every test account you add.

### Cloud Functions

* **New functions set their limits explicitly:** `maxInstances` (small, 3–5), `timeoutSeconds`, `memory`. Never raise an existing limit without asking.
* **No `minInstances`** (it bills while idle) unless a human approves.
* **No trigger loops.** A trigger must not write to the path that fires it. If it must update its own document, it fires on create only or checks a field and exits early.
* **Fail fast:** validate input and permission before any paid call.
* **No unbounded retries** of paid calls.

### Firestore

* The app mirrors its collections through `src/backend/firebaseAdapter.js`. **Don't add other listeners or queries**; go through `db`.
* A new query outside the adapter (in a function, a script) uses `limit()` and never loops reading the same document.
* Related writes go in one transaction (`perform()` in the services does this).
* No large blobs in Firestore. Files go in Cloud Storage.

### Gemini (AI summary)

* One summary **per manuscript version**, made on upload and stored. Never regenerate when someone opens a page.
* Who may read it is the flag `AI_SUMMARY_AUDIENCE`; don't add AI calls anywhere else.
* No chat or "ask the AI" features. The summary is read-only and labeled as AI-generated.
* Paid tier only (manuscripts must not be used for training).

### Email and push

* One workflow event = **one** `outbox` entry = one email + one push. Never send in a loop that can repeat.
* A device notification shows only the neutral line from `src/deviceNotice.js`, never the email's text.

### Cloud Storage

* Check the file **before** uploading (`src/domain/uploads.js`).
* A new version is a new file. Never overwrite one.
* No public or download-token URLs for manuscripts; read through `getBlob`.

---

## 4. Security rules

### Secrets

* Server keys (Resend, later Gemini) live only in **Cloud Functions secrets** (`defineSecret`). Never in the React app, never in Git.
* Local secrets go in `.env`, `functions/.env` and `.secrets/`, all gitignored. Never print, log or commit them.
* Anything named `VITE_*` is compiled into the browser bundle. Never put a server key in a `VITE_*` variable that a production build reads.
* The Firebase **web config** is allowed in the client; Security Rules protect the data, not secrecy.
* Never paste real keys into comments, tests, examples or docs.
* Do not read `.env` or secret files unless a human asks.

### Access control

* Rules **deny by default**. Open only what a role needs, and keep `firestore.rules` and `storage.rules` in step with `src/domain/caac.js`.
* Every action that changes data checks, on the service side: the user is signed in, their global role and their role on that project, and the project's stage.
* Never trust a role, user id or project id sent from the client. The actor comes from the auth token; the rest is read from the store.
* Hiding a button is not access control. The service call must refuse too.

### Input and files

* Validate on the service side even if the form already checked.
* Never use `dangerouslySetInnerHTML` with user content.

### Privacy (Data Privacy Act of 2012, RA 10173)

* Don't log personal data (names, emails, student numbers, manuscript text, verdicts) to the console or Cloud Logging.
* Use dummy data in development.

### Audit log

* Every approve, return, upload, role change and verdict writes an audit entry.
* Nobody, admins included, can edit or delete audit entries. Don't add code that does.

### Dependencies

* Ask before adding a package. Don't add one for a few lines of code.
* Don't silence `npm audit` by weakening checks.

---

## 5. No hardcoding

Use the module that already owns the value. Don't create a second config file.

| Value | Lives in |
| --- | --- |
| Allowed email domains | `EMAIL_DOMAINS` in `src/domain/constants.js` |
| Role names | `GLOBAL_ROLES`, `PROJECT_ROLES` in `src/domain/constants.js` |
| Stages, gates and their order | `STAGES` in `src/domain/stages.js` |
| Permissions | policies in `src/domain/caac.js` |
| Verdict values, group size, other open choices | `FLAGS` in `src/domain/flags.js` |
| Revision periods | `settings/global` through `src/domain/settings.js` (flag as fallback) |
| Upload size limit and file checks | `src/domain/constants.js`, `src/domain/uploads.js` |
| Forms and signing order | `src/domain/forms.js` |
| Firebase project, bucket, keys | `.env` (`VITE_FIREBASE_*`) |
| Mail sender, redirect inbox | `MAIL_FROM`, `MAIL_REDIRECT_TO` (functions params) |

* No hardcoded user ids, real people's emails or group ids anywhere, tests included.
* No magic numbers. Name them where the table says.

---

## 6. Build what the paper and mockup say

The system follows the **revised manuscript** and the **Figma wireframes**, as recorded in `docs/WORKFLOWS.md`. If something isn't there, ask before building it. `WORKFLOWS.md` §9 lists what must never be built.

The points assistants most often get wrong:

* **Forms are signed outside the system** and uploaded. Nothing is filled in or e-signed in the app.
* **Notifications are email.** Phones and tablets also get device notifications and a bell listing the same emails; desktop has neither.
* **No grading**, rubrics or scores.
* **Phones and portrait tablets are view only.**
* **Hosting is Firebase only.**

---

## 7. Before you say "done"

* [ ] No secrets, keys or real personal data in the diff.
* [ ] No hardcoded config values (section 5).
* [ ] No real Gemini, Resend or FCM calls in dev or tests.
* [ ] Any new function sets `maxInstances` and `timeoutSeconds`, and no `minInstances`.
* [ ] No trigger can re-trigger itself.
* [ ] No new listener or unbounded query outside the adapter.
* [ ] Security Rules still deny by default; the service refuses what the UI hides.
* [ ] `npm test` passes.
* [ ] Nothing was deployed and no `--confirm-live` script was run without a human's yes.
* [ ] Your summary says: **files changed, how it was tested, and any possible cost.**

---

## 8. For the human team (one-time setup, not for the AI)

These protect the money even if an AI ignores this guide.

1. **Make the tools read this file.** Do not rename or copy it over `CLAUDE.md`; that file holds the architecture. `CLAUDE.md` points here. For other assistants, save a copy as `AGENTS.md` or paste it into the tool's custom instructions.

2. **Block risky commands in Claude Code.** Create `.claude/settings.json` in the repo and commit it:

```json
{
  "permissions": {
    "deny": [
      "Bash(firebase deploy:*)",
      "Bash(firebase functions:*)",
      "Bash(firebase firestore:*)",
      "Bash(firebase hosting:*)",
      "Bash(gcloud:*)",
      "Read(./.env)",
      "Read(./functions/.env)",
      "Read(./.secrets/**)"
    ],
    "disableBypassPermissionsMode": "disable"
  }
}
```

3. **Set Google Cloud budget alerts** (Billing → Budgets & alerts) at, for example, 25%, 50%, 90% and 100% of the monthly budget, emailed to all four members. Budgets **only alert; they do not stop spending.**

4. **Cap the Gemini API** with daily and per-minute quota limits in the Google Cloud console.

5. **Restrict API keys** in Google Cloud (HTTP referrer for the web key; API restrictions).

6. **Turn on App Check** for Firestore, Storage and Functions before going live.

7. **Use a separate Firebase project** for development if you can.

8. **Check the Billing report weekly** in your check-in.

9. **Only humans run `firebase deploy`,** after the change is reviewed.

---

## 9. Known gaps

The code does not yet meet these rules. They are listed so an assistant does not "fix" them unasked; each is a task for a human to schedule.

* Only `act` sets `memory` and `timeoutSeconds`; no function sets `maxInstances`.
* The Gemini call runs in the browser on dev servers, with the model name inline in `src/services/actions.js`. It should move to `act` with a secret.
* The live project runs on the `direct` write path until `act` is deployed, so the guard runs in the browser only there.
* App Check is not set up.
* No linter is configured; match the surrounding code.
