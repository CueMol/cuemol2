# pymconsole Phase 3 (未実装コマンドの追加)

Status: **未実装 (計画)**。
関連: [pymconsole plugin 計画 (Phase 1-2)](260913-pymconsole-plugin-plan.md)、
[pym console 調査報告](pymconsole-research-260529.md)、
[MCP / tool カタログ共通化計画](260926-mcp-tool-catalog-plan.md)。

## 背景

pymconsole は Phase 2 までで 41 コマンドを持つ (load / fetch / delete / set_name / cd / pwd / ls /
png / quit / get_names / select / indicate / deselect / count_atoms / get_chains / set / get / unset /
bg_color / zoom / center / origin / reset / turn / move / view / refresh / show / hide / as / color /
distance / angle / dihedral / isomesh / isosurface / isolevel / enable / disable / help)。
Phase 2 計画の「Phase 3 (以降、需要次第)」に挙げていた項目を、既存の CueMol 資産 (worker service /
C++ QIF) で実現できるかを調べ、工数と C++ 変更の有無で 3 段に分けた。

### 方針

新コマンドは Phase 1-2 と同じ規則で、**既存 worker service を呼ぶ薄い adapter** として書き、PyMOL 固有の
解釈 (引数の文法、PyMOL の名前、PyMOL の文言) は `parser/` と `commands/helpers.ts` に置く。

**[MCP / tool カタログ共通化計画](260926-mcp-tool-catalog-plan.md) の内容 (ops / opRuntime / toolCatalog の
切り出し、agent との共通化、MCP server) はこの Phase では実装しない。** コマンドは pymconsole plugin の中だけで
完結させる。共通化は同計画の側で、別の作業として行う。

## Phase 3a: console だけで完結するもの (C++ 変更なし)

| コマンド | 実装 | 注意 |
|---|---|---|
| `@file.pml` / `run file.pml` | worker で `fs.readFileSync(resolvePath(cwd, p))` -> `splitCommands` -> 同じ submission の中で実行 (`runCommand.ts` の `@` エラーを置き換え) | 入れ子 `@` は深さ上限 (例 8) で拒否。**1 submission = 1 undo txn を維持** (スクリプト全体が Cmd+Z 1 回で戻る)。`.py` は拒否 (Python embedding 非採用) |
| `log_open` / `log_close` / `log` | worker に書き込み先を 1 つ持ち、`runCommand` が受け付けた行を `fs.appendFileSync`。`log` は任意の行を書く | 出力ではなく**入力行**を記録 (PyMOL と同じ)。`quit` / アプリ終了で閉じる |
| fetch / 長い submission の中断 | `RunCommandArgs` に `runId` を追加。fetch の `reqId` を runId 由来にし、panel に **Stop** ボタン (実行中のみ)。Stop は `cancelStreamLoad` + worker 側 abort フラグ (コマンド間で確認) | 中断時も「変更があれば commit」規則のまま。getpdb plugin の cancel 経路 (`useGetPdbCommand.ts`) を参照 |
| `show labels` の不具合修正 | `repCommands.ts` の `labels -> *namelabel` が `getNewRendererOptions` の `*` 型除外で必ず失敗している。3c の `label` と合わせて `*namelabel` を専用経路で作る | `*namelabel` は `sel` property を持たないので、show/hide の selection 和・差は使えない (3c で扱う) |

## Phase 3b: 既存 service の adapter (C++ 変更なし)

