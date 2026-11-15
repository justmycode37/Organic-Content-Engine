#!/usr/bin/env bash
# Install (or reinstall) the Hermes Agent runtime into this folder.
#
# The runtime (hermes-agent/, tools/, installs/, cache/) is machine specific and
# never committed. Everything else in this folder is portable state. Run this
# once on every new machine, e.g. after copying the folder to a server.
#
# Usage: scripts/bootstrap.sh [--channel stable|main] [--skip-browser] [...]
#        Extra arguments are passed through to the upstream installer.
set -euo pipefail

HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
# Pinned upstream version. Bump deliberately, then commit.
HERMES_COMMIT="${HERMES_COMMIT:-$(cat "$HERE/HERMES_VERSION")}"
INSTALLER_URL="https://hermes-agent.nousresearch.com/install.sh"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$INSTALLER_URL" -o "$tmp/install.sh"

HERMES_HOME="$HERE" bash "$tmp/install.sh" \
    --hermes-home "$HERE" \
    --dir "$HERE/hermes-agent" \
    --commit "$HERMES_COMMIT" \
    --non-interactive \
    "$@"

if [ -x "$HERE/studio/setup.sh" ]; then
    "$HERE/studio/setup.sh"
fi

echo
echo "Hermes is installed in $HERE"
echo "Start it with: $HERE/bin/hermes"
