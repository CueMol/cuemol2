#!/usr/bin/env bash
#
# Build the four conditions of the ring x staging ablation as git worktrees,
# each with the benchmark harness laid over it
# (docs/plans/ablation-bench-instructions.md, sections 1 and 2).
#
#   A  3cfd40c7  (#625)                  ring -  staging -
#   B  98731d7e  (#626)                  ring +  staging -
#   C  ebb4bddb + revert 538a0698        ring -  staging +
#   D  ebb4bddb  (#628)                  ring +  staging +
#
# The harness is taken as a patch rather than merged in, so that nothing
# develop gained later reaches a condition. It is the diff from ebb4bddb to the
# harness ref, without results and docs. Since bench/perf-harness took in
# #629-#631 (MD trajectory loading only), that diff also carries those
# changes. They are identical under all four conditions (their files do not
# change between 3cfd40c7 and ebb4bddb), and coord-morph, static-orbit and
# idle do not reach them.
#
# Stops at the first conflict other than the expected one: in A and B,
# EcFloatDataTexture.cpp has no updateFromStaging(), and the BenchScope has to
# go at the top of update() by hand (section 2).
#
# Usage: setup-worktrees.sh [WORKDIR]   (default: ../abl next to the repo)

set -euo pipefail

REPO="$(git rev-parse --show-toplevel)"
WORK="${1:-$(dirname "$REPO")/abl}"
HARNESS_REF="${HARNESS_REF:-bench/ablation}"
BASE=ebb4bddb

mkdir -p "$WORK"
cd "$REPO"

echo "harness ref: $HARNESS_REF ($(git rev-parse --short "$HARNESS_REF"))"
echo "merge-base origin/develop $HARNESS_REF: $(git merge-base origin/develop "$HARNESS_REF" | cut -c1-8)"

PATCH="$WORK/harness-overlay.patch"
git diff "$BASE" "$HARNESS_REF" -- . \
  ':!tritium/bench/results' ':!docs' ':!tritium/docs' > "$PATCH"
shasum -a 256 "$PATCH" | tee "$WORK/harness-overlay.sha256"
echo "product files in the patch (outside tritium/):"
git diff --stat=200 "$BASE" "$HARNESS_REF" -- . ':!tritium' ':!docs' | sed 's/^/  /'

make_cond() {
  local cond="$1" rev="$2" revert="${3:-}"
  local dir="$WORK/$cond"
  if [ -d "$dir" ]; then
    echo "$cond: $dir exists; remove it first (git worktree remove)" >&2
    exit 1
  fi
  git worktree add --detach "$dir" "$rev" >/dev/null
  if [ -n "$revert" ]; then
    (cd "$dir" && git -c user.name=ablation -c user.email=ablation@localhost \
       revert --no-edit "$revert" >/dev/null)
    echo "$cond: reverted $revert"
  fi
  echo "$cond: applying the harness at $(git -C "$dir" rev-parse --short HEAD)"
  if ! (cd "$dir" && git apply --3way "$PATCH"); then
    echo "$cond: conflicts:" >&2
    (cd "$dir" && git diff --name-only --diff-filter=U) >&2
  fi
  # One corpus for every condition: the same files, so the same SHA-256.
  rm -rf "$dir/tritium/bench/data"
  ln -s "$REPO/tritium/bench/data" "$dir/tritium/bench/data"
}

make_cond A 3cfd40c7
make_cond B 98731d7e
make_cond C "$BASE" 538a0698
make_cond D "$BASE"

echo "done: $WORK/{A,B,C,D}"
