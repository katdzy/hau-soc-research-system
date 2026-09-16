# HAU-SOC Capstone Workflow System — Prototype

A working prototype of the **Web-Based Management and Workflow Automation System for
Thesis and Capstone Projects** (Holy Angel University, School of Computing).

The point of this build is to make the *user workflow* testable end to end — sign in as
any role, move a real project through all sixteen stages, and watch permissions,
notifications and the audit trail respond. The interface is deliberately plain; the
behaviour underneath is the deliverable.

---

## Running it

```bash
npm install && npm run dev
```

Open http://localhost:5180. No Firebase project, no credentials, no network needed — the
default backend stores everything in the browser. Demo data loads on first run and can be
restored from **Administration → Reset demo data**.

## Signing in

Two ways, both on the landing page:

- **Institutional email + OTP** — the real FR-01…FR-04 flow. Domain-restricted to
  `@hau.edu.ph` / `@student.hau.edu.ph`; the code is shown on screen instead of emailed.
  Try `katdungca@student.hau.edu.ph`.
- **Demo personas** — one click, skips verification. Faster for walkthroughs.

### Two personas worth signing in as

The whole argument for Contextual Access Control is that a role is not enough. Two seeded
users demonstrate it:

| Person | Global role | Project role | What to notice |
|---|---|---|---|
| **Mr. Chris Almocera** | Program Chair/Coordinator | Adviser on *IoT-Based Laboratory Equipment Tracking* | 7 capabilities everywhere, **plus 7 more that exist only on that one project** |
| **Engr. Marites C. Bondoc** | Faculty (no global authority) | Adviser on Group 5, Panel Member on *Smart Queue* | Different capabilities on each project; annotates privately on one, reviews openly on the other |

The **CAC Inspector** in the right-hand column of every project workspace shows exactly
which dimension granted each capability and why.

---

## A 10-minute walkthrough

Sign in as each persona in turn and take the one action offered on the worklist.

| # | Sign in as | Do this | What it proves |
|---|---|---|---|
| 1 | Asst. Prof. Espinosa (Instructor 1) | Open *Untitled — Group 5* → **Endorse roster** | Instructor forms groups; students cannot self-register |
| 2 | Mr. Almocera (Coordinator) | Assign an Adviser → **Route to Associate Dean** | The gate stays blocked until an Adviser exists |
| 3 | Dr. Rivera (Associate Dean) | **Approve adviser assignment** | Advisers are in place *before* ideation |
| 4 | Karl Dungca (Student) | Documents → submit a Topic Proposal | Every upload is a new immutable version |
| 5 | Asst. Prof. Espinosa | Review → *Approve*, then **Register topic** | The approved topic becomes the project title; the old one is kept |
| 6 | Engr. Bondoc (Adviser) | Annotate, review, **Endorse for panel** | Annotation never alters the stored file |
| 7 | Mr. Almocera | Assign Panel Chair + Members | The Adviser is disabled in the picker — conflict check |
| 8 | Engr. Bondoc, on *Smart Queue* | Documents → read annotations | Sees only their own; the Chair's is withheld with a count |
| 9 | Dr. Santos (Panel Chair) | Defense → **Record verdict** | Only the Chair can; starts the countdown, generates FM-AAC-SOC-2004 |
| 10 | Ana Bituin (Student) | Documents → annotations | Both panel annotations are now released |
| 11 | Ms. Castro (URO) | *Sentiment Analysis* → **Grant URO clearance** | Blocked until the editor's and plagiarism certificates exist |
| 12 | Dr. Tayag (Dean) | **Sign Approval Sheet and archive** | Blocked until every other signatory has signed; archives Pass/Fail, no grade |
| 13 | ICT Services (Admin) | Audit trail | Every step above, in order, attributed |

Five projects are seeded at different stages so you can start anywhere:

| Project | Parked at |
|---|---|
| Untitled — Group 5 (BSIT-WD) | Group Formation — walk the whole lifecycle |
| Smart Queue Management System | Proposal Defense — verdict and revision |
| IoT-Based Laboratory Equipment Tracking | Implementation — weekly logs, FM-AAC-SOC-2005 |
| Automated Student Feedback Sentiment Analysis | URO Clearance — clearance, signatures, archival |
| Barangay Health Records Digitisation | Archived — archive and Colloquium Gallery |

---

## How it is put together

```
src/domain/stages.js      the 16-stage workflow machine — edit this to change the process
src/domain/cac.js         the CAC engine: global role × project role → capabilities
src/domain/constants.js   roles, decisions, verdicts, document types, official forms
src/services/actions.js   every state change, each writing an audit entry + notifications
src/services/worklist.js  what each user owes the system right now
src/backend/              swappable data layer (local ↔ Firestore) + demo seed
src/components/panels/    the six workspace tabs
```

