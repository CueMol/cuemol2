#!/usr/bin/env bash
# macOS arm64 packaging entry point (used by the package:mac npm script and the
# Taskfile package_tritium task). Delegates to the cross-platform package.sh.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/package.sh" --mac --arm64
