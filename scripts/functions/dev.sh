#!/bin/sh
# docker compose `functions-build`: what a fresh clone lacks, then the `act`
# bundle in watch mode. The dependencies (root and functions/) live in named
# volumes filled by the image; deps.sh reinstalls them after a lockfile change.
# functions/.secret.local is gitignored.
set -e
cd /app

# CRs stripped: a Windows checkout may have given the script CRLF line endings.
tr -d '\r' < scripts/docker/deps.sh | sh

# deliverOutbox sends nothing on the emulator; without a value for its secret
# the emulator asks Google Secret Manager for one on every run.
if [ ! -f functions/.secret.local ]; then
  printf '# Emulator only: deliverOutbox skips sending on the emulator, so this is never used.\nRESEND_API_KEY=emulator-placeholder\n' > functions/.secret.local
fi

# A bundle left from an earlier run would pass the healthcheck before this
# run's first build; the emulators should start on a fresh one.
rm -f functions/lib/app.js

exec node scripts/functions/build.mjs --watch
