# Release notes

One file per release, named after the tag: `v<major>.<minor>.<patch>.<build>.md`
(e.g. `v2.3.8.494.md`). The file's whole contents become the GitHub Release
body.

`build2.yml`'s `release_build` job looks for `docs/release_notes/<tag>.md`. If
it exists, it is used verbatim; if not, the job falls back to GitHub's generated
notes (the list of merged PR titles) so a release is never published with an
empty body -- which is what happened to v2.3.7.484.

Write the note by hand, from the merged PRs' descriptions rather than their
titles. A title list says which branches landed; it does not tell a user what
changed for them.

## Release procedure

1. Bump the version so `.bumpversion.cfg`, `src/_version.h` and
   `uxp_gui/cuemol2/config/version.txt` agree:

   ```sh
   cd build_scripts
   task bump_version_rev     # x.y.REV.build -- only when the revision moves
   task bump_version_build   # x.y.z.BUILD
   ```

   Commit as `chore(version): bump version <old> -> <new>`.

2. Write `docs/release_notes/v<version>.md`. To collect the material:

   ```sh
   git log --pretty='%s%n%b' --merges <previous-tag>..develop \
     | grep -oE 'Merge pull request #[0-9]+' | grep -oE '[0-9]+' | sort -un
   # then read each: gh pr view <N> --json title,body
   ```

3. Tag and push. `tags: ['v*']` in `build2.yml` is what starts a release build;
   nothing else does.

   ```sh
   git tag -a v<version> -m "Release <version>"
   git push origin v<version>
   ```

4. Two workflows then attach to that one release, and either may create it
   first: `build2.yml` builds macOS (arm64 / x64, plus an embedded-Python
   variant) and Windows x64 for both CueMol2 (UXP) and CueMol3, and
   `build_linux.yml` builds the Linux AppImage and deb. Only `build2.yml` sets
   the body; `build_linux.yml` passes no body, so it cannot overwrite the notes
   regardless of the order.

5. Check the published release: the body should be the file from step 2, and all
   the expected assets should be attached.

To correct the notes after publishing, edit the release rather than re-tagging:

```sh
gh release edit v<version> --notes-file docs/release_notes/v<version>.md
```
