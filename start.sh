#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
/usr/bin/time -p pwd
PROJECT_DIR="$(pwd)"
PORT="${PORT:-3000}"
OPENCODE_WEB_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
DIST_DIR="$PROJECT_DIR/dist"

/usr/bin/time -p mkdir -p "$DIST_DIR"
/usr/bin/time -p test -f "$DIST_DIR/index.html"
# No npm dependencies for the static preview (zero-dep gateway in magnum-key-portal/).
# Keep this install step a no-op unless a lockfile appears.
/usr/bin/time -p bash -c 'if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; elif [ -f package.json ]; then npm install --no-audit --no-fund; else echo "no root dependencies to install"; fi'
/usr/bin/time -p bash -c 'if [ -f magnum-key-portal/public/app.js ]; then cp magnum-key-portal/public/app.js dist/app.js; else echo "no public assets to sync"; fi'
/usr/bin/time -p mkdir -p "$OPENCODE_WEB_DIR"
/usr/bin/time -p python3 - "$PROJECT_DIR" "$DIST_DIR" "$OPENCODE_WEB_DIR" <<'PY'
import json, os, sys
project, dist, web = sys.argv[1], sys.argv[2], sys.argv[3]
assert os.path.isfile(os.path.join(dist, "index.html")), "dist/index.html missing"
os.makedirs(web, exist_ok=True)
with open(os.path.join(web, "deployment-output.json"), "w") as f:
    json.dump({"project": project, "directory": dist}, f)
print("wrote deployment-output.json project=%s directory=%s" % (project, dist))
PY
/usr/bin/time -p python3 --version
echo "Serving $DIST_DIR on PORT $PORT"
/usr/bin/time -p python3 -m http.server "$PORT" --directory "$DIST_DIR"
