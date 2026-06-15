---
name: bump-build
description: Use when the user asks to bump/raise ONLY the build number of cuemol2 (e.g. "build だけ上げて", "build no を上げて", "bump the build number", "increment build"). Runs build_scripts/bump_version_build.sh and reports the version change. Do NOT use when the user also wants the revision/patch bumped — use bump-rev-build instead.
---

# Bump build number

Increments only the `build` part of the cuemol2 version
(`major.minor.patch.build`). Example: `2.3.6.482` → `2.3.6.483`.

## Steps

1. Run the build-bump script from the repo root:
   ```bash
   bash build_scripts/bump_version_build.sh
   ```
2. Report the old → new version to the user.
   - The script edits `.bumpversion.cfg`, `src/_version.h`, and
     `uxp_gui/cuemol2/config/version.txt` (commit/tag are disabled in
     `.bumpversion.cfg` — files only, no git commit/tag).
   - Verify with: `grep current_version .bumpversion.cfg`

## Notes

- `build` is configured as an independent part, so it is never reset by
  bumps of other parts.
- The script prints `Specified version (...) does not match last tagged
  version (...)`; this is expected (`tag = False`) and not an error — the
  bump succeeds when the output ends with `Done.`
- Do not `git commit` the version change unless the user explicitly asks.
