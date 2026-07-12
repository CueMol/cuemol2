---
description: Bump the build number (x.y.z.BUILD) and commit
---

Bump the project build number:

1. Run `cd build_scripts && task bump_version_build` (wraps
   `bump_version_build.sh` / bump-my-version; edits `.bumpversion.cfg`,
   `src/_version.h`, `uxp_gui/cuemol2/config/version.txt`).
2. Read the new version from `.bumpversion.cfg` (`current_version`).
3. Commit only those three files with message
   `chore(version): bump build number to <new-version>`.

Do not investigate the Taskfile or search for the command first — just run it.
If not on a feature branch, create one before committing.