| コマンド | 使う service / API | 写像と注意 |
|---|---|---|
| `save file.pdb[, selection]` / `.sdf` / `.qsc` | 分子: `services/file/objectSave.ts` の writer 経路 (`pdb` / `sdf`)。selection は writer の `sel` property (`makeSel`)。scene: `services/scene/saveScene.ts` (`qsc_xml`) | **部分保存では `convToLink` を立てない** (object の `src` が新ファイルに付け替わるため)。専用の関数を 1 つ足す。`.qsc` 保存は undo 履歴を消し scene 名を変えるので、**undo / redo と同じく txn の外で実行** (`runCommand` で intercept)。`.cif` / `.pse` は理由付きで拒否 (mmCIF writer は C++ に無い) |
| `set_color name, [r,g,b]` | `services/style/styleSetEdit.ts` の `setStyleSetColor`。書き込み先は scene local の style set `pym` (無ければ `styleOps.createStyleSet`) | 定義後は `toCueMolColor` が未知の名前を素通しするので `color name, sel` がそのまま効く (`ColCompiler` が `NamedColor` として後で解決)。補完は既に `getColorDefsJSON` を読んでいる |
| `spectrum b\|q\|count\|resi [, palette, selection]` | `services/coloring/applyColoring.ts` の `setRendererColoring` + `setColoringProp`。`b` -> `paint-type-bfac`、`q` -> bfac `mode=occ`、`count`/`resi` -> `paint-type-rainbow` `incr_mode=resid` | **renderer 全体の着色を置き換える**。selection 指定は「その selection を含む `pym:` renderer を対象にする」までで、部分着色はしない (警告)。palette は `blue_red` などを Bfac の 2 色 / Rainbow の hue 範囲に近似し、写せない palette は拒否。`color` (paint) と上書きし合う点を help に明記 |
| `align` / `super` / `pair_fit` | `services/molops/superposeMol.ts` の `superposeMol` (`SSM` / `LSQ`)。RMSD は `MolAnlManager.calcRMSD` / `superposeSSM_rmsd` で取り、console に出力 | `align` / `super` -> SSM (配列アライメントは無い)、`pair_fit` -> LSQ。LSQ は 2 selection の原子数一致が必須で、不一致は C++ が throw するので事前に数えて理由付きで返す。`cealign` は拒否 (CE 無し)。`superposeMol` 自体が undo txn を開くが入れ子は外側に吸収される |
| `get_view` / `set_view` | `services/view/viewXform.ts` (zoom / slab / distance / center) + `view.rotation` (Quat) の直接読み書き (`reset` と同じ) | PyMOL の 18 要素 (回転 3x3、camera 空間の原点、原点、front / back clip、orthoscopic) と CueMol の quaternion + center + distance + slab を相互変換する純関数を `helpers` に置く (テスト対象)。往復で一致する範囲を仕様とし、clip の意味差は近似と明記 |
| `mplay` / `mstop` / `rewind` | `services/anim/transport.ts` (`play` / `stop` / `goTime`) = AnimMgr | AnimMgr の timeline を再生する。**MD trajectory の再生は renderer 側の `setInterval` (`mdtools/renderer/useTrajPlayback.ts`) なので console からは動かせない**。その旨を返す |
| `frame n` / `count_states` | trajectory: mdtools の `setTrajectoryFrame` / `getTrajectoryState`。MorphMol: `getMorphFrames` と `frame` property の `setGenericProp` | 対象は selection / object 名で決める (無ければ最初の該当 object、警告付き)。PyMOL の state は 1 始まり、CueMol の frame は 0 始まり。mdtools plugin が無効なら trajectory は扱えない旨を返す (plugin 間 import はしない。service 名 `plugin.mdtools.*` を worker 内で直接呼べるかは実装時に確認) |

## Phase 3c: C++ 変更が要るもの

| コマンド | 必要な C++ 変更 | 実装 |
|---|---|---|
| `label selection, expression` | `NameLabelRenderer.qif` に `boolean addLabel2(integer aid, string label)` (C++ の既存 `addLabelByID` を公開) | object ごとに `*namelabel` renderer を 1 つ (`pym:labels`)。selection の原子 id を列挙して expression を評価 (`name` / `resn` / `resi` / `chain` / `b` / `q` と文字列連結の限定サブセット)。`maxlabel` (既定 50) を件数に合わせて上げる。**原子 id 列挙の helper** (selection -> aid 配列) が worker に無いので足す。空 expression (`label sel, ''`) は削除 |
| `orient [selection]` | 無しでも可 (TS で共分散 -> `Matrix.diag3()`)。ただし `getCrdArray` / `getSelArray` の ByteArray を TS から読んだ実績が無いので、実装が重ければ `MolCoord` に主軸を返す C++ helper を足す | 主軸を view の `rotation` に写し、`fitView` で収める |
| PyMOL 設定名 alias の拡充 | 無し | 現在は `bg_rgb` と `orthoscopic` の 2 件のみ。調査報告 §4.12 から、CueMol に同義の property がある頻出設定 (`cartoon_transparency`、`stick_radius`、`sphere_scale`、`ray_trace_mode` 相当など) を表に足す。**意味が一致するものだけ** (近いもので代用しない) |

