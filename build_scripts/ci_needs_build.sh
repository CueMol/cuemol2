#!/usr/bin/env bash
# Decide whether a CI run has to build: prints "true" or "false" on stdout
# (the reason goes to stderr).
#
# Used by .github/workflows/build2.yml (setup_matrix) and build_linux.yml
# (changes). A run that does not need to build still runs every required job,
# with its build steps skipped, so the required checks still report.
#
#   - develop, tags and workflow_dispatch: always "true". develop runs are
#     cancelled by a newer push (cancel-in-progress), so a docs-only merge
#     that skipped would leave the code merged before it unbuilt.
#   - any other branch: "false" only when every file the branch changed since
#     it left develop (merge-base, the whole branch and not this push alone,
#     since a cancelled run may have been the one with the code) is one that
#     no build reads: docs/**, a *.md at the top, a CLAUDE.md anywhere,
#     .claude/**, LICENSE*.
#   - anything unclear (no merge-base, git failing, an empty diff): "true".
#
# Environment (GitHub's names; defaults let it be tried locally):
#   EVENT_NAME   github.event_name   (default: push)
#   REF          github.ref          (default: refs/heads/<current branch>)
#   SHA          github.sha          (default: HEAD)
#   BASE_REF     what the branch is compared with (default: origin/develop)

set -u

EVENT_NAME="${EVENT_NAME:-push}"
REF="${REF:-refs/heads/$(git rev-parse --abbrev-ref HEAD 2>/dev/null)}"
SHA="${SHA:-HEAD}"
BASE_REF="${BASE_REF:-origin/develop}"

decide() {
  echo "ci_needs_build: $2" >&2
  echo "$1"
  exit 0
}

case "$EVENT_NAME" in
  workflow_dispatch) decide true "manual dispatch: always build" ;;
esac
case "$REF" in
  refs/tags/*) decide true "tag $REF: always build" ;;
  refs/heads/develop) decide true "develop: always build" ;;
esac

base=$(git merge-base "$BASE_REF" "$SHA" 2>/dev/null) || decide true "no merge-base with $BASE_REF: build"
files=$(git diff --name-only "$base" "$SHA" 2>/dev/null) || decide true "git diff failed: build"
[ -n "$files" ] || decide true "no change since $BASE_REF: build"

# Whether a path is one no build step reads.
no_build_needed() {
  case "$1" in
    docs/*|.claude/*|LICENSE*|CLAUDE.md|*/CLAUDE.md) return 0 ;;
  esac
  # A Markdown file at the top only: one inside a source tree may be bundled
  # (tritium/cli/src/skill/SKILL.md is).
  case "$1" in
    */*) return 1 ;;
    *.md) return 0 ;;
  esac
  return 1
}

while IFS= read -r f; do
  no_build_needed "$f" || decide true "$f needs a build"
done <<< "$files"
decide false "only docs-like files changed since $BASE_REF ($(wc -l <<< "$files" | tr -d ' ') files)"
