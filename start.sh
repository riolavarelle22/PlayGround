#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# free-api project startup: build static dist + serve gateway API on PORT (default 3000).
PORT="${PORT:-3000}"
export PORT
PROJECT_ROOT="$(pwd)"

# 1. Build the static deployment output inside PROJECT_DIR.
/usr/bin/time -p mkdir -p dist free-api/data
/usr/bin/time -p cp free-api/public/index.html dist/index.html
/usr/bin/time -p test -f dist/index.html

# 2. Publish deployment metadata for the controller (worker metadata only).
if [[ -n "${OPENCODE_WEB_DIR:-}" ]]; then
  /usr/bin/time -p mkdir -p "$OPENCODE_WEB_DIR"
  /usr/bin/time -p bash -c 'printf "%s" "$1" > "$2"' _ \
    "{\"project\":\"$PROJECT_ROOT\",\"directory\":\"$PROJECT_ROOT/dist\"}" \
    "$OPENCODE_WEB_DIR/deployment-output.json"
  /usr/bin/time -p cat "$OPENCODE_WEB_DIR/deployment-output.json"
else
  echo "OPENCODE_WEB_DIR not set; skipping deployment-output.json" >&2
fi

# 3. Install dependencies (free-api has zero runtime deps; fast no-op if clean).
/usr/bin/time -p npm --prefix free-api install --no-audit --no-fund
# 4. Sanity-check the server entrypoint.
/usr/bin/time -p node --check free-api/server.js

# 5. Serve in the foreground (API + static UI) on PORT.
echo "Starting free-api on port $PORT (project=$PROJECT_ROOT)" >&2
/usr/bin/time -p node free-api/server.js
