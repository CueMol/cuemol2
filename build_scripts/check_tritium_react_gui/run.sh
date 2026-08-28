#!/bin/sh
#
# Static checks and unit tests for tritium/react-gui.
#
# Unlike the core addon tests, nothing here needs libcuemol2: the renderer
# suite mocks @cuemol/core, and the type/lint passes are source-only. The
# workspace dependencies are already installed by build_tritium_core_posix
# (pnpm install --ignore-scripts), so this only runs the checks.
#

set -eux

REPOS_DIR=$(cd $(dirname $0)/../..; pwd)
WORKSPACE=${GITHUB_WORKSPACE:-$REPOS_DIR}

cd $WORKSPACE/tritium/react-gui

# Type contracts for both projects (renderer+shared, then main+preload+shared).
pnpm run typecheck

# Layering + floating-promise rules. Warnings are the tracked baseline; only a
# rule promoted to "error" fails the build.
pnpm run lint

# Comments must stay ASCII.
pnpm run lint:comments

# Vitest (renderer, worker, main, shared).
pnpm run test
