# ADR-0047: MolSurfObj "Regenerate surface..." — density-only regeneration from the object context menu

- Status: accepted (host E2E verified)
- Date: 2026-08-09
- Mapping rows: [`panel.workspace.ctxmenu.object`](../mapping/panels.md#panelworkspacectxmenuobject), [`dialog.tool.makesurf`](../mapping/tool_dlgs.md#dialogtoolmakesurf)

## Context

UXP の workspace panel には object 行が `MolSurfObj` のときだけ現れる
"Regenerate surface..." がある (`workspace_panel.xul:108-109`)。分子表面
オブジェクトが保持する生成元情報 (`orig_mol` / `orig_sel` / `orig_den` /
`orig_prad`) を使い、点密度だけを変えて表面をその場で作り直す。
`dialog.tool.makesurf` の移植 (`MakeMolSurfDialog` + `makeMolSurf.service`) では
生成パスのみを対象とし、この再生成モードは明示的に scope 外としていた
(ADR-0003 の Phase 6c として deferred)。本 ADR でその穴を埋める。

UXP 側の実装は 3 つの部品に分かれている:

- 表示ゲート `setupMolSurfCtxtMenu` (`workspace_panel_ctxtmenu.js:66-90`) —
  object 行かつ `getClassName(obj)=="MolSurfObj"` 以外は hidden、
  `orig_mol` が空または `scene.getObjectByName(orig_mol)` が null なら
  「表示するが disabled」、解決できれば enabled、という 3 状態。
- 起動 `onMolSurfRegen` (`workspace_panel_ctxtmenu.js:92-114`) — `makesurf.xul`
  に `window.arguments[1]` (対象 uid) を渡すと dialog が regen モードになる。
- コミット `regenMolSurf` (`tools/makesurf.js:270-310`) — 実質 1 行の
  `tgtsurf.regenerateSES1(nden)` を `"Regenerate mol surface"` undo txn で包むだけ。

regen モードの dialog は分子選択・selection・オブジェクト名・probe radius を
すべて disable し、**編集できるのは point density のみ**。probe radius を扱う
コードは書かれているがコメントアウトされている (`makesurf.js:282-288`)。

## Decision

UXP パリティを優先し、**density のみを編集可能**とする。probe radius / selection /
対象分子は read-only 表示に留め、C++ 側の `orig_*` をそのまま使う。

- 新規 worker service `regenMolSurf.service.ts` に 2 アクション:
  - `getMolSurfRegenInfo` — class 判定 (`getClassName()` メソッド)、`orig_mol` の
    シーン内解決、`orig_den` / `orig_prad` / `orig_sel.toString()` の読み出し。
    メニューゲートと dialog prefill の両方がこれ 1 本を使う。
  - `regenMolSurf` — `tryUndoTxn(scene, 'Regenerate mol surface', ...)` の中で
    `MolSurfObj.regenerateSES1(density)` を呼ぶ。
- コンテキストメニューは `SceneCtxAction` に `{ kind: 'regenSurface' }`、
  payload に `canRegenSurface` (可視) と `regenSurfaceEnabled` (活性) の 2 段ゲート。
  可視は `node.className === 'MolSurfObj'` で同期に決まり、活性のみ
  `buildSceneCtxPayload` の object 行 prefetch で `getMolSurfRegenInfo` を 1 本追加して決める。
- UI は専用の `RegenMolSurfDialog` (+ Provider)。既存の `MakeMolSurfDialog` には
  regen モードを足さない。density 入力の preset とドラフト管理は
  `components/dialogs/molSurfDensity.ts` (`useMolSurfDensity`) に切り出して両者で共有。

### density のみに絞った根拠

`.qif` (`src/modules/surface/MolSurfObj.qif`) が公開するのは
`void regenerateSES1(real density) => regenerateSES;` で、C++ の
`regenerateSES(density, probe_r=-1.0, pSel=SelectionPtr())` のうち第 1 引数だけ。
生成 wrapper (`MolSurfObj_wrap.cpp`) も `checkArgSize(1)` で固定されている。

probe radius / selection は `orig_prad` / `orig_sel` が scriptable な r/w
プロパティなので、`regenerateSES1` を呼ぶ前にセットすれば実質的に変更できる
(`rad2 = probe_r<0 ? m_dProbeRad : probe_r` の分岐に乗る)。技術的には可能だが、
UXP がその機能をコメントアウトしたまま出荷しているため、パリティ移植の段階では
採らない。将来必要になったら read-only 表示を編集可能に変えるだけで済む
(service 側の args に 1 フィールド足し、`orig_prad` を設定してから
`regenerateSES1` を呼ぶ)。

## Consequences

- `panel.workspace.ctxmenu.object` の残タスクが Properties (Phase 5 の
  read-only stub) のみになる。行の status は `wip` のまま。
- `MolSurfObj` の undo は C++ 側 (`MolSurfEditInfo`) が頂点/面のスナップショットを
  積むので、worker 側は undo ラベルを供給するだけでよい。txn を張らないと
  スナップショットが宙に浮くため `tryUndoTxn` は必須。
- 「表示するが disabled」を選んだため、object 行の prefetch が MolSurfObj のときだけ
  1 回増える。prefetch 失敗時は disabled に縮退する (このファイルの既存方針)。
- `regenerateSES1` は `clean()` + `createSESFromMol()` を行うため、既存の
  `molsurf` renderer は付け替えずそのまま再利用される (UXP と同じ)。

## Notes

- 実装:
  - `tritium/react-gui/src/renderer/worker/server/services/regenMolSurf.service.ts`
  - `tritium/react-gui/src/renderer/components/dialogs/RegenMolSurfDialog.tsx` (+ Provider)
  - `tritium/react-gui/src/renderer/components/dialogs/molSurfDensity.ts`
  - `shared/ipcTypes.ts` (`regenSurface` action / `canRegenSurface` / `regenSurfaceEnabled`)
  - `shared/sceneCtxMenu/sceneCtxItems.ts` (`regenSurfaceItem`) / `sceneCtxTemplates.ts` (object 分岐)
  - `hooks/sceneContextMenu/buildSceneCtxPayload.ts` / `dispatchSceneCtxAction.ts` /
    `hooks/useSceneContextMenu.ts`
- UXP 参照: `uxp_gui/cuemol2/base/content/workspace_panel_ctxtmenu.js:66-114`,
  `uxp_gui/cuemol2/base/content/tools/makesurf.js:79-104,270-310`
- C++ 参照: `src/modules/surface/MolSurfObj.qif`,
  `src/modules/surface/MolSurfBuilder.cpp:180-231` (`regenerateSES`),
  `src/modules/surface/MolSurfEditInfo.hpp`
- 移植時に扱った UXP 側の既知バグ:
  - `onMolSurfRegen` の二重起動ガードが windowtype `"CueMol2:MsmsMakeSurfDlg"` を
    見ているが `makesurf.xul` の宣言は `"CueMol2:MakeSurfDlg"` なので一致せず、
    分岐は `dd("ERROR!!")` を出すだけ。tritium は dialog provider が単一インスタンスを
    持つため、この問題自体が発生しない。
  - regen モードの `if (orig_sel!="")` は `MolSelection` wrapper と文字列の比較なので
    常に true。さらに selection 表示に使う分子を `mObjBox.getSelectedObj()` (disable された
    dropdown の現在値) から取るため、表示される対象分子が実際の `orig_mol` と食い違いうる。
    tritium 側は `orig_mol` / `orig_sel.toString()` を直接読んで表示する。
  - `if (nden==NaN || nden<1)` は `NaN==NaN` が false のため密度欄が空のとき `NaN` が
    C++ に渡る。`regenMolSurf.service.ts` の `coerceDensity` は `Number.isFinite` で
    塞ぎ、整数 >= 1 に矯正する。
- 関連 ADR: [ADR-0003](ADR-0003-object-ctxmenu-phases.md) (object ctxmenu の phase 分割),
  [ADR-0004](ADR-0004-renderer-ctxmenu.md) (renderer 行の "Generate surface obj")
