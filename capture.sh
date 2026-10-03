#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

fail_temp() { echo "capture transient failure: $*" >&2; exit 75; }
fail_perm() { echo "capture defect: $*" >&2; exit 1; }

/usr/bin/time -p test -n "${CAPTURE_URL:-}" || fail_perm "Set CAPTURE_URL"
/usr/bin/time -p test -n "${CAPTURE_DIR:-}" || fail_perm "Set CAPTURE_DIR"
case "$CAPTURE_DIR" in
  "$PROJECT_DIR"/*) fail_perm "CAPTURE_DIR must stay outside source (got $CAPTURE_DIR)" ;;
esac
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p test -d "$CAPTURE_DIR" || fail_perm "cannot create CAPTURE_DIR=$CAPTURE_DIR"

/usr/bin/time -p playwright-cli open "$CAPTURE_URL" || fail_temp "browser open failed for $CAPTURE_URL"

/usr/bin/time -p sleep 3
# Wait up to ~20s for rendered body text (not a loading screen).
RENDERED=""
for i in $(/usr/bin/time -p seq 1 10); do
  N="$(/usr/bin/time -p playwright-cli eval "() => document.body ? document.body.innerText.length : 0" --raw 2>/dev/null | /usr/bin/time -p tr -cd '0-9' || echo 0)"
  N="${N:-0}"
  echo "render check $i: body chars=$N"
  if [ "$N" -ge 50 ]; then RENDERED=1; break; fi
  /usr/bin/time -p sleep 2
done
[ -n "$RENDERED" ] || fail_perm "page did not render meaningful content at $CAPTURE_URL"
/usr/bin/time -p playwright-cli eval "() => document.fonts ? document.fonts.status : 'loaded'" || true

# Desktop 1440x900
/usr/bin/time -p playwright-cli resize 1440 900 || fail_perm "resize desktop failed"
/usr/bin/time -p sleep 1
/usr/bin/time -p playwright-cli screenshot --filename "$CAPTURE_DIR/final-desktop.png" || fail_temp "desktop screenshot failed"
/usr/bin/time -p test -s "$CAPTURE_DIR/final-desktop.png" || fail_perm "final-desktop.png missing/empty"

# Mobile 390x844
/usr/bin/time -p playwright-cli resize 390 844 || fail_perm "resize mobile failed"
/usr/bin/time -p sleep 1
/usr/bin/time -p playwright-cli screenshot --filename "$CAPTURE_DIR/final-mobile.png" || fail_temp "mobile screenshot failed"
/usr/bin/time -p test -s "$CAPTURE_DIR/final-mobile.png" || fail_perm "final-mobile.png missing/empty"

/usr/bin/time -p playwright-cli close || fail_temp "browser close failed"

echo "capture ok: $CAPTURE_DIR/final-desktop.png $CAPTURE_DIR/final-mobile.png"
