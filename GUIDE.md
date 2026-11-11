# **AI Coding Guide — HAU-SOC Thesis & Capstone System**

> **To any AI assistant working in this repo (Claude, Copilot, Cursor, ChatGPT, etc.):** Read this whole file before every task. These rules override your defaults. If a request conflicts with this guide, **stop and ask the human first.**

This project runs on a **paid Firebase Blaze plan** and paid third-party APIs. Every deploy, function call, database read/write, AI summary and email **costs real money that the group pays out of pocket.** A previous AI session already used up our free credit. Do not let that happen again.

---

## **1\. The 10 golden rules**

1. **Never deploy.** Do not run `firebase deploy` (or any variant). A human deploys.  
2. **Never touch production.** Develop and test only against the **Firebase Emulator Suite**.  
3. **Never call a paid API for real** (Gemini, Resend, FCM) unless a human says so in this session.  
4. **Never put secrets in code.** No API keys, passwords, tokens or service-account JSON in any file that is committed.  
5. **Never hardcode configuration.** Emails, domains, project IDs, role names, limits and model names come from config (see section 4).  
6. **Never loosen security rules** (Firestore, Storage) to "make something work."  
7. **Every write goes through a Cloud Function that checks permissions (CAAC).** No direct client writes to protected data.  
8. **Ask before adding a dependency, a scheduled function, a new Firestore index, or a new paid service.**  
9. **Keep changes small and on a branch.** One feature per pull request; don't edit unrelated files.  
10. **When you finish, report:** what you changed, how you tested it, and whether it can cost money.

---

## **2\. Money rules (Blaze, Gemini, Resend, FCM)**

### **Stop and ask a human before you:**

* Run `firebase deploy`, `firebase functions:*`, `firebase firestore:*`, `firebase hosting:*` or anything with `--project` pointing to a real project.  
* Run any script that reads or writes many documents (migrations, seeding, cleanup, backfills).  
* Add a **scheduled** function (`onSchedule`), a Pub/Sub trigger, or any background job.  
* Add or change a **Firestore trigger** (`onDocumentWritten`, `onDocumentCreated`, etc.).  
* Call the **Gemini API**, **Resend** or **FCM** against real services.  
* Increase `maxInstances`, `memory`, `timeoutSeconds` or `minInstances` on any function.  
* Upload large files to real Cloud Storage.

### **Development must be free by default**

* Use the **Firebase Emulator Suite** for Auth, Firestore, Functions, Storage and Hosting.  
* **Gemini, Resend and FCM must be mocked in development and tests.** Use a flag (for example `USE_REAL_AI=false`, `USE_REAL_EMAIL=false`, `USE_REAL_PUSH=false`) that defaults to `false`. Real calls only when the flag is explicitly `true`.  
* Tests must **never** call real paid services.

### **Cloud Functions: cost limits are required**

Every function must set limits explicitly. Never leave them at defaults.

```js
// Example (v2 functions) — values come from config, not typed inline everywhere
setGlobalOptions({
  region: CONFIG.region,
  maxInstances: CONFIG.functions.maxInstances,   // keep small, e.g. 3–5
  timeoutSeconds: CONFIG.functions.timeoutSeconds,
  memory: CONFIG.functions.memory,
});
```

* **No `minInstances`** (it bills even when idle) unless a human approves.  
* **No infinite trigger loops.** A trigger must never write to the same document or path that triggers it. If it must update its own document, check a flag or field first and exit early.  
* **Fail fast:** validate input and permissions at the top of the function, before any paid call.  
* **No retries without limits.** Never retry paid calls in an unbounded loop.

### **Firestore: reads and writes cost money**

* Always use `limit()` and pagination on list queries. Never fetch a whole collection.  
* Only subscribe with `onSnapshot` to what is on screen, and **always unsubscribe** when the component unmounts.  
* Don't read the same document repeatedly in a loop; read once and reuse.  
* Batch related writes; don't write one document at a time in a loop when a batch or transaction fits.  
* Don't store large blobs in Firestore. Files go in Cloud Storage.

### **Gemini (AI summary)**

