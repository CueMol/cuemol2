# MD Trajectory Bottom Pane (tritium)

Status: implemented (Phase A + B + D-1 block-Add undo/redo). Phase C (block remove / reorder UI) deferred.
Related: [MD Trajectory Open Dialog](md-trajectory-open-dialog.md).

## 目的

ロード済みの `mdtools::Trajectory` を tritium の bottom pane
(Output / Sequence / Animation と同列のタブ) で **再生・シークし、frame 範囲と block
file の対応を可視化し、block を追加** できるようにする。Animation pane
(`AnimationPanel` + `anim/` + `useAnim*`) を下敷きに、視覚/インタラクションの殻を流用する。
これは新規機能であり UXP migration ではない。

## Trajectory の scriptable surface と本タスクでの拡張

Trajectory (`AnimMol : MolCoord`) が公開するのは frame カーソルと block 連結のみ:

| API | 種別 | 用途 |
|---|---|---|
| `frame` / `dynframe` | rw int | シーク (座標書換 + `fireAtomsMoved`) |
| `nframe` | ro int | 合計 frame 数 |
| `frame_aver_size` | rw int | 再生スムージング (本 UI では未露出) |
| `append(TrajBlock)` | method | block 追記 (原子数検証あり) |

block 構造の列挙は未公開だったため、本タスクで **`.qif` に getter を追加** した
(C++ 実体は既存、追加のみの小改修):

- `Trajectory.qif`: `property integer nblock => redirect(getBlockCount, XX) (readonly)`,
  `object<TrajBlock$> getBlock(integer index)`。C++ 側は `getBlockAt` 相当として
  `Trajectory::getBlock(int)` を新規追加 (範囲チェック + `m_blocks[index]`)。
- `TrajBlock.qif`: `property integer nframe => redirect(getSize, XX) (readonly)`,
  `property integer start_index => redirect(getStartIndex, XX) (readonly)`。
  `name` / `src` (ソースファイルパス) / `uid` は `Object` から継承済み。

これで worker から `nblock`/`getBlock(i)` を回して
`{ uid, name, src, nframe, startIndex, format }` の block 配列を組める。
**`Trajectory::removeBlock(index)` は Phase D-1 で追加** (undo に必要。範囲チェック + erase +
start index 再計算 + 現在 frame クランプ + `fireTopologyChanged`。0 block まで許容)。UI からの
削除・drag 並び替え (`moveBlock`) は Phase C 送り。

## undo/redo (Phase D-1)

- **seek / 再生 (`setTrajectoryFrame`)**: 非 undo。`frame` は `nopersist`、Animation transport と
  同じ transient view state。
- **block Add (`appendTrajectoryBlock`)**: undo/redo 可能。`Trajectory::append` が txn 中
  (`getScene()->getUndoMgr()->isOK()`) に `TrajBlockEditInfo`(APPEND) を `addEditInfo` する。undo =
  `removeBlock`、redo = 再 `append`。UndoManager は undo/redo 実行中 `m_fDisable` で記録を止めるので
  再帰記録しない。
- **初回ロード (`loadTrajectory`)**: object 全体の `ObjLoadEditInfo` (scene.addObject) で undo される
  ため、その中の block append も記録はされるが、Add と独立した操作単位。実運用で undo が trajectory を
  0 block にする瞬間は発生しない (Add-undo は追加分 1 個のみ除去、load-undo は object ごと消える)。
- **pane 同期**: append/removeBlock が **trajectory 専用の** `fireTrajBlockChanged()`
  (`OBE_CHANGED`/descr=`"trajBlockChanged"`) を発火。分子の `topologyChanged` (共有結合/原子の add/remove)
  とは意味が異なる (frame 集合が変わっただけで connectivity は不変) ため、専用 descr にしている。
  renderer 側では event category が `args.method` として届く (`EventSlots` が `getCategory()` の
  category=descr を `method` に載せる。`args.obj.descr` ではない)。`useTrajectory` は
  `args.method === "trajBlockChanged"` で refetch、`"atomsMoved"` は無視 (per-frame storm 回避)。

  SEM 分類: `SEM_OBJECT` / `SEM_CHANGED` / category(=descr)=`"trajBlockChanged"`、scope=scene。
  `SEM_ADDED`/`SEM_REMOVING` ではない (それらは scene への object/renderer 追加削除用)。

## 再生の方式: JS タイマー (Animation との最大の差)

Animation は C++ `AnimMgr` の native timer が再生を駆動するが、**Trajectory には再生
エンジンが無い** (公開されているのは frame スカラーのみ)。したがって再生は renderer 側の
JS タイマー (`useTrajPlayback`) で駆動する:

- `isPlaying` の間 `setInterval(1000/fps)` で 1 tick ごとに `frame` を +1 し、
  `setTrajectoryFrame` service で C++ に書く。末尾で loop なら 0 へ、非 loop なら停止。
