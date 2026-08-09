# ADR-0045: Renderer group 完全パリティ — visibility カスケード / rename 追従 / ui_collapsed 永続化 / deep Copy&Paste

- Status: accepted (host E2E verified)
- Date: 2026-08-09
- Mapping rows: [`panel.workspace.tree`](../mapping/panels.md#panelworkspacetree), [`panel.workspace.ctxmenu.rendgroup`](../mapping/panels.md#panelworkspacectxmenurendgroup), [`panel.workspace.ctxmenu.multi`](../mapping/panels.md#panelworkspacectxmenumulti)

## Context

C++ の `RendGroup` (qsys) は `Renderer` を継承した「描画しない普通の renderer」(`type_name == "*group"`, `display()` 空実装) で、グループ所属は各 renderer の `group` 文字列プロパティが**グループの name と一致すること**だけで表現される (UID 参照ではない)。C++ 側には次のロジックが**一切ない**:

- グループの `visible` をメンバーへ伝播する処理 (`Scene::display` は各 renderer 自身の `isVisible()` しか見ない)
- グループ改名時にメンバーの `group` 文字列を追従させる処理
- グループを子ごとシリアライズする copy (`toXML` は単体のみ; 配列用に `rendGrpToXML` / `rendArrayFromXML` が別途ある)

これらはすべて GUI 責務で、UXP は `workspace_panel.js` (`toggleVisibleRendGrp` / `onRenameRendGrp` / `onTwistyClick`) と `workspace_panel_copipe.js` (`multiRendCopyImpl` / `onPasteRend` / `pasteRendImpl`) に実装がある。tritium 移植ではツリー表示・DnD・group 作成/削除・group 内 New Renderer までは済んでいたが、上記 4 点が欠けており、(1) group を隠しても 3D ビューにメンバーが残る、(2) group を rename するとメンバーが孤児化してツリーから消える、(3) 開閉状態が qsc に保存されない、(4) group の Copy が空の group しか複製しない、という UXP との乖離があった。

## Decision

4 ギャップを worker service 側で埋める。設計判断は次の 4 点。

- **(a) メンバー列挙は worker 側の名前走査**: 共有ヘルパー `helpers/groupChildren.ts` の `listGroupChildRenderers(scene, grp)` が `grp.getClientObj()` → `obj.rend_uids` → `rend.group === grp.name` でライブな C++ 状態から列挙する (C++ `RendGroup::getCenter` と同型)。renderer 側ツリーから childIds を渡す方式は、30ms デバウンス越しの stale tree に基づくリスクと args 型の波及 (3 箇所) があり不採用。既存 `deleteNode` / `bulkDeleteNode` の childIds 契約は出荷済みのため現状維持。`reorderSceneNode.service` の `enumerateRenderers` は同ヘルパーの `enumerateObjectRenderers` へ移設共用。
- **(b) clipboard は `kind: 'renderer'` を維持し内部判別**: `ClipboardEntry` に `form: 'single' | 'rendArray'` と `sourceGroupName` を追加。公開 `getClipboardKind` は不変なので ctxmenu の Paste 有効判定 (renderer 行/object 行/rendGroup 行) は無変更で、UXP の「`qscrend` でも `qscrendary` でも同じ Paste 項目が有効」と等価になる。
- **(c) `ui_collapsed` は undo txn なし直接代入 + pre-debounce イベントフィルタ**: UXP `onTwistyClick` は txn なしで代入しており (開閉は編集ではない; `Renderer::propChanged` は txn 非アクティブ時 undo 記録しない)、これに合わせる。ただし PROPCHG は常に発火するため、`useCueMolEventListener` に `filter` オプションを追加し `propname === 'ui_collapsed'` を**デバウンススケジューリング前**に捨てる。handler 内でのフィルタは leading-edge デバウンス窓を消費し、直後 30ms 内の正当なイベントを握り潰す refetch 漏れバグになるため不可 (テストで pin)。
- **(d) group 名は scene 全域で uniquify (UXP からの意図的逸脱)**: group 名は所属キーなので衝突すると他 group のメンバーを吸収する。UXP は rename / paste 時に無チェックだが、作成側 (`createRendererGroup.service`) が既に `scene.getRendByName` で一意性を強制しており、rename は同ゲートで reject、object 行への配列 paste での group 自動生成は `_<i>` サフィックスで uniquify する。

## Consequences

- group の Show/Hide (単体・bulk とも) がメンバー renderer の実 `visible` を書き換えるため 3D ビューが追従し、Cmd+Z 1 回で group + メンバーが一括復帰する (単一 txn "Change group visibility")。GUI 側 `effectiveVisible` 計算は従来どおり機能する。
- 目玉アイコンは tristate: 非表示 object 配下の own-ON renderer に加え、**非表示 group のメンバーもカスケードで own-OFF になっているが gray-out (開き目 muted) で表示**する (show カスケードが全員 ON に戻すため「祖先を表示すれば見える」が全メンバーに成立し、object/renderer と同じ読みになる)。gray-out のクリックは no-op (hidden object 下では 3D に無効果、hidden group 下ではカスケードとの desync — C++ の描画ループに group ゲートが無いため ON にすると描画されてしまう — を防ぐ)。UXP はトグル可だったが意図的に逸脱。C++ に object と同型の group 表示ゲートを足して子 flag 非破壊にする案は検討の上で見送り (owner 判断: C++ 側は変更しない)。
- bulk Show/Hide の rendGroup カスケードは UXP 超え (UXP は `onShowHideCmd` の rendGroup 分岐が TODO のまま)。group とメンバーの同時複数選択は同値代入で冪等。
- rename の一意性ゲートにより、inline rename で重複名を入れた場合は黙って元の名前に戻る (UXP は prompt 再入力もさせないためパリティ上の後退はない)。
- deep copy は「コピー時点のメンバー」をシリアライズするスナップショット。空 group のコピーも許容 (UXP 同様)。
- `rendGrpToXML` へは TS wrapper でなく native (`.wrapped`) を渡す必要があり、`rendArrayFromXML` の戻り要素は `ctx.strMgr.createWrapper` (UXP `convPolymObj` 相当) で wrapper 化が必要。どちらも間違えると実行時例外になるためテストで pin。
- 開閉状態は qsc 保存で永続化されるが、React 側 `expandOverrides` が常に優先されるためセッション内の見た目は従来と不変。

## Notes

- 変更 service: `sceneTree.service.ts` (`setNodeVisible` rendGroup 分岐 + 新 `setNodeUiCollapsed`)、`sceneOps.service.ts` (`renameNode` rendGroup 分岐)、`bulkSceneNodeOps.service.ts` (`bulkSetNodeVisible` カスケード)、`sceneClipboard.service.ts` (`copyNode` rendGroup 分岐 / `pasteNode` rendArray フロー / `uniqueGroupName`)、`genericProps.service.ts` (`setGenericProp` の rendGroup name 書き込みを renameNode と同契約 — メンバー `group` 再代入 + scene 全域一意ゲート — にルーティング)、新規 `helpers/groupChildren.ts`
- Inspector: rendGroup は継承 Renderer プロパティ (opacity / material / edge lines) が dead knob のため、`PropertiesTab` が `*group` を専用の最小ページ `RendGroupCommonSection` (Name / Visible / Locked のみ) へルーティングし、"Renderer settings" placeholder も出さない。Generic タブは従来どおり raw 全プロパティを表示 (そちらは意図的に無加工)
- renderer 側配線 (Gap 3): `ScenePane.tsx` `onNodeExpandChange` → `useSceneTreeController.handleNodeExpandChange` (object / rendGroup かつ id>=0 のみ) → `useSceneTreeNodeOps.setNodeUiCollapsed` → `WorkerCalls.ts` `setNodeUiCollapsed` 行。イベント抑止は `useSceneTree.ts` `ignoreUiCollapsedPropChg` + `useCueMolEventListener.ts` `filter`
- UXP 参照: `uxp_gui/cuemol2/base/content/workspace_panel.js:1870-1897` (`toggleVisibleRendGrp`), `:1832-1866` (`onRenameRendGrp`), `:1024-1037` (`onTwistyClick`), `workspace_panel_copipe.js:69-86` (`multiRendCopyImpl`), `:117-205` (`onPasteRend` 配列分岐 + group 自動生成), `:207-232` (`pasteRendImpl`)
- C++ 参照: `src/qsys/RendGroup.cpp:42-63` (名前一致走査), `src/qsys/Object.cpp:429-462` (`getGroupedRendListJSON`), `src/qsys/StreamManager.qif:57,60` (`rendGrpToXML` / `rendArrayFromXML` — 第 2 引数は復元先 scene uid)
- テスト: `sceneTreeService.test.ts` / `sceneOpsService.test.ts` / `bulkSceneNodeOpsService.test.ts` / `sceneClipboardService.test.ts` / `useCueMolEventListener.test.ts` (filter が debounce 窓を消費しないこと) / `useSceneTreeController.test.tsx`
- 関連 ADR: [ADR-0001](ADR-0001-scene-tree-dnd.md) (DnD が確立した「`rend.group` 文字列が所属の唯一の真実」「worker 側 `rend_uids` 走査」原則の拡張)、[ADR-0003](ADR-0003-object-ctxmenu-phases.md) (New Group)、[ADR-0007](ADR-0007-scene-tree-multi-select.md) (bulk dispatch)
- スコープ外 (別タスク): preset renderer (`createPresetRenderer` / `<objtype>-rendpreset` スタイル由来の型リスト項目) は未対応のまま
