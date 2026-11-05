# Docker Commands: Quick Reference

One page of the commands for running the HAU-SOC system with Docker on **macOS** and **Windows**. For first-time setup, troubleshooting and the details behind each command, see [DOCKER_GUIDE.md](DOCKER_GUIDE.md).

- **You need:** Docker Desktop (on Windows, with the WSL 2 backend). Node.js only for the `npm run test:*` commands.
- **Windows:** use **PowerShell**, opened in the project folder.
- **Run everything from the project folder** (`hau-soc-research-system`).
- The stack runs against local emulators (project `demo-local`). It never touches the live Firebase project and never sends real email. To run the app against the live project instead, see [Against the live project](#against-the-live-project).

| What | Address |
|---|---|
| App | http://localhost:5180 |
| Emulator UI (Firestore, Auth, Storage, Functions) | http://localhost:4000 |

## First time

```bash
git clone https://github.com/katdzy/hau-soc-research-system.git
cd hau-soc-research-system
git checkout dev
docker compose up -d --build
```

The first start builds the images and takes several minutes. After that, start with `docker compose up -d`.

## Start Docker Desktop

Docker Desktop must be running before any `docker` command.

| macOS | Windows PowerShell |
|---|---|
| `open -a Docker` | `Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"` |

Or open Docker Desktop from Launchpad / the Start menu and wait for "Engine running".

## Same on macOS and Windows

### Start and stop

| Command | What it does |
|---|---|
| `docker compose up -d` | Start in the background. Leave it running while you code. |
| `docker compose up` | Start in the foreground with logs. Ctrl+C stops it. |
| `docker compose down` | Stop. Saves the emulator data to `.emulator-data/`. |
| `docker compose up -d --build` | Rebuild the images (after a Dockerfile change) and start. |

Stop with `docker compose down` or Ctrl+C. Don't just close the terminal or use `docker kill`, because the data might not be saved.

### While you work

Save a file and the browser updates by itself. Changes in `src/services/` are rebuilt into the `act` Cloud Function automatically.

| Command | What it does |
|---|---|
| `docker compose ps` | Show what's running and whether it's healthy. |
| `docker compose logs -f app functions-build` | Follow the app and function-build logs. |
| `docker compose logs -f emulators` | Follow the emulator logs. |
| `docker compose down`, then `docker compose up -d` | Restart everything. Do this after `package.json` or a lock file changes (dependencies reinstall on their own). |
| `docker compose restart app` | Restart only the app (for example, if hot reload stops). |
| `docker compose exec app sh` | Open a shell inside the app container. |

### Against the live project

`docker-compose.live.yml` runs the app alone, against the Firebase project in `.env` (no emulators). Everything there is real: registrations, workflow actions and quota. The test panel shows People, Spawn, Outbox, Trail and Rules there; Stage, checkpoints and wipe need the emulators. Type the dummy accounts' test password in People, sign in as anyone there, then Spawn's − / + make and remove real dummy logins (it needs the service-account key in `.secrets/service-account.json`, and it never touches real accounts). From the command line, use `node scripts/live-spawn/spawn-live.mjs` from your machine (Node, plus a service-account key in `.secrets/service-account.json`; usage at the top of the file). It runs as a dry run until you add `--confirm-live --password <8+ characters>`, and it only adds.

| Command | What it does |
|---|---|
| `docker compose down`, then `docker compose -f docker-compose.live.yml up -d` | Switch from the emulator stack to the live project. |
| `docker compose -f docker-compose.live.yml down`, then `docker compose up -d` | Switch back to the emulators. |
| `docker compose -f docker-compose.live.yml logs -f app` | Follow the app logs. |

### Tests

| Command | What it checks | Needs |
|---|---|---|
| `docker compose exec app npm test` | Unit and guard tests, inside the container | Stack running |
| `npm test` | The same tests, on your machine | Node |
| `npm run test:rules` | Storage rules, claims and mail routing on the emulators | Node + stack running |
| `npm run test:triggers` | Claims triggers on the Functions emulator | Node (starts its own emulators) |
| `npm run test:act` | Every save through `act` under the real rules | Node (starts its own emulators) |

Before the `npm run` tests, run `npm install` and `npm install --prefix functions` once.

## Different on macOS and Windows

### Run modes

Run `docker compose down` first, then start with one of these.

| Mode | macOS | Windows PowerShell |
|---|---|---|
| Browser writes to the emulators directly, skipping `act` | `APP_WRITE_PATH=direct docker compose up -d` | `$env:APP_WRITE_PATH="direct"; docker compose up -d` |
| Use the real `firestore.rules` / `storage.rules` (dev-panel personas can't read data) | `FIREBASE_CONFIG=firebase.json docker compose up -d` | `$env:FIREBASE_CONFIG="firebase.json"; docker compose up -d` |
| In-memory backend only (emulators unused) | `APP_BACKEND=local docker compose up -d` | `$env:APP_BACKEND="local"; docker compose up -d` |

On macOS the variable applies to that one command. In PowerShell it stays set for the rest of the window. To go back to the default, open a new window or run:

```powershell
Remove-Item Env:APP_WRITE_PATH, Env:FIREBASE_CONFIG, Env:APP_BACKEND -ErrorAction SilentlyContinue
```

### Start over from scratch

The first command reinstalls dependencies, so the next start is slow again. The second also drops the saved emulator data and goes back to the seed.

| What | macOS | Windows PowerShell |
|---|---|---|
| Fresh dependencies | `docker compose down -v && docker compose up -d --build` | `docker compose down -v; docker compose up -d --build` |
| Fresh data (back to the seed) | `docker compose down && rm -rf .emulator-data && docker compose up -d` | `docker compose down; Remove-Item -Recurse -Force .emulator-data; docker compose up -d` |

### Open the app from another computer

Find the IP address of the computer running Docker:

| macOS (Wi-Fi) | Windows PowerShell |
|---|---|
| `ipconfig getifaddr en0` | `ipconfig` (look for "IPv4 Address") |

On another computer on the same network, open `http://<that-IP>:5180`. On Windows, allow Docker through the firewall if asked. File uploads only work on the computer running Docker (at `localhost`).

### Find what is using a port

If you get `port is already allocated`:

| macOS | Windows PowerShell |
|---|---|
| `lsof -i :5180` | `netstat -ano \| findstr :5180` |

The ports used are 5180, 4000, 4400, 4500, 5001, 8080, 9150, 9099 and 9199. Don't run `npm run dev` on your machine while the stack is up, because both use 5180.
