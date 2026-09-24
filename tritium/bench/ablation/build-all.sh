#!/usr/bin/env bash
# Serial Release builds of the four ablation worktrees; one log each.
set -uo pipefail
cd "$(dirname "$0")"
for c in A B C D; do
  log="$PWD/build-$c.log"
  echo "== $c start $(date +%H:%M:%S)" | tee "$log"
  (cd "$c/tritium" && pnpm install --frozen-lockfile --ignore-scripts) >>"$log" 2>&1 || { echo "== $c pnpm install FAILED" | tee -a "$log"; continue; }
  (cd "$c/build_scripts" && task rebuild_libcuemol2 CONFIG=Release) >>"$log" 2>&1 || { echo "== $c libcuemol2 FAILED" | tee -a "$log"; continue; }
  (cd "$c/build_scripts" && task build_tritium CONFIG=Release) >>"$log" 2>&1 || { echo "== $c tritium FAILED" | tee -a "$log"; continue; }
  echo "== $c done $(date +%H:%M:%S)" | tee -a "$log"
done
