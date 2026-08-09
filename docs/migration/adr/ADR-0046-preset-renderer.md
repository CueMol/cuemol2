# ADR-0046: Preset renderer — style 定義の predefined renderer group を一括生成

- Status: accepted (host E2E verified)
- Date: 2026-08-09
- Mapping rows: [`dialog.setup-renderer`](../mapping/other_dlgs.md), [`overlay.fopen-renderopt`](../mapping/overlay.md), [`panel.workspace.ctxmenu.object`](../mapping/panels.md#panelworkspacectxmenuobject)

## Context

UXP の Setup Renderer ダイアログには、style に定義された preset (`<objtype>-rendpreset` 型、例 `data/default_style.xml` の `Default1RendPreset`) を選ぶと `Object::createPresetRenderer(preset_name, grp_name, name_prefix)` で renderer group + 子 renderer 群 (type / sel / style は style XML の `<renderer>` 属性由来) を一括生成する機能がある。UXP は New Renderer / file-open / Get PDB の全経路で preset をドロップダウン先頭に出し、既定選択も preset だった。C++ 側は wrapper 生成済みで変更不要。C++ は undo txn を張らず (子 N + group 1 の undo レコードは呼び出し側 txn 必須)、objtype 適合の検証もしない (GUI 責務)。tritium は ADR-0045 でスコープ外とした未対応部分だった。

## Decision

`RendererOptions` に optional `presetName?: string` を追加し (非空 = preset 作成、`rendererType` は無視)、worker の `setupRenderer` 冒頭に preset 分岐を置く。これにより `loadObject` / `streamLoadFromUrl` (file-open / Get PDB の実行経路) は**コード変更ゼロ**で preset を処理する。preset 一覧は `getNewRendererOptions` の `presetTypes` (New Renderer 経路) と新 service `getRendPresetTypes` (file-open 経路、`ensureActiveScene()` の後に prefetch して dialog args で同期供給) が `helpers/styleEntries.fetchStyleEntries(0) + (sceneId)` から `type === objClassName+'-rendpreset'` で抽出する。UI は `RendererOptionsPane` の HTMLSelect に `<optgroup label="Presets">` (label = `desc || name`、value = style 名) を先頭追加し、`presetName` の書き込みは同 Pane の select ハンドラ 1 箇所に閉じる。

### UXP からの意図的逸脱

1. **判定は `/RendPreset$/` 正規表現でなく明示フィールド** — `presetName` の有無。二重規約 (JS 側は名前 suffix、C++ 側は type 属性) の JS 側を廃す。
2. **既定名は短縮形** — `presetNamePrefix('Default1RendPreset') = 'default1_'` + `proposeUniqName` → `default1_1` (子は C++ が `name_prefix + type` で `default1_1ribbon` 等)。UXP の `Default1RendPreset1` は冗長なため。
3. **既定選択は preset にしない** — preset は先頭 optgroup に表示するが、初期選択は従来どおり履歴 or 通常タイプ先頭 (UXP は `selectedIndex=0` で preset 既定)。履歴に preset 名が入った場合は membership 判定つきで復元し、無効なら通常タイプ先頭へフォールバック。
4. **group 内の New Renderer では preset 非表示** — preset は自分の group を作るためネスト不可。`getNewRendererOptions` が `groupName` 非空で `presetTypes: []` を返し、`createRendererOnObject` も preset + groupName の `rend.group` 代入を拒否 (二重防御)。UXP は無ガードで group 内 preset が作れてしまっていた。
5. **preset 分岐では applyStyles / sel / name 再設定を skip** — UXP は共通処理を通すが、`setDefaultStyles` は `*group` に実質 no-op、sel は RendGroup に存在せず無視、name は C++ の `setName(grp_name)` 済み。挙動は同一のまま無駄を省く。
6. **preset 選択中は Selection UI を disable** — UXP は有効のまま黙って無視していた。centerView は `RendGroup::getCenter` (メンバー重心) が機能するため有効のまま。

### file-open 経路の供給設計

file-open は「開けないファイルで空タブを作らない」ため `getCompatibleRendererNames` が `ensureActiveScene()` より**前**に走る (useSceneCommands.ts の意図的順序)。preset 抽出には sceneId (scene-local style) が要るため、既存 service への追加は成立せず、`fetchPresetTypes(cm, sceneId, objType)` を `ensureActiveScene()` の後に呼んで `FileOpenOptionDialogArgs.presetTypes` で渡す。失敗・undefined 解決 (テスト mock 含む) は `[]` に degrade。Get PDB (coord) も同じヘルパーを使用。Trajectory ダイアログ / changeRendererType は対象外。非 mol オブジェクトは該当 style が存在せず自動的に空。

## Consequences

- preset 作成は呼び出し側の既存 txn ('Create preset renderer <名>' / 'Open file' / 'Get PDB') に包まれ、**undo 1 回で group + 子が全消滅** (file-open では object ごと)。
- 子の `SCE_REND_ADDED` が group 登録より先に発火するが、シーンツリーの 30ms デバウンス refetch が最終状態へ収束する (中間状態で孤児が一瞬見える可能性は許容)。
- 履歴 (`rendTypeHistory`) は preset 名も単一 string として保存する。style が消えた場合は次回 open 時の membership 判定で外れる。
- C++ が objtype 適合を検証しないリスクは、GUI 側フィルタ (`objClassName-rendpreset` 完全一致) で遮断される。
- `createPresetRenderer` の C++ throw (style 不在等) は worker で catch して null → `ok:false`。

## Notes

- 変更ファイル: `components/fopen-opt-dlgs/types.ts` (`presetName` / `PresetTypeEntry`)、`presetUtils.ts` (新規)、`useRendererOptions.ts` (初期選択 membership / prefix 分岐 / 履歴)、`panes/RendererOptionsPane.tsx` (optgroup / Selection disable / onTypeChange)、`NewRendererDialog(.Provider).tsx`、`FileOpenOptionDialog(.Provider).tsx`、`hooks/useSceneContextMenu.ts`、`commands/useSceneCommands.ts` (`fetchPresetTypes`)、worker: `setupRenderer.service.ts` / `createRendererOnObject.service.ts` / `getNewRendererOptions.service.ts` (+`getRendPresetTypes`)、`WorkerCalls.ts`
- UXP 参照: `uxp_gui/cuemol2/base/content/renderer.js:98-152` (`getCompatibleRendPresetNames` / `doSetupRend`)、`fopen-renderopt-page.js:185-259` (`setupRendTypeBox`)、`fileopen.js:155-157`
- C++ 参照: `src/qsys/Object.cpp:493-549` (`createPresetRenderer`)、`data/default_style.xml:286-303` (preset 定義 3 件)、`src/qsys/style/StyleMgr.cpp:205-227` (`getStyleNamesJSON` — global へのフォールバック無しのため 0 + sceneId の両方を concat)
- テスト: `presetUtils.test.ts` / `setupRendererService.test.ts` / `createRendererOnObjectService.test.ts` / `getNewRendererOptionsService.test.ts` / `newRendererDialog.test.tsx` / `fileOpenOptionDialog.test.tsx` / `sceneCommandsAutoScene.test.tsx`
- 関連 ADR: [ADR-0045](ADR-0045-rend-group-parity.md) (renderer group パリティ — 本 ADR がそのスコープ外項目を解消)
