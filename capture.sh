#!/usr/bin/env bash
set -Eeuo pipefail

run() { /usr/bin/time -p "$@"; }
PROJECT_DIR="$(run realpath "$(dirname "${BASH_SOURCE[0]}")")"
cd "$PROJECT_DIR"
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an external evidence directory}"
run node "$PROJECT_DIR/capture.mjs"