* Generate a summary **once per manuscript version**, on upload, and **store it in Firestore**. Never regenerate when someone opens a page.  
* **Check for an existing summary first**; if one exists for that version, return it.  
* Set a maximum output size and a request timeout.  
* Only Panel Members and Panel Chairs see summaries; don't add AI calls anywhere else.  
* No chat or "ask the AI" features. The summary is read-only.  
* Use the paid tier only (manuscripts must not be used for training).

### **Resend (email) and FCM (push)**

* One workflow event \= **one** notification record \= one email \+ one push. Never send per-recipient in a loop that can repeat.  
* Never send emails or pushes from tests or seed scripts.  
* In development, emails go only to an allowlist of test addresses from config.  
* Device notifications must mirror the email and show only neutral lock-screen text ("Update on your capstone project").

### **Cloud Storage**

* Validate type (PDF only) and size **before** uploading.  
* Never re-upload a file that already exists; versions are new files, not overwrites.  
* Don't generate public download URLs for manuscripts.

---

## **3\. Security rules**

### **Secrets**

* API keys for **Gemini** and **Resend** live only in **Cloud Functions secrets** (Secret Manager, e.g. `defineSecret`). Never in the React app, never in Git.  
* Local secrets go in `.env` / `.env.local`, which must be in `.gitignore`. Never print, log or commit them.  
* The Firebase **web config** is allowed in the client, but it is protected by **Security Rules and App Check**, not by being hidden.  
* Never paste real keys into code comments, tests, examples, README or this file.  
* Do not read `.env` files or secret files unless a human asks.

### **Access control (CAAC)**

* **Deny by default** in Firestore and Storage rules. Open only what a role needs.  
* Every Cloud Function that changes data must check:  
  1. the user is signed in,  
  2. their **global role** and their **project role for that specific group**,  
  3. the project is at the right workflow step.  
* Never trust role, user ID or project ID sent from the client. Read them from the auth token and the database.  
* Students only see their own group. Instructor 1 sees a document only **after the adviser has reviewed it**. Panel comments are **private to each panelist**.  
* Only the **System Administrator** manages roles; that row is locked from self-editing.

### **Input and files**

* Validate and sanitize all input on the server, even if the client already checked it.  
* Uploads: PDF only, size limit from config, reject anything else.  
* Escape or sanitize any user text before rendering. Never use `dangerouslySetInnerHTML` with user content.

### **Privacy (Data Privacy Act of 2012, RA 10173\)**

* Never log personal data (names, emails, student numbers, manuscript text, verdicts) to the console or Cloud Logging.  
* Use test/dummy data in development. Never copy real student data into the emulator, tests or fixtures.

### **Audit log**

* Every approve, return, upload, role change and verdict writes an audit entry.  
* Nobody (including admins) can edit or delete audit entries. Don't add code that does.

### **Dependencies**

* Ask before adding any package. Prefer well-maintained packages; don't add one for a few lines of code.  
* Never disable `npm audit` warnings by downgrading security checks.

---

## **4\. No hardcoding**

All of the following come from **one config/constants module** (frontend and functions each have their own), never typed inline in components or functions:

| Never hardcode | Put it in config as |
| ----- | ----- |
| Allowed email domains (`@hau.edu.ph`, `@student.hau.edu.ph`) | `ALLOWED_DOMAINS` |
| Firebase project ID, region, bucket | environment config |
| App URL / domain | `APP_URL` |
| Role names (Student, Adviser, Instructor 1, …) | `ROLES` |
| Workflow steps (14 Capstone 1 \+ 10 Capstone 2\) | `WORKFLOW_STEPS` |
| Verdict options and revision periods (1 week minor, 2 weeks major) | `VERDICTS`, `REVISION_DAYS` |
| Upload size limit, allowed file types | `UPLOAD` |
| Gemini model name, max output, timeout | `AI` |
| Function limits (maxInstances, timeout, memory) | `FUNCTIONS` |
| Email sender address, test-email allowlist | `EMAIL` |
| Form codes (FM-AAC-SOC-2003/2004/2005) | `FORMS` |