- したがって **再生中は JS が現在 frame の source of truth**。Animation のような
  「C++ を polling する」構造は不要 (クロックを JS が握る)。
- 停止中は C++ `frame` が真。外部 (script / 他 view) の変更は `atomsMoved`
  (`SEM_OBJECT`/`SEM_CHANGED`) を購読して読み戻す。ただし (a) 再生中・scrub 中は無視、
  (b) 自分の書込直後は self-write guard で無視、(c) `srcUID` が対象 obj のときのみ、
  という 3 条件でフィードバックループを防ぐ。

### イベント購読の注意 (event type は連番、bitmask 不可)

`event.ts` の event type は `SEM_ADDED=1 / SEM_REMOVING=2 / SEM_PROPCHG=3 /
SEM_CHANGED=4` と **連番**で、OR したビットマスクにならない。よって 1 listener で
「構造変更だけ (CHANGED 以外)」を購読できない。`useTrajectory` は
`srcMask=SEM_OBJECT, evtMask=SEM_ANY` で購読し、**handler 内で `evtType===SEM_CHANGED`
を無視** して block 構造の refetch storm (再生中の per-frame atomsMoved) を防ぐ。

## シーク / playhead の意匠

- playhead は block strip に**重ねた縦バー** (`z-index` 上) で、トラック下端に
  **上向き三角 (△) のハンドル**を CSS `::after`/子 div で付ける
  (ruler 側に置く場合は下向き ▽ が対応する。実装は下端 △)。
- シークは ruler / 空 lane を mousedown-drag。drag 中は `previewFrame` で
  **ローカルプレビューのみ** (seek しない)、離して `commit` で 1 回だけ
  `setTrajectoryFrame`。大規模 trajectory を毎 move で再シークしない。整数 frame にスナップ。
  Animation の `handleRulerMouseDown` ライフサイクルと同型。
- 表示 frame = `scrubFrame ?? committedFrame` (Animation の `liveMgr ?? baseMgr` と同型)。

## 構成 (実装ファイル)

- worker: `worker/server/services/trajectory.service.ts`
  (`getTrajectoryState` / `setTrajectoryFrame` (undo txn なし=transient) /
  `appendTrajectoryBlock` (undo txn。`loadTrajectory` の block 追記部を流用))。
  `WorkerCalls.ts` の `ServiceMap` に 3 行。hooks は `cm.invokeService` を直接呼ぶ
  (anim hooks と同じ。client wrapper 追加なし)。
- hooks: `hooks/useTrajectory.ts` (nframe/frame/blocks fetch + 構造イベント refetch) /
  `hooks/useTrajPlayback.ts` (JS タイマー再生 + frame カーソル)。
- components: `components/panels/TrajectoryPanel.tsx` + `panels/mdtraj/`
  (`TrajTransport` / `TrajTrack` / `TrajBlockStrip` / `trackGeometry` (frame<->px))。
- 配線: `BottomPanel.tsx` に `trajectory` タブ、`h3-kit/ObjectSelect` に
  `objectFilters.trajectory` (className==='Trajectory'。`molCoord` は 'Mol' 終端判定のため
  Trajectory を拾わない)、`styles/_md-traj-panel.css` + `app.css` import、
  `data/appIcons.ts` に `panel.trajectory` (FilmSlate)。

## スコープ (現状) と後続

- **含む (Phase A+B+D-1)**: target 選択 / 再生 (JS タイマー) / frame readout+spinbox /
  seek (△ playhead) / frame 数比例の block セグメント / Add block / **Add の undo/redo**。
- **後続 (Phase C)**: UI からの block 削除・drag 並び替え。`Trajectory::removeBlock` は D-1 で実装済み
  なので、残りは `moveBlock` (並び替え) + worker service (`removeTrajectoryBlock`/`moveTrajectoryBlock`)
  + UI 有効化 (現在ボタン枠は disabled で配置済み)。remove の undo は `TrajBlockEditInfo` に REMOVE
  モードを足す。
- **スコープ外**: prmtop/psf/netcdf topology、per-block 間引き、`frame_aver_size` UI、
  movie/画像エクスポート、trajectory セットの MRU。

## 検証

- C++: `task run_gtest` (回帰。`.qif` は getter 追加のみ)。
- worker/hook: `__test__/trajectoryService.test.ts` (block マッピング / frame クランプ /
  append 呼び出し順・エラー rollback)、`__test__/trackGeometry.test.ts` (frame<->px)、
  `__test__/useTrajPlayback.test.tsx` (commit clamp / preview / skip / tick 前進 / canControl)。
- build: `tsc -p tsconfig.web.json` (新規ファイルにエラーなし) + `task build_tritium` (通過)。
