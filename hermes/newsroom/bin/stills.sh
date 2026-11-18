#!/bin/bash
# Render a batch of studio stills for crop checks. Usage: stills.sh RUN_DIR OUT_SUBDIR "scene t" "scene t" ...
set -u
cd "$(dirname "$0")/.." || exit 1
export $(grep -E '^ELEVENLABS_API_KEY=' ../.env | head -1 | tr -d '"')
RUN="$1"; OUT="$2"; shift 2
mkdir -p "$RUN/$OUT"
: > "$RUN/$OUT/progress.txt"
for st in "$@"; do
  set -- $st
  ../studio/bin/studio still "$RUN/spec.json" --scene "$1" --t "$2" -o "$RUN/$OUT/s$1_t$2.jpg" >> "$RUN/$OUT/log.txt" 2>&1
  echo "done s$1 t$2 rc=$? $(date +%H:%M:%S)" >> "$RUN/$OUT/progress.txt"
done
echo ALLDONE >> "$RUN/$OUT/progress.txt"
