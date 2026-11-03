# CI: ビルド不要な変更だけの push では重いビルドを飛ばす (日本語)

`build2.yml` (macOS arm64 / x64、Windows) と `build_linux.yml` (Ubuntu) は全ブランチの push で走る。
feature ブランチの変更が docs などビルドに使われないファイルだけのときは、ジョブは動かしたまま、
ビルドの各ステップを `if:` で飛ばす。必須チェックは数十秒で成功になる。

## 1. なぜジョブではなくステップを飛ばすか

`develop` のブランチ保護の必須チェック (status check の context) は、ジョブ名の
`MacOS 15 arm64 clang`、`MacOS 15 x64 clang`、`Ubuntu 22 x64`、`Windows intel clang-cl`。

- workflow の `on:` の `paths-ignore` は workflow ごと起動しないので、必須チェックが未報告のまま残り、
  PR をマージできなくなる。
- ジョブの `if:` でスキップすると、スキップは成功扱いだが、macOS の 2 つは matrix ジョブ
  (`name: '${{ matrix.name }}'`) なので matrix が展開される前に評価され、`${{ matrix.name }}` の名前で
  報告されて必須チェックと一致しない。

よってジョブは常に動かし、checkout 以降のステップに条件を付ける。保護設定は変えない。

## 2. 判定 (`build_scripts/ci_needs_build.sh`)

`true` (ビルドする) か `false` を stdout に、理由を stderr に出す。入力は環境変数 `EVENT_NAME` / `REF` /
`SHA` (GitHub の `github.event_name` / `github.ref` / `github.sha`) と `BASE_REF` (既定 `origin/develop`)。
既定値があるのでローカルでもそのまま試せる。

| event | 判定 |
|---|---|
| `workflow_dispatch`、タグ (`refs/tags/*`) | 常に `true` (リリースは必ずビルドする) |
| `develop` への push | 常に `true` |
| それ以外のブランチへの push | `merge-base(BASE_REF, SHA)`..`SHA` (ブランチ全体) で判定 |

- **`develop` は常にビルドする**。`develop` も `cancel-in-progress: true` なので、コード変更のマージの
  ビルド中に docs だけの PR をマージすると前の run が中止される。新しい run が docs だけの差分で省略すると、
  最新コードの full build と artifact が作られないまま終わるため。
- **feature ブランチはブランチ全体を見る** (`github.event.before` は使わない)。push 1 回分だけを見ると、
  `cancel-in-progress` で中止されたコード変更の run の後に docs だけの push が来たとき、head がビルドされない
  まま必須チェックが成功してしまう。新規ブランチも同じく merge-base から判定する。
- merge-base が取れない、git が失敗する、差分が空 (develop と同じ) のときは `true`。迷ったらビルドする。
- 変更されたファイルが**すべて**次に当たるときだけ `false`:
  `docs/**`、ルート直下の `*.md`、`CLAUDE.md` (どこでも)、`.claude/**`、`LICENSE*`。
  ソースの中の `.md` は対象外 (`tritium/cli/src/skill/SKILL.md` は CLI の bundle に入る)。
  `.github/workflows/**` の変更もビルドする。

## 3. workflow 側

- **判定ジョブ**: `build2.yml` は `setup_matrix` (matrix の計算と同じジョブ)、`build_linux.yml` は `changes`
  (別 workflow のジョブは `needs` にできないため)。どちらも `actions/checkout` を `fetch-depth: 0`、
  `filter: blob:none` (履歴だけ、ファイルの中身は取らない) で取り、スクリプトの結果を output `build` にする。
- **ビルドジョブ** (`build_posix`、`build_win_x64`、Linux の `build_posix`): 判定ジョブを `needs` にし、
  checkout 以降の全ステップに `needs.<判定ジョブ>.outputs.build != 'false'` を付ける (既存の条件とは `&&`)。
  checkout 直後の「Build skipped」ステップだけは `== 'false'` で、省略したことを出す。
- **省略は明示的な `'false'` のときだけ**。存在しない output の参照は空文字になるので、`== 'true'` でビルド
  する書き方だと、output の設定漏れや書き間違いでビルドされないまま必須チェックが成功してしまう。
- `release_build` はジョブ単位で `if: needs.setup_matrix.outputs.build != 'false'`。ビルドしなければ集める
  artifact が無い。matrix ジョブでも必須チェックでもないので、ジョブ単位のスキップで問題ない。
  `publish_npm` はタグだけで動き、タグは常にビルドする。

## 4. ステップを足すとき

**新しいステップにも同じ条件を付ける**。付け忘れると、ビルドを省略した run でそのステップだけが走り、
ビルドの生成物を使うもの (`ctest`、パッケージング、artifact の upload) はビルドディレクトリが無くて失敗し、
docs だけの PR の必須チェックが赤くなる。両 workflow の冒頭コメントにもこの規則を書いてある。
ステップを足した PR では、docs だけの commit を別に push し、全ステップが skipped になることを確かめる。

## 5. 既知の制約

- 省略時もビルドジョブの runner は起動する (macOS / Windows でも数十秒)。
- `develop` は docs だけの PR のマージでもフルビルドする (マージ後なので作業は止めない)。

<!-- CI skip test: remove -->
