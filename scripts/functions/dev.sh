#!/bin/sh
# docker compose `functions-build`: what a fresh clone lacks, then the `act`
# bundle in watch mode. functions/node_modules and functions/.secret.local are
# gitignored; the dependencies are plain JavaScript, so one install serves the
# Linux containers and the Mac alike.
set -e
cd /app

if [ ! -d functions/node_modules/firebase-admin ] || [ ! -d functions/node_modules/firebase-functions ]; then
  echo "functions-build: installing functions/ dependencies (first run)"
  npm --prefix functions ci --no-audit --no-fund
fi

# deliverOutbox sends nothing on the emulator; without a value for its secret
# the emulator asks Google Secret Manager for one on every run.
if [ ! -f functions/.secret.local ]; then
  printf '# Emulator only: deliverOutbox skips sending on the emulator, so this is never used.\nRESEND_API_KEY=emulator-placeholder\n' > functions/.secret.local
fi

exec node scripts/functions/build.mjs --watch
