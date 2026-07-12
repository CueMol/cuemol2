---
description: Bump the revision number (x.y.REV.build) and commit
---

Bump the project revision number:

1. Run `cd build_scripts && task bump_version_rev` (wraps
   `bump_version_rev.sh` / bump-my-version; edits `.bumpversion.cfg`,
   `src/_version.h`, `uxp_gui/cuemol2/config/version.txt`).
2. Read the new version from `.bumpversion.cfg` (`current_version`).
3. Commit only those three files with message
   `chore(version): bump revision number to <new-version>`.

Do not investigate the Taskfile or search for the command first — just run it.
If not on a feature branch, create one before committing.