* No hardcoded user IDs, emails of real people, or group IDs anywhere, including tests.  
* No "magic numbers." Name them in config.  
* Follow the existing folder structure. If no config module exists yet, ask where it should go before creating one.

---

## **5\. Build what the paper and mockup say (and nothing extra)**

The system must match the **revised manuscript** and the **Figma wireframes**. Don't invent features.

* **Forms are never filled in or signed inside the system.** Users download the blank form, sign it outside the system (all e-signatures or all wet signatures), then upload it.  
* **No in-app notification list or bell.** Notifications are email, mirrored as optional device notifications through the PWA on phones.  
* **No grading.** The system does not compute grades.  
* **No version comparison.** Version history is read-only and numbered per stage (v1, v2… restarting each stage).  
* **Phones and portrait tablets are view-only.** Landscape tablets and desktops can take actions.  
* **Panel members** only have Dashboard and Assigned Panels; they cannot return papers; their comments are private.  
* **The adviser reviews first**, then Instructor 1 (Capstone 1), then the panel (post-defense revisions).  
* **Hosting is Firebase only.** No Cloudflare or other hosting. Hostinger is only the domain registrar.  
* **AI summary is summary-only** (no chat), labeled as AI-generated, for panel roles only.

If something isn't in the paper or mockup, ask before building it.

---

## **6\. How to work**

* Work on a **feature branch**. Never commit directly to `main`.  
* **One feature per pull request**, with a short description and how you tested it.  
* Follow the **Airbnb JavaScript style guide** and the existing lint rules. Don't disable lint rules to pass.  
* Write tests for Security Rules and Cloud Functions and run them in the **emulator**.  
* Don't rename, move or reformat files you weren't asked to change.  
* Don't delete data, collections, users or files. Ask first.  
* If you're unsure, ask. Don't guess about money or security.

---

## **7\. Before you say "done" — checklist**

* \[ \] No secrets, keys or real personal data in the diff.  
* \[ \] No hardcoded config values (section 4).  
* \[ \] No real Gemini / Resend / FCM calls in dev or tests.  
* \[ \] Every new function has `maxInstances` and `timeoutSeconds` set, and no `minInstances`.  
* \[ \] No trigger can re-trigger itself.  
* \[ \] Every query has a limit; every listener unsubscribes.  
* \[ \] Security Rules still deny by default; permission checks run on the server.  
* \[ \] Tested in the Firebase Emulator Suite.  
* \[ \] Matches the paper and the Figma frame for this feature.  
* \[ \] Nothing was deployed.  
* \[ \] Your summary says: **files changed, how it was tested, and any possible cost.**

---

## **8\. For the human team (one-time setup, not for the AI)**

These protect the money even if an AI ignores this guide.

1. **Name this file so the tools read it automatically.**

   * Claude Code: save a copy as `CLAUDE.md` in the repo root (it's loaded at the start of every session).  
   * Other assistants: also save a copy as `AGENTS.md`, or paste it into that tool's custom instructions.  
2. **Block risky commands in Claude Code.** Create `.claude/settings.json` in the repo:

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
      "Read(./.env.*)",
      "Read(./functions/.env)",
      "Read(./functions/.env.*)"
    ]
  },
  "disableBypassPermissionsMode": "disable"
}
```

3.   
   Commit it so it applies to everyone using Claude Code in the repo.

4. **Set Google Cloud budget alerts** (Billing → Budgets & alerts) at, for example, 25%, 50%, 90% and 100% of your monthly budget, emailed to all four members. Budgets **only alert; they do not stop spending.**

5. **Cap the Gemini API** with daily and per-minute **quota limits** in the Google Cloud console for that project.

6. **Keep Cloud Functions small:** a low `maxInstances` on every function (section 2).

7. **Turn on App Check** for Firestore, Storage and Functions so only your app can call them.

8. **Restrict API keys** in Google Cloud (HTTP referrer for the web key; API restrictions).

9. **Use separate Firebase projects** for development and production if you can, and keep daily development on the emulator.

10. **Check the Billing report weekly** in your check-in, and note it in the project checklist.

11. **Only humans run `firebase deploy`,** after the pull request is reviewed.

