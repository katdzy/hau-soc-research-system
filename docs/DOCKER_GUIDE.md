# Running and Testing with Docker Compose

This guide gets you from a fresh clone to a working local copy of the HAU-SOC system, and shows how to test it. You only need Docker. You do not need Node, Java or the Firebase CLI on your machine.

## What you get

| Service | What it runs | URL |
|---|---|---|
| `app` | Vite dev server (React, hot reload) | http://localhost:5180 |
| `emulators` | Firebase Emulator Suite (Firestore, Auth, Storage, Functions) | http://localhost:4000 (Emulator UI) |
| `functions-build` | Builds the server code for the `act` Cloud Function and rebuilds it when you save a file | none |

The app is wired to the emulators with the demo project `demo-local`. It never reaches the live Firebase project, whatever your `.env` says. Every change the app saves goes through the `act` function on the Functions emulator, as it will in production. On the emulators no email or push notification is ever sent.

## 1. Prerequisites

- Docker Desktop (Mac or Windows) or Docker Engine + Compose v2 (Linux). Check with `docker --version` and `docker compose version`. Docker Desktop must be running before any `docker` command.
- Free ports: `5180`, `4000`, `4400`, `4500`, `5001`, `8080`, `9150`, `9099`, `9199`.
- Git, and about 2 GB of disk for the images.
- On Windows, read [Windows notes](#10-windows-notes) first.

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

- The first run is slow. It builds the images, downloads the emulator binaries and installs the functions' dependencies.
- Start order: `functions-build` builds the server code, then the emulators start, then the app. Each waits for the one before it to report healthy.
- Wait for `All emulators ready!` and `Local: http://localhost:5180/` in the log, then open the app.
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

Emulator tests. These run from your computer, not inside the app container, and need Node 22 or later installed. Run `npm install` and `npm install --prefix functions` once first.

| Command | What it checks | Needs the stack running |
|---|---|---|
| `npm run test:rules` | Storage rules, custom claims and mail routing on the emulators | Yes |
| `npm run test:triggers` | The claims triggers, live on the Functions emulator | No, it starts its own throwaway emulators |
| `npm run test:act` | Every save through `act` under the real rules, with real sign-in accounts | No, it starts its own throwaway emulators |

## 7. Run modes

| Goal | Mac / Linux | Windows PowerShell |
|---|---|---|
| Default: app + emulators, open rules, saves through `act` | `docker compose up` | `docker compose up` |
| Browser writes to Firestore directly, skipping `act` | `APP_WRITE_PATH=direct docker compose up` | `$env:APP_WRITE_PATH="direct"; docker compose up` |
| Enforce the real `firestore.rules` and `storage.rules` (reads need a real signed-in account, so the dev panel's personas can't load data) | `FIREBASE_CONFIG=firebase.json docker compose up` | `$env:FIREBASE_CONFIG="firebase.json"; docker compose up` |
| In-memory backend only (no Firebase data, emulators unused) | `APP_BACKEND=local docker compose up` | `$env:APP_BACKEND="local"; docker compose up` |
| Run in the background | `docker compose up -d` | `docker compose up -d` |

A PowerShell variable stays set for the rest of that window. Clear it before going back to the default, for example `Remove-Item Env:APP_BACKEND`.

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

On Windows PowerShell, use `Remove-Item -Recurse -Force .emulator-data` for the middle line.

Don't kill the containers with `docker kill` or by closing the terminal abruptly. The data export can be skipped.

## 10. Windows notes

- **Use PowerShell**, and the PowerShell column in section 7 for anything that sets a variable.
- **Line endings are handled.** `.gitattributes` keeps shell scripts in LF line endings, and compose strips Windows CR characters before running the functions setup script, so a CRLF checkout still starts.
- **For speed, keep the project inside WSL 2.** Docker Desktop with the WSL 2 backend reads files on `C:\` slowly and cannot pass file events through. Hot reload still works there, because the app, `functions-build` and the emulators all poll for changes, but it is slower. For the best experience, install Ubuntu from the Microsoft Store, clone the repository inside it (for example under `~/`), and run `docker compose up` from the Ubuntu terminal.
- **Memory.** Give Docker at least 4 GB. With the WSL 2 backend, set it in `%UserProfile%\.wslconfig`:

  ```
  [wsl2]
  memory=6GB
  ```

  Then run `wsl --shutdown` and restart Docker Desktop.
- **Ports Windows has reserved.** Windows sometimes reserves port ranges, and the emulators then fail with "access forbidden" or "address already in use" even though nothing is running. Check with `netsh interface ipv4 show excludedportrange protocol=tcp`. If one of the ports in section 1 falls inside a listed range, run `net stop winnat` and then `net start winnat` in an administrator PowerShell, and start the stack again.
- **Finding what uses a port:** `netstat -ano | findstr :5180` shows the process ID, and Task Manager → Details shows which program that is.

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| `failed to connect to the docker API` | Docker Desktop isn't running. Start it, wait for "Engine running", and run the command again. |
| `port is already allocated` | Stop whatever uses the port (`lsof -i :5180` on Mac/Linux, `netstat -ano \| findstr :5180` on Windows) or quit other `docker compose` stacks. |
| `scripts/functions/dev.sh: set: ... illegal option -` | A Windows checkout made before the line-ending fix. Pull the latest `dev`; compose then strips the CR characters itself. |
| `functions-build` stays unhealthy on the first run | It is installing the functions' dependencies, which can take a few minutes on Windows. Check `docker compose logs functions-build`. |
| Saving fails with "The server cannot be reached" | The Functions emulator isn't up. Check `docker compose logs emulators` for `functions[us-central1-act]: http function initialized`. |
| App never starts, emulators `unhealthy` | The emulators can take up to a couple of minutes on first start. Check `docker compose logs emulators`. Make sure Docker has at least 4 GB of memory. |
| Page is blank or shows stale data | Hard-refresh. Unregister the service worker in DevTools → Application, because the PWA caches aggressively. |
| Hot reload does nothing | Polling is already on. Restart with `docker compose restart app`. |
| `Cannot find module` after pulling | `docker compose up --build -V` |
| Nothing loads, or reads fail with permission denied | You started with `FIREBASE_CONFIG=firebase.json`. Those real rules only let a real signed-in account read, so the dev panel's personas can't. Restart without it. |
| Weird data from an earlier session | Reset the data as in section 9. |
| Full cleanup (containers, volumes, images) | `docker compose down -v --rmi local` |

## 12. Stop

```bash
docker compose down
```

## Reporting a bug

Include the branch and commit (`git rev-parse --short HEAD`), the run mode, the persona you were using, the steps, and the relevant lines from `docker compose logs`.
