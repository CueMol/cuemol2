---
name: bump-build
description: Use when the user asks to bump/raise ONLY the build number of cuemol2 (e.g. "build だけ上げて", "build no を上げて", "bump the build number", "increment build"). Runs build_scripts/bump_version_build.sh and reports the version change. Use bump-rev for the revision only, or bump-rev-build for both.
---

# Bump build number

Increments only the `build` part of the cuemol2 version
(`major.minor.patch.build`). Example: `2.3.6.482` -> `2.3.6.483`.

## Steps

1. Run the build-bump script from the repo root:
   ```bash
   bash build_scripts/bump_version_build.sh
   ```
   To raise the build by N, run it N times -- or activate `.venv` once and call
   `bump-my-version bump --allow-dirty build` N times, since each script run
   re-checks pip for an upgrade.
2. Report the old -> new version to the user.

## Notes

- `build` is an independent part in `.bumpversion.cfg`, so no other bump resets
  it.
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
  files, as `chore(version): bump build number to <new-version>`.
- Cutting a release needs more than a bump (release note, tag, verification).
  Use the `release` skill for that.
