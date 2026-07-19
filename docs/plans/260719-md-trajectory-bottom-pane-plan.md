# MD Trajectory Bottom Pane 実装プラン

作成日: 2026-07-19

## Context (なぜ)

`feature/md-trajectory-open-dialog`（PR #447）で「topology + 複数 trajectory を開いて Trajectory オブジェクトを
ロードし、renderer を付ける」フローを実装した。しかし現状 tritium には **ロード済み Trajectory を再生・シークし、
どの frame 範囲がどの block file かを可視化し、block を編集する UI が無い**。libcuemol2 側には Phase 2 MVP で
`Trajectory`(`AnimMol : MolCoord`) + block-centric な `TrajBlock` 連結が実装済みで、frame シーク・block 追加は
scriptable 済みだが、**block 構造の列挙 API と削除/並び替えは未公開/未実装**。

本タスクは Animation bottom pane と同系の **MD Trajectory bottom pane** を新設する。既存の Animation pane
(`AnimationPanel` + `anim/` + `useAnim*`) が視覚/インタラクションの理想的な下敷きで、殻はほぼ流用できる。
ただし Trajectory の scriptable surface は Animation(`AnimMgr`) より薄く、段階的に C++ を拡張する。

## 確定した方針（ユーザー決定）

- **block セグメント表示（要件: どの範囲がどの block file か）は C++ `.qif` を拡張して実現**（frame 数比例の正確な
  セグメント）。等幅 MVP や JS 側 manifest では代替しない。
- **削除・drag 並び替えは今回スコープ外（後続 Phase C）**。今回は **Add（file open で block 追記）のみ**。
  UI には Remove/Move ボタン枠を置くが disabled のままにし、Phase C で有効化する。
- **再生は JS 側タイマー方式**（Trajectory には C++ 再生エンジンが無いため。詳細は「データモデルと同期」）。
- **playhead は block strip に重ねた縦バー + トラック下端の上向き三角(△)ハンドル**（ruler 側に置く場合は下向き▽）。

## UI/UX 仕様

`BottomPanel.tsx` のタブに `Trajectory` を追加。中身は `AnimationPanel` を簡略化した構成
（Animation の「複数レーン」ではなく「1 object・1 トラック」なので左チャンネルリストは無し。
先頭の target ドロップダウンが主役）。

