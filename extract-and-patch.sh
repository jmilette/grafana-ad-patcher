#!/bin/sh
# Regenerates patched/index.html from whatever grafana image tag is set
# below (must match the tag used in docker-compose.yml). Run this once, and
# again any time you bump the image tag.
#
# No root needed anywhere: this only extracts a file via `docker cp` from a
# never-started container and edits it as your normal host user. The
# running grafana container stays 100% stock (same non-root user, no
# entrypoint override) since we bind-mount the result over the file it
# would otherwise have shipped with.
set -e

IMAGE="${1:-grafana/grafana:13.0.8}"
SELF_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
OUT_DIR="$SELF_DIR/patched"
OUT_FILE="$OUT_DIR/index.html"
MARKER="<!-- grafana-noads:hide-ads -->"

mkdir -p "$OUT_DIR"

cid="$(docker create "$IMAGE")"
trap 'docker rm "$cid" >/dev/null 2>&1 || true' EXIT
docker cp "$cid:/usr/share/grafana/public/views/index.html" "$OUT_FILE"

if grep -qF "$MARKER" "$OUT_FILE"; then
  echo "extract-and-patch: $OUT_FILE already has the hide-ads tag, nothing to add" >&2
else
  tmp="$(mktemp)"
  awk -v marker="$MARKER" '
    /<\/body>/ {
      print marker
      print "    <script nonce=\"[[.Nonce]]\" src=\"public/img/hide-ads.js\" defer></script>"
    }
    { print }
  ' "$OUT_FILE" > "$tmp"
  mv "$tmp" "$OUT_FILE"
  chmod 644 "$OUT_FILE"
  echo "extract-and-patch: patched $OUT_FILE from $IMAGE" >&2
fi
