#!/bin/sh
# docker compose: keep the node_modules volumes in step with package.json and
# package-lock.json (root and functions/). The image installs them and stamps
# each folder with a hash of the two files; when a pull changes either one, the
# next `docker compose up` reinstalls here instead of running on stale modules.
#
#   deps.sh               install where the stamp is missing or stale
#   deps.sh --stamp-only  write the stamps (image build, right after npm ci)
set -e
cd /app

sync() {
  dir=$1
  sum=$(cat "$dir/package.json" "$dir/package-lock.json" | tr -d '\r' | sha1sum | cut -d' ' -f1)
  stamp="$dir/node_modules/.docker-deps"
  if [ "$MODE" = stamp ]; then
    echo "$sum" > "$stamp"
    return
  fi
  if [ "$(cat "$stamp" 2>/dev/null)" != "$sum" ]; then
    echo "deps: $dir/package.json or its lock changed, installing"
    # npm install, not ci: ci removes node_modules itself, which is a volume mount here.
    npm --prefix "$dir" install --no-audit --no-fund
    echo "$sum" > "$stamp"
  fi
}

MODE=install
[ "$1" = --stamp-only ] && MODE=stamp
sync .
sync functions
