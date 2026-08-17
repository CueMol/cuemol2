---
name: bump-rev
description: Use when the user asks to bump/raise ONLY the revision (patch) number of cuemol2 (e.g. "revision だけ上げて", "rev を上げて", "bump the revision", "patch を上げて"). Runs build_scripts/bump_version_rev.sh and reports the version change. Use bump-build for the build only, or bump-rev-build when both should move.
---

# Bump revision (patch) number

Increments only the `patch` (revision) part of the cuemol2 version
(`major.minor.patch.build`). Example: `2.3.6.483` -> `2.3.7.483`.

## Steps

1. Run the revision-bump script from the repo root:
   ```bash
   bash build_scripts/bump_version_rev.sh
   ```
2. Report the old -> new version to the user.

## Notes

- `build` is an independent part in `.bumpversion.cfg`, so bumping the revision
  does **not** reset the build number. If the user expects the build to move too,
  use `bump-rev-build`.
- Verify all three files agree, since they must match for a release tag:
  ```bash
  grep current_version .bumpversion.cfg
  grep QM_VERSION src/_version.h
  cat uxp_gui/cuemol2/config/version.txt
  ```
- `Specified version (...) does not match last tagged version (...)` is expected
  (`tag = False` in `.bumpversion.cfg`) and not an error -- a successful run ends
  with `Done.`
- The script edits files only: `commit = False` and `tag = False`, so it makes no
  git commit and no tag. Commit only if the user asks, staging just those three
  files, as `chore(version): bump version <old> -> <new>`.
- Cutting a release needs more than a bump (release note, tag, verification).
  Use the `release` skill for that.