```
┌ タブ: [Output] [Sequence] [Animation] [Trajectory] ─────────────────────────┐
│ ── Transport 行 (.anim-transport 流用) ──────────────────────────────────── │
│  Target ▼[Trajectory-1        ]   |◀  ▶/⏸  ⏹  ▶|   Frame [ 42 ]/ 500        │
│                                    Loop ◉   Speed ▼[15 fps]                   │
│ ── Track 行 (.anim-canvas/.anim-ruler/.anim-strip 流用) ────────────────────  │
│  ruler: 0        100      ┃ 200        300        400        500             │
│         ┌────────┬────────╂─────────┬──────────┬──────────────────┐         │
│  blocks │ md1.xtc│ md2.xtc┃         │ md3.dcd  │      md4.trr      │ ← 縦バー │
│         └────────┴────────╂─────────┴──────────┴──────────────────┘  貫通    │
│                           △  ← seek handle（上向き三角・トラック下端）        │
│ ── Block ツールバー (.anim-label-toolbar 流用) ─────────────────────────────  │
│  [＋ Add…] [🗑 Remove(P.C)] [◀ Move(P.C)] [Move ▶(P.C)]                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Target 選択**: `h3-kit/ObjectSelect`（`Trajectory` 用 filter を追加）。scene に複数 Trajectory があり得るので
  object 単位で選ぶ。未ロード時は空状態（"No trajectory loaded -- File > Open MD Trajectory..."）。
- **Transport**: `FormButton`+`ButtonRow`+`media.*` icon。skip-to-start / play-pause / stop / skip-to-end。
  Loop は `SwitchField`、Speed(fps) は `SelectField` か `SliderField slider={false}`。
- **Frame info**: `frame / nframe` を `.anim-readout` で表示。現在 frame は編集可能 spinbox
  (`SliderField slider={false}`, min=0 max=nframe-1)。
- **Track/segments**: block を frame 数比例で 1 本のトラックに並べる（`AnimStrip` 流用、色分け、basename(src) +
  形式バッジ XTC/DCD/TRR）。Phase A は「0..nframe の連続バー 1 本」、Phase B で本物のセグメントに置換。
- **playhead + seek**: `.anim-playhead`（縦バー、strip より前面 z-index）+ CSS `::after` の上向き三角(△)ハンドル。
  ruler/トラック上を mousedown-drag、または △ を drag で移動。整数 frame にスナップ。drag 中はローカルプレビュー、
  離して確定（`handleRulerMouseDown` ライフサイクル流用）。
- **Block ツールバー**: `ButtonRow`+`FormButton`。Add(`ui.add`) は Phase A で有効、
  Remove(`ui.trash`)/Move(`ui.caretLeft`/`ui.caretRight`) は Phase C まで disabled。

## Phase 分割

| Phase | 内容 | C++ 変更 |
|---|---|---|
| **A** | bottom pane + target 選択 + transport(JS タイマー再生) + frame readout + seek + △playhead + Add block。トラックは連続バー1本 | なし（今日の scriptable API のみ） |
| **B** | `.qif` に block getter を公開 → frame 数比例の正確な block セグメント（要件の中核） | 追加のみ（getter 公開 + wrapper 再生成） |
| **C** | Remove + drag 並び替え | 新規（`removeBlock`/`moveBlock` 実装 + `.qif`）※今回は着手しない、設計のみ記録 |

---

## 実装項目

### Phase A — フロントエンド（今日の API で動く）

**A-1. worker service `worker/server/services/trajectory.service.ts`（新規, multi-service）**

```ts
// getTrajectoryState({ sceneId, objId }) -> { nframe, frame }
//   scene = ctx.sceMgr.getScene(sceneId); traj = scene.getObject(objId) as Trajectory
//   return { nframe: traj.nframe, frame: traj.frame }   // Phase B で blocks[] を追加
//
// setTrajectoryFrame({ sceneId, objId, frame }) -> { frame }
//   traj.frame = clamp(frame, 0, nframe-1)              // 再生/シークの seek。undo txn で包まない(transient)
//   return { frame: traj.frame }
//
// appendTrajectoryBlock({ sceneId, objId, path, nevery? }) -> { ok, nframe }
//   withUndoTxn(scene, 'Add trajectory block', () => {
//     nick = TRAJ_READER_BY_EXT[ext(path)]              // dcd->dcdtraj / xtc->xtctraj / trr->trrtraj
//     r = ctx.strMgr.createHandler(nick, OBJREADER_CATEGORY)
//     r.targTrajUID = traj.uid; if (nevery>1) r.nevery = nevery
//     blk = r.createDefaultObj(); r.attach(blk); r.setPath(path); r.read(); r.detach()
//     traj.append(blk)
//   }); return { ok:true, nframe: traj.nframe }
```
`loadTrajectory.service.ts`(PR #447) の block 追記部を流用。`TRAJ_READER_BY_EXT`/`OBJREADER_CATEGORY`/`withUndoTxn`
も同様に再利用。`setTrajectoryFrame` は原子座標書換のみで構造を変えないため undo 対象外（Animation transport と同じ判断）。

**A-2. 登録配線（3 ファイル）**
- `worker/shared/WorkerCalls.ts` `ServiceMap` に 3 行追加（`getTrajectoryState`/`setTrajectoryFrame`/
  `appendTrajectoryBlock` の `{ args; result }`）。
- `worker/client/apis/fileApi.ts`（or 新規 `trajApi.ts`）に client ラッパ。`worker/client/AsyncCueMol.ts` に委譲。
- `worker/server/services/index.ts` は `import.meta.glob` 自動登録のため編集不要。

**A-3. ObjectSelect の Trajectory filter**
- `h3-kit/ObjectSelect.tsx` `objectFilters` に `trajectory: (it) => it.className === 'Trajectory'` を追加
  （`Trajectory` は `MolCoord` 派生だが className が 'Mol' で終わらないため既存 `molCoord` filter に載らない）。

**A-4. hooks（新規 2 本）**
- `hooks/useTrajectory.ts` — target obj の `{ nframe, frame }`（Phase B で blocks）を fetch。
  target uid に対し `atomsMoved`(`SEM_OBJECT`/`SEM_CHANGED`) を購読し、発火時に `frame` を読み戻して同期
  （このイベントは frame 値を運ばないので read-back 必須）。target 一覧churnには `SEM_OBJECT`/`SEM_SCENE`
  （ObjectSelect 側が既に購読）。append/remove 後は service 成功で明示 refetch。
- `hooks/useTrajPlayback.ts` — JS タイマー(rAF/interval) で play/pause/stop/skip/loop/speed(fps) を実装。
  各 tick で次 frame を計算し `setTrajectoryFrame` を呼ぶ。末尾で loop なら 0 へ、非 loop なら stop。
  vitest の fake-timer 注意点(tritium/CLAUDE.md)に従い、タイマー callback を捕捉して手動 invoke できる形にする。

**A-5. components（新規, `components/panels/` + `panels/mdtraj/`）**
- `components/panels/TrajectoryPanel.tsx` — orchestration（`AnimationPanel.tsx` を下敷きに簡略化）。
  target ObjectSelect + `TrajTransport` + `TrajTrack` + block ツールバー + 空状態。
- `panels/mdtraj/TrajTransport.tsx` — `AnimTransport.tsx` の shape を流用。
- `panels/mdtraj/TrajTrack.tsx` — ruler + segments + playhead + scrub。`AnimTimeRuler` + `AnimationPanel`
  の `handleRulerMouseDown` を流用。
- `panels/mdtraj/TrajBlockStrip.tsx` — 1 セグメント（Phase A は連続バー1本、Phase B で本実装）。
- `panels/mdtraj/trackGeometry.ts` — frame↔px 変換（`anim/timelineGeometry.ts` の ms 軸を frame 軸へ）。

**A-6. BottomPanel 配線**
- `components/panels/BottomPanel.tsx`: `BottomTabType` に `"trajectory"` 追加、`TabButton` 1 個追加、
  `renderContent()` に `case "trajectory"` 追加、`TrajectoryPanel` を import。

**A-7. CSS / icons**
- `styles/_md-traj-panel.css` 新規（`--anim-*` トークン流用 + block 色 `--mdtraj-block-*` + playhead 三角）。
  `app.css` に `@import`。playhead 縦バーは `.anim-playhead` 相当（strip より前面）、`::after` で上向き三角。
- `data/appIcons.ts`: `panel.trajectory`（当面 `panel.animation` の FilmStrip 流用 or 新規 Phosphor icon）。
  transport の `media.*`・tool の `ui.add`/`ui.trash`/`ui.caretLeft`/`ui.caretRight` は既存。

**A-8. Block Add（file open）**
- Block ツールバー Add → `DIALOG_PICK_PATH`(`multi:true`, TRAJ_FILTERS)（PR #447 で拡張済み）→
  選択各ファイルを `appendTrajectoryBlock` で順に追記。`components/dialogs/trajPathHistory.ts` の last-path を流用。

### Phase B — C++ block getter 公開 + セグメント描画

**B-1. C++ `.qif` 拡張（追加のみ）**
- `src/modules/mdtools/Trajectory.qif`:
  ```
  property integer nblock => redirect(getBlockCount, XX) (readonly);   // getBlockCount() は Trajectory.hpp:141 に既存
  object<TrajBlock$> getBlock(integer index);                          // 新規 method
  ```
- `src/modules/mdtools/Trajectory.hpp/.cpp`: public `TrajBlockPtr getBlockAt(int i) const { return m_blocks[i]; }`
  を追加（`getBlockCount()` は既存）。`getBlock(int)` の qif 実装は範囲チェック後 `m_blocks[index]` を返す
  （smartptr 返却の既存パターンに従う）。
- `src/modules/mdtools/TrajBlock.qif`:
  ```
  property integer nframe      => redirect(getSize, XX) (readonly);       // getSize() は TrajBlock.hpp:140 に既存
  property integer start_index => redirect(getStartIndex, XX) (readonly); // getStartIndex() は TrajBlock.hpp:138 に既存
  ```
  `name`/`src`(ファイルパス)/`uid` は `Object` から継承済み（追加不要）。
- `task build_libcuemol2`（wrapper 自動再生成: `tritium/core/src/wrappers/Trajectory.ts`/`TrajBlock.ts`）→
  `cd tritium/core && npm run install`（addon 再ビルド）。

**B-2. worker `getTrajectoryState` を拡張**
- `nblock`/`getBlock(i)` を回して `blocks: [{ uid, name, src, nframe, startIndex, format }]` を返す
  （format は src の拡張子から）。

**B-3. frontend セグメント描画**
- `TrajBlockStrip.tsx`/`TrajTrack.tsx`: `left = startIndex/total * W`, `width = nframe/total * W`。
  ラベル `basename(src)` + 形式バッジ。色は block index で循環（`--mdtraj-block-*` パレット）。
- 空状態/連続バーfallback（Phase A）を本セグメントに置換。

### Phase C — Remove/Reorder（今回は設計記録のみ、着手しない）

- C++: `Trajectory::removeBlock(int)` / `moveBlock(int from,int to)` を新規実装
  （start index 再計算・`m_nTotalFrms` 更新・`m_nCurFrm` クランプ・イベント発火）+ `.qif` method。
- worker: `removeTrajectoryBlock`/`moveTrajectoryBlock`（undo txn）。
- frontend: Remove ボタン有効化 + strip drag 並び替え（`AnimStrip` の drag ライフサイクル流用）。

---

## データモデルと同期

- **scriptable surface（現状）**: `frame`/`dynframe`(rw seek)・`nframe`(ro)・`frame_aver_size`・`append(TrajBlock)`。
  block 列挙は Phase B で追加。削除/並替は Phase C。
- **再生の source of truth**: Trajectory には C++ 再生エンジンが無いため、再生中は **JS タイマーが現在 frame の権威**。
  各 tick で `setTrajectoryFrame` を呼び C++ に書く。停止中は C++ `frame` が真。
- **外部変更の追従**: seek は `Trajectory::update()` → `fireAtomsMoved()` → `OBE_CHANGED`(descr="atomsMoved") を
  target uid で発火。pane はこれを購読し `frame` を read-back（イベントは frame 値を運ばない）。
  `atomsMoved` は trajectory 専用でないため `srcUID === traj.uid` でフィルタ。
- **構造変更の追従**: append/remove(Phase C) は service 成功時に明示 refetch（nframe/blocks 再取得）。
- **注意**: 大規模系では毎 frame の座標書換 + 再描画がコスト。Speed(fps) で間引く。scrub は drag 中プレビュー・
  離して 1 回 commit で書換回数を抑える。

---

## 再利用する既存資産

| 目的 | 再利用先 |
|---|---|
| bottom pane chrome / タブ | `components/panels/BottomPanel.tsx` |
| pane 全体構成の下敷き | `components/panels/AnimationPanel.tsx` |
| transport 行 | `components/panels/anim/AnimTransport.tsx` |
| セグメント strip | `components/panels/anim/AnimStrip.tsx` |
| ruler + scrub ライフサイクル | `components/panels/anim/AnimTimeRuler.tsx` + `AnimationPanel` `handleRulerMouseDown` |
| frame↔px 幾何 | `components/panels/anim/timelineGeometry.ts` |
| playhead 縦バー | `.anim-playhead`（`styles/_animation-panel.css`）+ △ を CSS 追加 |
| target object 選択 | `h3-kit/ObjectSelect.tsx`（`objectFilters.trajectory` 追加） |
| block 追記ロジック | `worker/server/services/loadTrajectory.service.ts`（PR #447） |
| 複数ファイル pick | `DIALOG_PICK_PATH`(`multi:true`)（PR #447 で拡張済み） |
| path 履歴 | `components/dialogs/trajPathHistory.ts` |
| transport/tool button | `h3-kit/form/ButtonRow.tsx`(`ButtonRow`/`FormButton`) + `media.*`/`ui.*` icon |
| Loop / Speed | `h3-kit/form/SwitchField.tsx` / `SelectField` or `SliderField slider={false}` |
| undo txn / event 購読 | `withUndoTxn.ts` / `hooks/useCueMolEventListener` |

---

## 検証

1. **C++ (Phase B/C)**: `cd build_scripts && task run_gtest`。Phase B は `nblock`/`getBlock`/`TrajBlock.nframe`/
   `start_index` の公開値が block 連結（`test_trajio.cpp` の既存 fixture）と一致することを確認。Phase C は
   `removeBlock`/`moveBlock` 後の start index 再計算・nframe・current frame クランプを検証。
2. **worker service (vitest, setter-spy)**: `getTrajectoryState` が nframe/frame（Phase B: blocks[]）を返す、
   `setTrajectoryFrame` が `traj.frame` に clamp 値を書く、`appendTrajectoryBlock` の呼び出し順
   （reader.targTrajUID 設定 → attach/setPath/read/detach → `traj.append`）を pin。
3. **panel (vitest)**: play が JS タイマーを起動し `setTrajectoryFrame` を呼ぶ / stop で止まる、seek が最寄り整数
   frame を commit、target 切替で state 再取得、Phase B の segment 幅が `nframe` 比例、playhead 位置、空状態、
   Add が `appendTrajectoryBlock` を選択ファイル分呼ぶ。fake-timer は tritium/CLAUDE.md の手動 invoke パターン。
4. **型 / build**: `cd tritium/react-gui && npx tsc -p tsconfig.web.json --noEmit`（renderer）と `tsconfig.node.json`
   → `cd build_scripts && task build_tritium`。
5. **E2E 実機**: `task build_libcuemol2`(Phase B は wrapper 生成必須) → `task run_tritium` → File > Open MD
   Trajectory で系をロード → Trajectory タブ → target 選択 → play/stop/seek で frame が進む・renderer が更新、
   frame/nframe 表示、Phase B で block セグメントがファイル境界どおり、Add で block 追記され nframe 増加、を確認。

---

## 成果記録（migration docs ではなく architecture）

本タスクは新規実装（UXP migration ではない）。PR #447 と同じ方針で設計記録は `docs/architecture/` に置く。
- `docs/architecture/md-trajectory-bottom-pane.md` 新規（pane 構成・JS タイマー再生の判断・playhead 意匠・
  `.qif` 拡張(Phase B)・Phase C 設計）+ `docs/architecture/_index.md` に 1 行追加。
- Phase B の `.qif` 追加（`nblock`/`getBlock`/`TrajBlock.nframe`/`start_index`）は architecture doc に明記。

---

## スコープ外（今回は実装しない）

- **Phase C 本体**（block 削除・drag 並び替え + C++ `removeBlock`/`moveBlock`）。設計のみ記録。
- topology の prmtop/psf/netcdf 対応（PR #447 と同様に別タスク）。
- per-block 間引き（`nevery` は block 追記時のみ）、`frame_aver_size`(再生スムージング)の UI 露出。
- movie/画像エクスポート、morph、trajectory セットの MRU 再オープン。
- `dynframe` と `frame` の使い分け最適化（現状 C++ で挙動同一のため `frame` のみ使用）。
