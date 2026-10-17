# Running and Testing with Docker Compose

This guide gets you from a fresh clone to a working local copy of the HAU-SOC system, and shows how to test it. You only need Docker. You do not need Node, Java or the Firebase CLI on your machine.

## What you get

| Service | What it runs | URL |
|---|---|---|
| `app` | Vite dev server (React, hot reload) | http://localhost:5180 |
| `emulators` | Firebase Emulator Suite (Firestore, Auth, Storage) | http://localhost:4000 (Emulator UI) |

The app is wired to the emulators with the demo project `demo-local`. It never reaches the live Firebase project, whatever your `.env` says.

## 1. Prerequisites

- Docker Desktop (Mac or Windows) or Docker Engine + Compose v2 (Linux). Check with `docker --version` and `docker compose version`.
- Free ports: `5180`, `4000`, `4400`, `4500`, `8080`, `9150`, `9099`, `9199`.
- Git, and about 2 GB of disk for the images.

## 2. Get the code

```bash
git clone https://github.com/katdzy/hau-soc-research-system.git
cd hau-soc-research-system
git checkout dev
```

Already cloned? Run `git fetch && git checkout dev && git pull`.

## 3. Environment file (optional)

Compose sets every variable the app needs, so you can skip this step. Create a `.env` only if you want to run the app outside Docker:

```bash
cp .env.example .env
```

Never commit `.env`. It is gitignored.

## 4. Start the stack

```bash
docker compose up --build
```

- The first run is slow. It builds both images and downloads the emulator binaries.
- The app starts only after the emulators report healthy.
- Wait for `Local: http://localhost:5180/` in the log, then open it.

To run in the background:

```bash
docker compose up -d --build
docker compose logs -f          # follow the logs (Ctrl+C leaves them running)
```

## 5. Use and test the app

1. Open http://localhost:5180.
2. On the sign-in screen, use the dev-only **Play a role** panel. Pick a persona (admin, student, instructor, chair, dean, adviser, panel, URO) to act as that user. Personas are grouped by role, section or project, and you can search them.
3. Follow a project through its stages. Switch personas to hand work from one role to the next (for example Student → Adviser → Panel → Chair → Dean).
4. In dev builds, **Attach dummy PDF** in the upload form supplies a test file, so you don't need a file picker.
5. Watch the data in the Emulator UI at http://localhost:4000. Look at **Firestore** for documents and **Authentication** for users.
6. For the full role-by-role test scripts, see [ROLE_TEST_PROMPTS.md](ROLE_TEST_PROMPTS.md). Workflow steps (`S#.#`) and test IDs (`T#`) are defined in [WORKFLOWS.md](WORKFLOWS.md).

Reset the demo data at any time with the **reset** button in the dev tools (it reloads the seed). You can also save a checkpoint and restore it later.

## 6. Run the automated tests

With the stack running:

```bash
docker compose exec app npm test
```

Or without the stack:

```bash
docker compose run --rm --no-deps app npm test
```

Production build check:

```bash
docker compose exec app npm run build
```

## 7. Run modes

| Goal | Command |
|---|---|
| Default: app + emulators with open rules (client writes allowed) | `docker compose up` |
| Enforce the real `firestore.rules` (client writes are denied) | `FIREBASE_CONFIG=firebase.json docker compose up` |
| In-memory backend only (no Firebase data, emulators unused) | `APP_BACKEND=local docker compose up` |
| Run in the background | `docker compose up -d` |

On Windows PowerShell, set the variable first: `$env:APP_BACKEND="local"; docker compose up`.

## 8. Everyday commands

```bash
docker compose ps                    # what is running, and health
docker compose logs -f app           # app logs
docker compose logs -f emulators     # emulator logs
docker compose restart app           # restart one service
docker compose stop                  # stop and keep containers
docker compose down                  # stop and remove containers (saves emulator data)
docker compose exec app sh           # shell inside the app container
```

- Edit files normally. Saving a file hot-reloads the browser, because the source folder is mounted into the container.
- After you change `package.json` or a Dockerfile, rebuild with a fresh `node_modules` volume:

```bash
docker compose up --build -V
```

## 9. Saved data

Emulator data is exported to `.emulator-data/` when you stop cleanly (`docker compose down` or Ctrl+C), and it loads again on the next start.

For a clean slate, reset to the seed:

```bash
docker compose down
rm -rf .emulator-data
docker compose up
```

Don't kill the containers with `docker kill` or by closing the terminal abruptly. The data export can be skipped.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `port is already allocated` | Stop whatever uses the port (`lsof -i :5180`) or quit other `docker compose` stacks. |
| App never starts, emulators `unhealthy` | The emulators can take up to a couple of minutes on first start. Check `docker compose logs emulators`. Make sure Docker has at least 4 GB of memory. |
| Page is blank or shows stale data | Hard-refresh. Unregister the service worker in DevTools → Application, because the PWA caches aggressively. |
| Hot reload does nothing | Polling is already on. Restart with `docker compose restart app`. |
| `Cannot find module` after pulling | `docker compose up --build -V` |
| Writes fail with permission denied | You started with `FIREBASE_CONFIG=firebase.json`. Those real rules deny client writes. Restart without it. |
| Weird data from an earlier session | Reset the data as in section 9. |
| Full cleanup (containers, volumes, images) | `docker compose down -v --rmi local` |

## 11. Stop

```bash
docker compose down
```

## Reporting a bug

Include the branch and commit (`git rev-parse --short HEAD`), the run mode, the persona you were using, the steps, and the relevant lines from `docker compose logs`.