**The workflow is data, not code.** `stages.js` declares each stage, the gate(s) that
leave it, the capability a gate requires, and a `requires()` guard naming what is missing.
The worklist, the timeline, the "Next step" panel and the blocked-reason messages all
render from that one file. Changing the process after adviser feedback means editing it in
one place.

**Permissions are never checked against a role name.** Components ask
`can(ctx, 'verdict.record')`; `resolveContext()` builds `ctx` from the user's global role
*and* their assignments on that specific project. Progressive visibility is part of the
same resolution — higher-level administrators see a project as `observe` (read-only, shown
on their dashboard under "Not yet endorsed to you") until it reaches their gate, then `work`.

---

## What is stubbed, and what replaces it

| Stubbed | In production |
|---|---|
| Email notifications | Written to the in-app Inbox. A Cloud Function trigger sends the actual mail; the trigger matrix is testable as is. |
| OTP code | Shown on screen. Firebase Auth email verification replaces it. |
| File upload | Filename and size are recorded, no binary stored. Firebase Cloud Storage holds the PDF; the `documents` record is unchanged. |
| AI summary | Returns a labelled placeholder. One seeded summary shows the real structure. The external call is already audit-logged per FR-22. |
| Digital signature | Name + role + timestamp against the form — which is what FR-52/53 actually require. No PKI. |
| PDF annotation | Anchors are typed (`p. 14, §3.2`) rather than drawn on a rendered page. The data model is the same. |

## Switching to Firebase

The service layer never touches Firestore directly — it goes through a repository with two
interchangeable adapters, so no component or action changes.

```bash
cp .env.example .env          # fill in the web app config
VITE_BACKEND=firebase npm run dev
```

Against the emulator instead of production:

```bash
npm i -g firebase-tools
firebase emulators:start      # firebase.json is already configured
VITE_USE_EMULATORS=true VITE_BACKEND=firebase npm run dev
```

`firestore.rules` sketches the production posture from Chapter 5: **all writes go through
Cloud Functions**, rules only decide reads. That is deliberate — it keeps CAC evaluation in
one server-side place instead of duplicating it in rules. The local adapter enforces the
same intent through `src/domain/cac.js`; keep the two in step.

---

## Where the prototype had to decide something the documents leave open

Building it forced choices the manuscript has not yet settled. Each is isolated so it is
cheap to reverse — and each is worth resolving in the manuscript before the defense.

1. **Adviser timing.** Advisers are assigned *before* topic ideation, per the Dean meeting
   and the current "Current Process" text. The Data Dictionary's `PROJECT.current_stage`
   enum still orders Conceptualization first. *(Open Questions #20.)*
2. **URO before Dean.** URO clearance precedes the Dean's signature, per Method & RA,
   RD & Design and Chapter 2. Chapter 1's Scope still says the reverse. *(#20.)*
3. **Admin cannot annotate.** `Features per User.xlsx` row 90 says the Administrator takes
   no part in document workflows; row 93 grants a Pre-Defense Annotation Tool. FR-24 wins —
   the Administrator has no document capability at all. *(Features.md contradiction 1.)*
4. **A `Faculty` global role was added.** The documented role list has no home for a faculty
   member who is only ever an Adviser or panellist — they still need an account. They get
   zero institution-wide capability; everything comes from project assignments. This is
   arguably the cleanest illustration of CAC in the whole system, and a gap worth closing
   in the manuscript.
5. **AI summaries are visible to Adviser and students too**, not just the panel. The FR
   table lists Panel Chair/Member only, but the Level-0 DFD returns summaries to the
   Adviser and the Student role description says students may view them. *(Requirements.md,
   "worth noticing".)*
6. **Private annotations release automatically** once the project moves past the stage they
   were written in. The sources say panel annotations are private before the defense but
   never say when they stop being private.
7. **Revision windows are 7 days (minor) and 21 days (major).** The requirement says the
   countdown is configurable but never gives a default. Set in `REVISION_WINDOW_DAYS`.
8. **Collections follow the 17-entity relational model**, not the 6-collection Firestore
   sketch — `DEFENSE`, `EVALUATION_FORM`, `DIGITAL_FORM`, `DIGITAL_SIGNATURE`,
   `WEEKLY_ACCOMPLISHMENT`, `REVIEW`, `AI_SUMMARY` and `NOTIFICATION` have no home in the
   6-collection version. If Firestore is the direction, the ERD in Chapter 2 needs a pass;
   `src/backend/schema.js` is a concrete starting point. *(Database and Data Model.md.)*

Seed data uses the real names recorded for Instructor 1, the Program Coordinator and the
Dean. Every other faculty name is invented filler — edit `src/backend/seed.js` before any
demo outside the team.
