---
name: bump-rev-build
description: Use when the user asks to bump/raise BOTH the revision (patch) AND build number of cuemol2 (e.g. "revision/build を上げて", "rev と build を上げて", "bump revision and build", "patch + build を上げて"). Runs build_scripts/bump_version_rev.sh then build_scripts/bump_version_build.sh and reports the version change. Use bump-build or bump-rev for one part only.
---

# Bump revision (patch) + build number

Increments the `patch` (revision) then the `build` part of the cuemol2 version
(`major.minor.patch.build`). Example: `2.3.5.482` -> `2.3.6.482` -> `2.3.6.483`.

## Steps

1. Run the revision bump first, then the build bump, from the repo root:
   ```bash
   bash build_scripts/bump_version_rev.sh
   bash build_scripts/bump_version_build.sh
   ```
   To raise the build by N, run the second script N times -- or activate `.venv`
   once and call `bump-my-version bump --allow-dirty build` N times, since each
   script run re-checks pip for an upgrade.
2. Report the old -> new version to the user.

## Notes

- `build` is an independent part in `.bumpversion.cfg`, so the patch bump does
  not reset it. The order above is the documented convention, though with an
  independent build part the result is the same either way.
- Verify all three files agree, since they must match for a release tag:
  ```bash
  grep current_version .bumpversion.cfg
  grep QM_VERSION src/_version.h
  cat uxp_gui/cuemol2/config/version.txt
  ```
- `Specified version (...) does not match last tagged version (...)` is expected
  (`tag = False` in `.bumpversion.cfg`) and not an error -- a successful run ends
  with `Done.`
- The scripts edit files only: `commit = False` and `tag = False`, so they make no
  git commit and no tag. Commit only if the user asks, staging just those three
  files, as `chore(version): bump version <old> -> <new>`.
- Cutting a release needs more than a bump (release note, tag, verification).
  Use the `release` skill for that.
