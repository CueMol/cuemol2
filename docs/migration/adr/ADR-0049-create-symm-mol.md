# ADR-0049: Create SYMM mol — 対称像の実体化を navi ctxmenu + 共有 NewRendererDialog で移植

- Status: accepted (host E2E verified)
- Date: 2026-08-21
- Mapping rows: [`toolbar.cuemol2-ribbon`](../mapping/toolbars.md#toolbarcuemol2-ribbon)

## Context

UXP の「Create this SYMM mol ...」(`uxp_gui/cuemol2/base/content/topbar/navi-toolribbon.js:628-694` `createSymmObj`) は、3D ビューで `*symm` レンダラの対称像原子を右クリックし、hittest 結果の `symm_id` に対応する対称操作行列 (`SymmRenderer::getXformMatrix`) で全原子コピーを変換した新規 MolCoord をシーンへ追加する機能。UI は汎用 Setup Renderer ダイアログを `bEditObjName:true` (オブジェクト名編集可) で再利用し、既定名は `mol.name + " " + res.symm_name` (例 `1crn x,1/2-y,-z`)。

tritium では `shared/naviCtxMenu.ts` に `enabled:false` のプレースホルダのみが存在し、mapping で「Create SYMM mol deferred」として残っていた。必要な C++ API (`SymmRenderer.getXformMatrix` / `MolCoord.copyAtoms` / `xformByMat`) と TS wrapper、および Setup Renderer 相当 (`NewRendererDialog`、ADR-0046) は全て揃っており C++ 変更は不要。

## Decision

1. **NewRendererDialog を無変更で再利用**: `RendererOptionsPane` の Object name フィールドは元々編集可で、`NewRendererDialog.handleOk` は `rendOpts.objectName` を返している (既存呼び出し元 — scene panel New Renderer / file-open — は単に無視)。symm フローが初めてこの値を消費することで UXP の `bEditObjName:true` と機能等価になる。ダイアログ側の変更は stale docstring の是正のみ。
2. **worker 側は `createSymmMol.service.ts` の 2 サービス**: `getCreateSymmMolOptions` は named export 化した `getNewRendererOptions` 関数を `sourceNodeType:'object'` で再利用し (renderer type / preset / 既定 rend 名 / objClassName の重複実装を回避)、新オブジェクト名を `uniqName` (makeMolSurf から `helpers/uniqName.ts` へ抽出) で一意化して提案。`createSymmMol` は `createObj('MolCoord')` → name → `copyAtoms(mol, '*')` → `xformByMat(matrix)` → `scene.addObject` → `setupRenderer` を実行。
3. **undo txn は全工程を単一の 'Create symm mol' txn で包む**: UXP は copyAtoms / xformByMat を txn 外で行うが、scene 未登録 (detached) オブジェクトへの変更は scene イベントも undo レコードも生まないため観測上同一。tritium の確立パターン (`makeMolSurf.service`) に合わせ、エラーパスは一貫して rollback + `{ ok:false, error }` → renderer 側 error alert (UXP の alert パリティ)。
4. **レンダラ生成は `setupRenderer` へ委譲**: preset renderer group (ADR-0046)・default style・recenter・selection 適用・`molPostProc` (既定 paint coloring = UXP `createDefPaintColoring` と同一 4 エントリ) が共通経路で付き、UXP の `doSetupRend(scene, result)` に正確に対応する。

## Consequences

- NewRendererDialog / `useSceneContextMenu` / `useSceneCommands` は無改変のため regression リスクなし。メニュー template は共有 (`buildNaviCtxMenuNodes`) なので action 文字列の追加だけで macOS native / Win-Linux React MenuPanel の両 path に反映される。
- 意図的逸脱 2 点:
  - symop 行列は右クリック時でなく **commit 時**に `getXformMatrix(symmId)` で取得する (wrapper オブジェクトを renderer スレッドへ往復できないため)。ダイアログ表示中に `*symm` レンダラの operator 表が再生成されると `symm_id` が別 operator を指す理論上の窓があるが、ダイアログは modal で view 操作を伴わず実害は未観測。
  - Object name フィールドは UXP が `bEditObjName:false` 経路で disabled にするのに対し tritium は常に編集可 (既存挙動のまま。New Renderer フローでは値が無視されるだけで無害)。
- 元 mol の coloring コピーは UXP でも TODO のまま既定 paint coloring を設定しており、同挙動を踏襲 (molPostProc 経由)。

## Notes

- 実装: `worker/server/services/createSymmMol.service.ts` / `hooks/useNaviContextMenu.ts` `case 'createSymmMol'` / `shared/naviCtxMenu.ts` / `shared/types/naviCtxMenu.ts` `NaviCtxAction` / `worker/shared/calls/` ServiceMap 2 行 / `worker/server/services/helpers/uniqName.ts` (makeMolSurf と共用)
- UXP parity: `navi-toolribbon.js` `createSymmObj` (:628-694)、`topbar/cuemol2-ribbon.xul:224` "Create this SYMM mol ..." (`ctxtmenu-symm` 表示制御は tritium 既存の `payload.isSymm` ゲートが相当)
- テスト: `__test__/createSymmMolService.test.ts` (6 — 呼び出し順 / txn ラベル / rollback / 一意名) + `__test__/NaviContextMenu.test.tsx` に wire 4 ケース (prefetch→dialog→create の payload pin / cancel / symm_id 欠落 / error alert)
- 関連: [ADR-0046](ADR-0046-preset-renderer.md) (NewRendererDialog / preset)、[ADR-0013](ADR-0013-toolbar-ribbon-port.md) (toolbar ribbon 全体)
