---
name: bump-rev-build
description: Use when the user asks to bump/raise BOTH the revision (patch) AND build number of cuemol2 (e.g. "revision/build を上げて", "rev と build を上げて", "bump revision and build", "patch + build を上げて"). Runs build_scripts/bump_version_rev.sh then build_scripts/bump_version_build.sh and reports the version change. For build-only, use bump-build instead.
---

# Bump revision (patch) + build number

Increments the `patch` (revision) then the `build` part of the cuemol2
version (`major.minor.patch.build`).
Example: `2.3.5.482` → `2.3.6.482` → `2.3.6.483`.

## Steps

1. Run the revision (patch) bump first, then the build bump, from the repo
   root (order matters):
   ```bash
   bash build_scripts/bump_version_rev.sh
   bash build_scripts/bump_version_build.sh
   ```
2. Report the old → new version to the user.
   - The scripts edit `.bumpversion.cfg`, `src/_version.h`, and
     `uxp_gui/cuemol2/config/version.txt` (commit/tag are disabled in
     `.bumpversion.cfg` — files only, no git commit/tag).
   - Verify with: `grep current_version .bumpversion.cfg`

## Notes

- Order matters: run `bump_version_rev.sh` (patch) before
  `bump_version_build.sh` (build).
- `build` is an independent part, so the patch bump does not reset it.
- The `Specified version (...) does not match last tagged version (...)`
  line is informational (`tag = False`), not an error — success ends with
  `Done.`
- Do not `git commit` the version change unless the user explicitly asks.
