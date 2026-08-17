---
name: release
description: Use when the user asks to cut/publish a cuemol2 release (e.g. "リリースして", "release を作って", "タグを打ってリリース", "cut a release", "publish v2.3.8"). Bumps the version if needed, writes the hand-authored release note from the merged PRs, tags, pushes, and verifies the published GitHub Release. Do NOT use for a version bump alone -- use bump-build or bump-rev-build for that.
---

# Cut a cuemol2 release

A release is started by pushing a `v*` tag: `tags: ['v*']` in
`.github/workflows/build2.yml` is the only trigger. Nothing in `Taskfile.yml`
tags or publishes -- tagging is manual.

Two workflows then attach assets to that one release and **either may create it
first**:

| Workflow | Builds | Sets the release body? |
|---|---|---|
| `build2.yml` (`release_build` job) | macOS arm64 / x64 (+ embedded-Python variant), Windows x64 -- both CueMol2 (UXP) and CueMol3 | **Yes** |
| `build_linux.yml` | Linux AppImage + deb | No (cannot clobber the body) |

## Steps

1. **Check the starting point.** Refuse to proceed and tell the user if any of
   these fails:
   ```bash
   git branch --show-current      # expect develop
   git status --short             # expect empty
   git fetch && git rev-parse HEAD origin/develop | uniq -c   # expect one line
   gh run list --branch develop --limit 3                     # expect success
   ```

2. **Settle the version.** All three files must agree:
   ```bash
   grep current_version .bumpversion.cfg
   grep QM_VERSION src/_version.h
   cat uxp_gui/cuemol2/config/version.txt
   ```
   If the version has not been bumped since the last tag, ask which part to
   bump, then use the `bump-build` or `bump-rev-build` skill. Commit as
   `chore(version): bump version <old> -> <new>`.

3. **Collect the merged PRs since the previous tag.**
   ```bash
   PREV=$(git tag --sort=-v:refname | head -1)
   git log --pretty='%s%n%b' --merges "$PREV"..develop \
     | grep -oE 'Merge pull request #[0-9]+' | grep -oE '[0-9]+' | sort -un
   ```
   Read each one's description, not just its title:
   `gh pr view <N> --json number,title,body`. With more than ~20 PRs, split the
   numbers across parallel subagents and have each return a per-PR summary
   (type / affected component / what changed for the user).

4. **Write `docs/release_notes/v<version>.md`.** This file becomes the release
   body verbatim. See `docs/release_notes/README.md` for the convention, and an
   existing note for the shape. Requirements:
   - Group by what the reader cares about (new features, fixes, per app:
     CueMol3 / CueMol2 / core), not by PR number order.
   - Write from the user's side: what they can now do, what no longer breaks.
     Leave out which files or functions changed.
   - **Never invent a feature.** If a PR's description is thin, describe only
     what it actually says, or leave it in a short "Other changes" list.
   - Note known limitations and anything not yet migrated from CueMol2, since
     that is what users hit first.
   - Show the note to the user and incorporate their feedback before tagging.

5. **Commit the note**, e.g. `docs(release): add release notes for v<version>`.
   Push to `develop`.

6. **Tag and push.** Annotated, matching the recent convention:
   ```bash
   git tag -a v<version> -m "Release <version>"
   git push origin v<version>
   ```

7. **Verify the published release** once both workflows finish:
   ```bash
   gh run list --limit 5
   gh release view v<version> --json name,isDraft,body,assets \
     --jq '{name,draft:.isDraft,bodyLen:(.body|length),assets:[.assets[].name]}'
   ```
   `bodyLen` must be non-zero -- an empty body is the exact failure v2.3.7.484
   shipped with. Expect macOS arm64/x64 and Windows tar.bz2 for CueMol2, plus
   dmg / exe / deb / AppImage for CueMol3.

## Notes

- To fix the notes after publishing, edit the release -- never re-tag:
  ```bash
  gh release edit v<version> --notes-file docs/release_notes/v<version>.md
  ```
- If `docs/release_notes/<tag>.md` is missing, `build2.yml` falls back to
  GitHub's generated notes (a list of PR titles). That is a safety net, not the
  goal: prepare the file.
- Tag name is `v` + `QM_VERSION`, e.g. `v2.3.8.494`. Do not tag a version whose
  three version files disagree.
- Releases are unsigned; `tritium/packaging/README.md` documents the macOS
  quarantine and Windows SmartScreen steps users need. Link it from the note
  when the packaging story changes.
- Do not push a tag until the user has approved the release note.
