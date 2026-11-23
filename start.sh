#!/usr/bin/env bash
set -Eeuo pipefail

run() { /usr/bin/time -p "$@"; }
PROJECT_DIR="$(run realpath "$(dirname "${BASH_SOURCE[0]}")")"
cd "$PROJECT_DIR"
PORT="${PORT:-3000}"
if [[ ! "$PORT" =~ ^[0-9]+$ ]] || (( PORT < 1 || PORT > 65535 )); then
  echo "PORT must be an integer from 1 to 65535." >&2
  exit 1
fi

BUILD_DIR="$PROJECT_DIR/dist"
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
    if [[ -f "$PROJECT_DIR/package-lock.json" ]]; then
      run npm ci --no-audit --no-fund
    else
      run npm install --no-audit --no-fund
    fi
  fi
  if run node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.build ? 0 : 1)"; then
    run npm run build
  elif [[ -f "$PROJECT_DIR/index.html" ]]; then
    run mkdir -p "$BUILD_DIR"
    run find "$PROJECT_DIR" -mindepth 1 -maxdepth 1 ! -name dist ! -name node_modules ! -name .git ! -name .agents ! -name .omgithub -exec cp -a {} "$BUILD_DIR/" \;
  fi
elif [[ -f "$PROJECT_DIR/index.html" ]]; then
  run mkdir -p "$BUILD_DIR"
  run find "$PROJECT_DIR" -mindepth 1 -maxdepth 1 ! -name dist ! -name node_modules ! -name .git ! -name .agents ! -name .omgithub -exec cp -a {} "$BUILD_DIR/" \;
fi

if [[ ! -f "$BUILD_DIR/index.html" ]]; then
  echo "No built static app found. Provide dist/index.html, a root index.html, or a package.json with a build script." >&2
  exit 1
fi

METADATA_DIR="${OPENCODE_WEB_DIR:-/home/runner/work/_temp/omgithub-web}"
run mkdir -p "$METADATA_DIR"
run node -e 'const fs=require("node:fs"); const path=require("node:path"); const [project,directory,file]=process.argv.slice(1); fs.writeFileSync(file, JSON.stringify({project:path.resolve(project),directory:path.resolve(directory)}));' "$PROJECT_DIR" "$BUILD_DIR" "$METADATA_DIR/deployment-output.json"

export PROJECT_DIR BUILD_DIR PORT
exec /usr/bin/time -p node "$PROJECT_DIR/serve-static.mjs"
