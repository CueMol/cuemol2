# MD Trajectory Bottom Pane — Undo/Redo 実装プラン (Phase D)

作成日: 2026-07-19（undo/redo プランで上書き）

## 背景（実装済み部分）

Bottom pane 本体（Phase A: 再生/シーク/target 選択/frame readout、Phase B: block getter による
セグメント表示、Add block）は実装・検証済みで **PR #448**（`feature/md-trajectory-bottom-pane`、
develop=#446 まで同期済み）。設計は `docs/architecture/md-trajectory-bottom-pane.md`。

本プランは、この PR にさらに **undo/redo 対応**を加えるためのもの。ユーザー要望「このPRで undo/redo
まで実装したい」に対応する。

## 現状の undo/redo（確定分析）

| 操作 | 現状 | 判定 |
|---|---|---|
| seek / 再生（`setTrajectoryFrame`） | txn で包まない | **正しい**（`frame` は `nopersist`、Animation transport と同じ transient。変更しない） |
| block 追加（`appendTrajectoryBlock`） | `withUndoTxn` で包むが実質 undo 不可 | **本プランで対応** |

**なぜ Add が undo できないか**（コード確認済み）:
- undo 機構は `EditInfo`（`undo()`/`redo()`/`isUndoable()`/`isRedoable()`、`src/qsys/EditInfo.hpp`）を
  `UndoManager::addEditInfo()` で txn 中に積む方式。記録は `scene.startUndoTxn`〜`commitUndoTxn` の間だけ
  （ガード `pUM->isOK()` = `isInTxn() && !isDisabled()`）。空 txn は `commitTxn` 時に破棄
  （`UndoManager.cpp:243`）。
- **`src/modules/mdtools/` に EditInfo 生成コードが皆無**。`Trajectory::append` は deque へ push するだけ。
  block（`TrajBlock`）は scene object として追加していないので `ObjLoadEditInfo` も作られない。
- 結果、`appendTrajectoryBlock` の txn は空 → 破棄 → **undo 不可**。しかも Add 直後の Cmd+Z は前の
  undo 可能操作を取り消す落とし穴になる。

記録の定番パターン（`src/qsys/Object.cpp:240-247`, `Scene.cpp:358-366`）:
```cpp
UndoManager *pUM = pScene->getUndoMgr();   // Object からは getScene()->getUndoMgr()
if (pUM->isOK()) {
    XxxEditInfo *pEI = MB_NEW XxxEditInfo;
    pEI->setupXxx(...);
    pUM->addEditInfo(pEI);
}
```

## 設計

### C++（`src/modules/mdtools/`）

**D-1. `Trajectory::removeBlock(int index)`（新規）** — undo に必須。
- 範囲チェック → `m_blocks` から erase。
- 後続 block の `start_index` を再計算（末尾除去なら不要だが一般化して実装）。
- `m_nTotalFrms` を減算、`m_nCurFrm` をクランプ、必要なら `update()` で現在 frame を再ロード。
- 構造変更を通知（下記「pane 同期」参照。`fireAtomsMoved` は frame 変化用なので、nframe/nblock 変化を
  pane が拾えるよう `SEM_OBJECT` 系のイベント発火を検討）。
- append-undo は必ず**末尾除去**なので、内部に軽量な末尾 pop 経路を持たせてよい。

**D-2. `TrajBlockEditInfo : qsys::EditInfo`（新規）**
- モード: `APPEND`（Add の undo）／将来 `REMOVE`（Phase C 削除の undo）。
- 保持: trajectory の `uid`、`TrajBlockPtr`（block を retain して redo で復元）、`index`。
- `undo()`: APPEND → 対象 trajectory を uid で解決し `removeBlock(index)`。REMOVE → `append`/insert で復元。
- `redo()`: 反対の操作。
- `isUndoable()/isRedoable()`: 対象 trajectory が生存していれば true（解決失敗時 false）。
- trajectory 解決は uid 経由（`ObjectManager`/scene から）。`ObjLoadEditInfo` の uid 解決を範にする。

