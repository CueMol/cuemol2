# ADR-0050: Mol morphing animation tool — 対象選択と MorphMol 変換をダイアログ内に統合

- Status: accepted (host E2E verified)
- Date: 2026-08-21
- Mapping rows: [`dialog.tool.morphanim-tool`](../mapping/tool_dlgs.md#dialogtoolmorphanim-tool), [`menu.cuemol2.tools`](../mapping/menus.md#menucuemol2tools)

## Context

UXP の Tools >「Mol morphing animation ...」(`uxp_gui/cuemol2/base/content/tools/morphanim-tool.js`) は 2 段構成: (1) メニュー直後に `doSelectObjPrompt` で MolCoord / MorphMol を選ばせ、MolCoord なら `convToMorphMol` が**確認なしで**元オブジェクトを MorphMol に置換する (`StreamManager.toXML2(mol,"MorphMol")` → `fromXML` で renderer ごと引き継ぎ、`appendThisFrame()` で現座標を frame 0 に登録、undo txn "Conv Mol to MorphMol")。(2) その後モーダルダイアログでフレームリスト (Name / Source、`<this>` 行は "(this)") を Add PDB file... / Add MolCoord... / Delete で編集する。編集は即時 commit (apply-immediately) で、OK ボタンは閉じるだけ。

tritium では `menu:morph-anim` が `MENU_DISPATCH_UNIMPLEMENTED` の stub で、mapping `dialog.tool.morphanim-tool` は tool_dlgs 内で唯一の todo だった。「既存 MorphMol を MolAnim にバインドして再生する」側 (AnimationPanel / AnimElementInspector の Target MorphMol) は実装済みで、生成・フレーム編集の導線だけが欠けていた。

## Decision

1. **対象選択と変換をダイアログ内に統合**: UXP の「事前プロンプト → 暗黙変換」は採らず、`MorphAnimDialog` 上部の Target セレクタ (`ObjectSelect`、molCoord filter = MolCoord/MorphMol 両方ヒット) で対象を選び、未変換の MolCoord には明示の **Convert to MorphMol** ボタンを出す (`getMorphFrames` の `isMorphMol` フラグで分岐)。破壊的置換 (元オブジェクトの destroy + 差し替え) を暗黙に実行しないための意図的変更で、undo は UXP 同様可能。
2. **worker `morphMol.service.ts` の 5 サービス**: `convertToMorphMol` (toXML2/fromXML/appendThisFrame/destroyObject/addObject を単一 txn "Conv Mol to MorphMol") / `getMorphFrames` (getFrameInfoJSON パース) / `addMorphFrameFromFile` (pdb reader、.gz は compress='gzip'、txn "Add PDB to MorphMol") / `addMorphFrameFromMol` (toXML/fromXML deep copy、txn "Add mol to MorphMol") / `removeMorphFrame` (txn "Delete MorphMol item")。フレーム用 MolCoord は scene に addObject しない (MorphMol が `<frames>` ノードで保持、UXP parity)。
3. **apply-immediately を維持**: 各編集が独立した undo txn で即時 commit され、フッターは Close のみ。UXP の編集モデルをそのまま踏襲 (フレーム追加は PDB 読み込みを伴い「まとめて commit」に自然な単位がないため)。
4. **C++ 変更なし** (ユーザー確認済み): MorphMol は `MolCoord` 直接派生のままで、Trajectory の realtime 高速パス (AnimMol の CrdArray / 座標テクスチャ直接更新) には未対応。再生は UXP と同一の AnimMgr → MolAnim → `frame` プロパティ → `MorphMol::update()` (setPos + fireAtomsMoved) 経路。AnimMol 再親子化は phase2 plan (`docs/plans/260718-md-trajectory-phase2-plan.md` Step 2b) の保留項目で、qif API を変えないため将来別 PR で実施しても本 GUI は無改修で恩恵を受ける。

## Consequences

- UXP からの意図的逸脱: (a) 変換が明示ボタン (上記 1)。(b) Add PDB file は複数選択対応 (UXP は単一; OpenMdTrajDialog の Add と同じ改善)。(c) `addMorphFrameFromMol` の txn ラベルを "Add mol to MorphMol" に是正 (UXP は addPDBFile のコピペで "Add PDB to MorphMol" のまま)。(d) `<this>` フレームの Delete はボタン disable + service 側 guard で明示拒否 (C++ `removeFrame` は黙って no-op するため、無変更 txn の commit を防ぐ)。
- UXP の既知バグ 3 件は移植しない: windowtype 不一致で二重起動ガードが Interaction ツールを見る / 対象プロンプト cancel で null 参照 / tree 行クリックの未定義ハンドラ TypeError。
- フレームの並べ替え UI は UXP 同様なし (XUL でもコメントアウト済み)。C++ 側にフレームの MolCoord を取り出す API がなく remove+insert での並べ替えも組めないため、必要になれば C++ API 追加が前提。
- reader は UXP 同様 "pdb" 固定 (mmCIF 等をフレームに使いたければ Add mol... でシーン経由)。

## Notes

- 実装: `worker/server/services/morphMol.service.ts` / `components/dialogs/MorphAnimDialog.tsx` + Provider / `commands/useToolCommands.ts` `UiMorphAnimDialog` / `shared/menuActionMap.ts` (`menu:morph-anim` stub → `ui.morphAnimDialog`) / `WorkerCalls.ts` ServiceMap 5 行
- UXP parity: `tools/morphanim-tool.js` (`onMorphAnimSetup` :5-32, `convToMorphMol` :34-63, `addPDBFile` :181-234, `addMolCoord` :236-271, `onDelete` :134-159)、`tools/morphanim-tool-dlg.xul`、メニューは `cuemol2-menus.xul:394`
- C++ 側の要点: `appendThisFrame()` 必須 (`m_nAtoms<0` だと `update()` が no-op、`MorphMol.cpp:479`)、`insertBefore(mol,-1)` = 末尾 append、`insertBefore`/`removeFrame` は txn 内必須 (`qsys::UndoUtil`)
- テスト: `__test__/morphMolService.test.ts` (12) + `menuDispatch.test.tsx` に channel→CmdId 行 + `menuPipelineExhaustiveness.test.ts` の UNIMPLEMENTED_ALLOWLIST 3→2
- 関連: [ADR-0029](ADR-0029-anim-timeline-strip-model.md) (Animation panel / MolAnim バインド側)