## PyMOL 側の参照元 (`~/ext/pymol-open-source`)

実装時は引数・既定値・挙動・エラー文言を PyMOL 本体のソースで確認する (Phase 1 の parser 移植と同じ扱い)。
パスは `~/ext/pymol-open-source/` からの相対。

| コマンド | 参照先 |
|---|---|
| `@` / `run` | `modules/pymol/parser.py` (`@` 行の処理)、`modules/pymol/commanding.py` (`run`)、`modules/pymol/keywords.py` (引数表) |
| `log_open` / `log_close` / `log` | `modules/pymol/commanding.py` |
| `save` | `modules/pymol/exporting.py` |
| `set_color` / `spectrum` / `label` / `orient` / `get_view` / `set_view` | `modules/pymol/viewing.py` (palette は `modules/pymol/constants_palette.py`) |
| `align` / `super` / `pair_fit` | `modules/pymol/fitting.py` |
| `mplay` / `mstop` / `rewind` / `frame` | `modules/pymol/moving.py` |
| `count_states` | `modules/pymol/querying.py` |
| 設定名 alias | `layer1/SettingInfo.h` (設定名・型・既定値の一覧)、`layer1/Setting.cpp` |
| `get_view` の 18 要素の意味 | `layer1/View.cpp` / `layer1/SceneView.cpp` |
| label の描画・式 | `layer2/RepLabel.cpp`、式の評価は `modules/pymol/viewing.py` の `label` から辿る |

## 採らない / 先送り

- `.cif` / `.pse` の保存 (mmCIF writer が C++ に無い。`.pse` は PyMOL 固有形式)
- `cealign` (CE アルゴリズムが無い)、`usalign`
- MD trajectory の `mplay` (再生ループが renderer 側にある。worker へ移すのは mdtools 側の設計変更)
- `spectrum` の selection 単位の部分着色 (paint の residue ごとエントリで偽装すると大量のエントリになる)
- 暗黙コンテキスト (直近 selection 名の省略): PyMOL でも曖昧で、誤操作の元になるため当面見送り
- Phase 2 計画の Tier 2 (picking / 編集モード依存、重量級アルゴリズム) は引き続き対象外

## 実装順

1. **3a**: `@` / `run`、`log_*`、Stop (runId + 中断)、`show labels` の失敗を理由付きエラーにする暫定修正
2. **3b**: `save` -> `set_color` -> `align` 系 -> `get_view` / `set_view` -> anim 系 -> `spectrum`
   (利用頻度と実装の確実さの順)
3. **3c**: `label` (QIF 追加を含む)、設定 alias の拡充、`orient`

各段で「実装 -> ユーザー目視確認 -> テスト」の順 (CLAUDE.md の検証チェーン)。

## テスト (最小集合)

- `@file`: 入れ子の深さ上限、スクリプト全体が 1 txn (途中失敗でも変更があれば commit)
- 中断: Stop が `cancelStreamLoad` に runId 由来の reqId を渡す (wire 契約)
- `save`: 部分保存で writer に `sel` が渡り、`convToLink` が立たないこと。`.qsc` が txn の外で走ること
- `get_view` / `set_view`: PyMOL 18 要素 <-> CueMol の変換の往復
- `spectrum`: `b` / `q` / `resi` が期待する coloringId と property に写ること (1 件の表テスト)
- `label`: expression 評価器 (受け付ける語と拒否する語)
- C++ (`addLabel2`): 指定文字列でラベルが追加されること (gtest 1 件)

## 未確認事項 (実装時に確認)

- worker 内で `plugin.mdtools.*` の service 関数を import せずに呼ぶ経路 (plugin 間の依存を作らずに済むか)。
  難しければ `frame` / `count_states` は MorphMol と trajectory の C++ property を直接読む。
- `getCrdArray` / `getSelArray` の ByteArray を TS で読めるか (`orient` の実装方針を左右する)。
- `superposeMol` の `autoRecenter` / `useprop` を console から既定値で呼んだときの挙動が GUI と一致するか。