**D-3. `Trajectory::append` に記録コードを追加**
```cpp
// push 後、m_nTotalFrms 更新後
UndoManager *pUM = getScene()->getUndoMgr();
if (pUM && pUM->isOK()) {
    TrajBlockEditInfo *pEI = MB_NEW TrajBlockEditInfo;
    pEI->setupAppend(getUID(), pBlk, /*index=*/getBlockCount()-1);
    pUM->addEditInfo(pEI);
}
```
（将来 `removeBlock` にも対称に REMOVE 記録を追加。）

**D-4. `.qif` ＋ wrapper 再生成**
- `Trajectory.qif` に `void removeBlock(integer index);` を追加（UI の Phase C からも使う）。
- `task build_libcuemol2` → `cd tritium/core && npm run install`。

### worker
- `appendTrajectoryBlock` は既に `withUndoTxn('Add trajectory block')` で包んでいるので、**C++ が EditInfo を
  積めば自動で undo 対象**になる。配線変更ほぼ不要（`trajectory.service.ts` は無改変の見込み）。
- Phase C 用に `removeTrajectoryBlock`/`moveTrajectoryBlock` service を足すのは別タスク。

### frontend
- Cmd+Z / Cmd+Shift+Z は既存経路（`MENU_UNDO`/`MENU_REDO` → `CmdId.Undo`/`Redo`）。追加配線不要。
- **pane 同期（確定）**: `Trajectory::append` / `removeBlock` の末尾で **`fireTopologyChanged()`** を呼ぶ
  （既存 `MolCoord::fireTopologyChanged()` = `OBE_CHANGED` / descr=`"topologyChanged"` = SEM_OBJECT/SEM_CHANGED。
  Trajectory は MolCoord 派生なので直接呼べる。座標変化用の `fireAtomsMoved`(descr=`"atomsMoved"`) とは descr で区別）。
- `useTrajectory` の event handler を修正: 現状は **全 `SEM_CHANGED` を無視**（per-frame atomsMoved storm 回避）
  しているため、このままだと `topologyChanged` も無視して refetch されない。**descr で分岐**し、
  `descr==="topologyChanged"` は refetch、`"atomsMoved"` は無視、に変更する（payload は `args.obj.descr`）。

## 検証
1. **gtest（`test_trajio.cpp` に追加）**: `append → scene.undo → redo` で `nframe`/`nblock`/`frame` が復元。
   特に **最初の block を undo** したケース、複数 block の LIFO undo。
2. **worker/結合（vitest）**: `appendTrajectoryBlock` 後に undo service を呼ぶと block が減る契約
   （setter-spy では表現しづらいので、呼び出し順序 or 軽い結合テスト）。
3. **実機**: Add → Cmd+Z で block と nframe が戻る／Cmd+Shift+Z で復活。seek は undo 対象外のまま。
   pane（セグメント・frame 表示）が undo/redo に追従。

## 段階
- **Phase D-1（本 PR）**: Add の undo/redo（`append` の EditInfo ＋ `removeBlock`）。
- **Phase C（別 PR）**: UI からの block 削除・drag 並び替え。D-1 の `removeBlock`/`TrajBlockEditInfo` が下地。

## 決定事項（ユーザー確認済み）
- **empty trajectory**: `removeBlock`/`TrajBlockEditInfo` は **block 0 個まで許容**して実装する
  （EditInfo レベルで empty を許す）。undo/redo は実際の操作単位に結び付くだけで、`Trajectory` の
  「非 empty」不変条件とは独立に実装する（今回の undo/redo で全体 txn が empty になる瞬間は基本発生しない）。
  → removeBlock に「最低 1 個残す」等のガードは入れない。
- **構造変更イベント**: `append`/`removeBlock` で `fireTopologyChanged()` を発火（上記 frontend 参照）。
  atom append/remove 相当の object 変更として、既存 `MolCoord` の `topologyChanged` パターンに揃える。

## 残る留意点
- **`removeBlock` の再 update コスト**: 現在 frame が除去 block 内にある場合の再ロード（大系で重い可能性）。
  末尾除去（append-undo）では現在 frame が末尾 block 内にあるときのみ再 update。
