#!/bin/sh
# Idempotent setup for Newsroom Studio.
#
#   1. find uv (STUDIO_UV, ../tools/uv-*/uv, PATH) and run `uv sync` (.venv/)
#   2. download the OFL fonts into assets/fonts/ if missing
#   3. make sure a Chromium is available (STUDIO_CHROMIUM, ../tools/chromium-*,
#      Playwright's cache; otherwise `playwright install chromium`)
#   4. generate the example placeholder image if missing
#   5. print `studio doctor` (resolved binaries) as JSON
#
# Safe to run repeatedly. Never prompts. Exits non-zero on failure.
set -eu

STUDIO_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TOOLS_DIR=$(CDPATH= cd -- "$STUDIO_DIR/.." && pwd)/tools
cd "$STUDIO_DIR"

log() { printf '[setup] %s\n' "$*" >&2; }
die() { printf '[setup] ERROR: %s\n' "$*" >&2; exit 1; }

first_match() {
  # first existing path among the expanded glob arguments
  for p in "$@"; do
    if [ -e "$p" ]; then printf '%s\n' "$p"; return 0; fi
  done
  return 1
}

# --- 1. uv + Python environment -------------------------------------------
UV=${STUDIO_UV:-}
if [ -z "$UV" ]; then
  UV=$(first_match "$TOOLS_DIR"/uv-*/uv 2>/dev/null || true)
fi
if [ -z "$UV" ]; then
  UV=$(command -v uv 2>/dev/null || true)
fi
[ -n "$UV" ] || die "uv not found (set STUDIO_UV, install uv, or provide ../tools/uv-*/uv)"
log "uv: $UV"

if [ -z "${UV_PYTHON:-}" ]; then
  PY=$(first_match "$TOOLS_DIR"/python-*/bin/python3 2>/dev/null || true)
  if [ -n "$PY" ]; then
    UV_PYTHON=$PY
    export UV_PYTHON
    log "python: $UV_PYTHON"
  fi
fi

"$UV" sync --quiet || die "uv sync failed"
VENV_PY="$STUDIO_DIR/.venv/bin/python"
[ -x "$VENV_PY" ] || die "virtualenv missing after uv sync: $VENV_PY"

# --- 2. fonts ----------------------------------------------------------------
FONT_DIR="$STUDIO_DIR/assets/fonts"
GF="https://github.com/google/fonts/raw/main/ofl"
fetch() {
  # fetch URL DEST (skips when DEST exists)
  if [ ! -s "$2" ]; then
    log "downloading $(basename "$2")"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL --retry 3 -o "$2.part" "$1" || { rm -f "$2.part"; return 1; }
    else
      "$VENV_PY" -c "import sys,httpx; open(sys.argv[2],'wb').write(httpx.get(sys.argv[1],follow_redirects=True,timeout=60).raise_for_status().content)" "$1" "$2.part" || { rm -f "$2.part"; return 1; }
    fi
    mv "$2.part" "$2"
  fi
}
fetch "$GF/intertight/InterTight%5Bwght%5D.ttf" "$FONT_DIR/InterTight-Variable.ttf" || log "WARNING: Inter Tight download failed (system fallback fonts will be used)"
fetch "$GF/intertight/OFL.txt" "$FONT_DIR/InterTight-OFL.txt" || true
fetch "$GF/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf" "$FONT_DIR/JetBrainsMono-Variable.ttf" || log "WARNING: JetBrains Mono download failed (system fallback fonts will be used)"
fetch "$GF/jetbrainsmono/OFL.txt" "$FONT_DIR/JetBrainsMono-OFL.txt" || true

# --- 3. Chromium -------------------------------------------------------------
if ! "$VENV_PY" -m studio.cli doctor --require-chromium >/dev/null 2>&1; then
  log "no Chromium found; installing Playwright's chromium"
  "$VENV_PY" -m playwright install chromium >&2 || die "playwright install chromium failed"
fi

# --- 4. example assets -------------------------------------------------------
if [ ! -s "$STUDIO_DIR/examples/assets/placeholder.jpg" ]; then
  log "generating examples/assets/placeholder.jpg"
  "$VENV_PY" "$STUDIO_DIR/examples/make_placeholder.py" "$STUDIO_DIR/examples/assets/placeholder.jpg"
fi

mkdir -p "$STUDIO_DIR/cache" "$STUDIO_DIR/out"
chmod +x "$STUDIO_DIR/bin/studio" 2>/dev/null || true

# --- 5. report -----------------------------------------------------------------
"$VENV_PY" -m studio.cli doctor
log "done"
