# tritium: Camera pane の独立化と View activity view の新設 — 実装プラン

> **状態: 実装済み (2026-09-17)**。実装後の仕様は
> [`../architecture/camera-pane.md`](../architecture/camera-pane.md) にある。
> 本書は着手前の計画として履歴のために残す。実装との差分:
> `CmdId.CameraReorder` は「作らない」と書いたが、pane を一貫して command 駆動に
> するため実際には追加した。

## Context (なぜやるか)

tritium の名前付きカメラは現在、Explorer > Scene の scene tree に合成ノード (`cameraRoot` 配下の
`camera` 行) として表示され、操作はほぼ右クリックメニュー (`buildCameraNodeMenu`) に依存している。
ユーザーからの要望:

1. **Camera を独立した pane にする** (追記: 既存の View pane と合わせて **View activity view** を新設)
2. **New Camera で既存名を入力したら上書き** (UXP parity)。tritium の `createCamera` は現在 `hasCamera` で拒否する
3. **エントリの並べ替え** ができ、順番が **qsc に保存** される (tritium だけが順番を尊重すればよい)
4. **Save from view / Apply to view を context menu なしに tool button で**、**with show/hide 版も簡単に**

調査で判明した前提:

- C++ の camera 格納は `std::map<LString, CameraPtr>` (Scene.hpp:82) で名前順。`getCameraInfoJSON()` も
  `camerasWriteTo` も map 順で、qsc 読込は `cameraReadFrom` → `setCamera` 経由なのでファイル内の順番は捨てられる。
  Camera に order 系の property は無い。
- object / renderer の並び順は `ui_order` property (`(nopersist)`, Object.qif:42 / Renderer.qif:60) で持ち、
  qsc には**属性として書かず要素の並び順で保存**する: `Scene::writeTo2` が `ui_order` ソートで書き、ロード時は
  ctor が `m_nUIOrder = m_uid` (ロード順に単調増加) で埋める。camera も同じ仕組みに乗せる (ユーザー決定)。
- UXP の挙動 (workspace_panel.js): "Save from view" は選択中カメラを名前キーで上書き (プロンプト無し)、
  "New Camera..." は `camera_N` 既定名でプロンプトし、既存名なら `saveViewToCam` の upsert で黙って上書き。
  ダブルクリック = Apply with vis flags。
- 既存 tritium: CmdId.Camera* (New / LoadFromFile / Reload / Save / SaveAs / SaveFromView{name,withVisFlags} /
  ApplyToView{name,withVisFlags} / EditVisFlags / ClearVisFlags)、worker `services/camera/*`
  (name-keyed, ADR-0005)、`EditCameraVisFlagsDialog` (ADR-0026)、ViewPane (ADR-0025, Explorer 3 番目)。

## ユーザーと確定した決定

| 論点 | 決定 |
|---|---|
| 配置 | activity bar に **View** view を新設。pane は上 = **Camera pane** (新規)、下 = 既存 **View pane** (Explorer から移動)。Explorer は Scene / Color |
| scene tree の Camera 枝 | **撤去**。camera の表示・操作は Camera pane に一本化 |
| New Camera の既存名 | **確認なしで上書き** (UXP parity、undo 可。vis flags が消えるのも UXP と同じ) |
| with show/hide の出し方 | ツールバーに **4 ボタン** (Save / Save with show/hide / Apply / Apply with show/hide) を並べる (トグルなし) |
| 並べ替えの永続化 | **Camera に `ui_order` property (nopersist) を新設** (object/renderer と同型)。qsc には要素の並び順として保存。appdata 案は不採用 |
| 並べ替え操作 | scene tree と同じ HTML5 drag & drop (flat list、before/after のみ) |
| `__current` | ~~Camera pane では非表示~~ → **一覧の先頭に固定して出す** (並べ替え対象外)。実装時にユーザー指示で変更。UXP は tree に出していた |
| ダブルクリック | Apply to view **with** show/hide (現状・UXP parity)。単クリックは選択のみ、rename は F2 / ctx menu |

---

## Part A: C++ — Camera `ui_order` (`src/qsys/Camera.{hpp,cpp,qif}`, `Scene.cpp`)

### A-1. Camera に `ui_order` を追加

- `Camera.hpp`: private `int m_nUIOrder;` + public `int getUIOrder() const` / `void setUIOrder(int)` (Renderer.hpp:186-187 と同じ)。
  既定は **-1 = 未採番** (object/renderer は uid を種にするが Camera は uid を持たないので Scene 側で採番する)
- `Camera.cpp`: default ctor で `m_nUIOrder = -1`。`copyFrom()` に `m_nUIOrder = r.m_nUIOrder;` を追加
  (`Scene::getCamera` のコピー、`CameraPropEditInfo` の old/new 値、View の `m_curcam` が全てここを通る)。
  **`equals()` には含めない** (唯一の利用は View.cpp:969 の anim 判定で、順序は view 状態と無関係)
- `Camera.qif`: `property integer ui_order => redirect(getUIOrder, setUIOrder) (nopersist);`
  (Object.qif:42 と同じ書式。nopersist なので `<camera>` 属性にも `.cam` ファイルにも出ない)

### A-2. `Scene::setCamera` に採番ルールを 1 つ追加 (Scene.cpp:1260-1299)

`UndoUtil` ブロックの**前**に (undo の `m_newvalue` が正しい order を持つように):

```cpp
if (pCam->getUIOrder() < 0) {
  if (!bCreate) pCam->setUIOrder(getCameraRef(name)->getUIOrder());  // overwrite: inherit the slot
  else          pCam->setUIOrder(nextCameraUIOrder());               // create: max(ui_order)+1 (0 when empty)
}
```
`nextCameraUIOrder()` は private helper (m_camtab を走査して max+1)。これ 1 箇所で次が全部正しくなる:
qsc ロード (`cameraReadFrom` → `setCamera` がファイル順に採番)、paste / `.cam` load (`fromXML` / `loadCamera` は
nopersist なので -1 → 末尾に採番)、`reloadCameraFromSrc` (-1 → 旧 slot 継承)、rename (destroy + 同一オブジェクトを
`setCamera`: order ≥ 0 なので保持)、undo/redo replay (コピーが order を持つ)。
旧 UXP が書いた qsc (アルファベット順) はロードでアルファベット順に採番される = 今と同じ表示。

### A-3. `Scene::saveViewToCam` (Scene.cpp:1411-1433)

`View::getCamera()` のコピーは、直前に apply した camera の `ui_order` を `View::setCameraAnim` の `copyFrom` で
持ち越している。`srcpath` を戻すのと同じ場所で **`pCam->setUIOrder(-1);`** を入れ、A-2 のルールで
「上書きなら旧 slot 継承 / 新規なら末尾」にする。

### A-4. 並び順で出力する 2 箇所

- `Scene::camerasWriteTo` (Scene.cpp:1654): map 走査を「`ui_order` 昇順 (同値は名前順) に `std::stable_sort` した vector」走査に変更
  → qsc の `<camera>` 要素順 = 表示順。読込 (A-2) でその順に採番されるので**往復で順序が保存される**
- `Scene::getCameraInfoJSON` (Scene.cpp:1467): 同じソート済み走査にし、各要素に `"ui_order": N` を追加
  (`{"name","vis_size","src","ui_order"}`)。tree / anim select / Python まで全消費者が同じ順を見る。
  ソート helper (`sortedCameras()` のような private const 関数) を 2 箇所で共用する
- 他の map 走査 (`forceEmbed`, `beginCamera/endCamera`) は順序非依存なので変更なし。`Scene.qif` の変更は不要

### A-5. gtest (最小: 2 件) — 新規 `src/tests/qsys/test_camera_order.cpp` (`src/tests/CMakeLists.txt` の test_qsys 一覧に追加)

fixture は `test_scene.cpp:31-49` と同じ (`SceneManager::createScene` / `destroyScene`)。`test_main.cpp` が
`SceneXMLReader/Writer` を登録済み。
1. `SetCameraAssignsAndInheritsUIOrder`: 3 つ `setCamera` → `ui_order` が 0,1,2; 2 番目を `-1` のコピーで上書き → 1 を継承;
   `getCameraInfoJSON()` の name 順が `ui_order` 順 (名前は逆アルファベットにして map 順と区別する)
2. `QscRoundTripKeepsCameraOrder`: `ui_order` を 2,0,1 に並べ替えて `SceneXMLWriter` で temp qsc に保存
   (`test_render_settings.cpp:114-131` の `tmpQsc` / `saveToFile` を写す) → 別 scene に `SceneXMLReader` で読込 →
   `getCameraInfoJSON()` の順序が保存前と一致、`<camera` 要素に `ui_order=` 属性が**無い**こと

---

## Part B: worker services (`tritium/react-gui/src/renderer/worker/`)

### B-1. 共有 DTO: 新規 `worker/shared/cameraTypes.ts`

```ts
export const INTERNAL_CAMERA_NAME = '__current'
/** One row of the Camera pane, mirroring `Scene::getCameraInfoJSON` (already in display order). */
export interface CameraEntry { name: string; src: string; visSize: number; uiOrder: number }
```
renderer は `worker/server` から値 import できない (ESLint) ので DTO は `worker/shared/` に置く。
`sceneTreeTypes.ts` の `CameraRootEntry` は撤去対象なので再利用しない。

### B-2. 新規 `services/camera/cameraOrder.ts`

- `parseCameraInfo(scene): CameraEntry[]`: `scene.getCameraInfoJSON()` の parse (`sceneTree.ts:65-84 getCameraEntries` の移植
  + `ui_order` 読み取り)。C++ が既にソート済みなので **TS 側でソートしない**
- `visibleCameraEntries(scene)`: 上記から `__current` / 空名を除外
- service `listCameras({ sceneId })` → `Result<{ cameras: CameraEntry[] }>`
- service `reorderCameras({ sceneId, names })` → `Result<{ names: string[]; changed: boolean }>`:
  renderer は **drop 後の完全な表示順**を送る。worker は現存する可視 camera 名だけに絞り重複除去、送られなかった
  camera は末尾に補完。現在の表示順と同じなら **txn を張らず** `changed: false` (空 commit は Redo を消す)。
  変更時は `undoTxnResult(scene, 'Reorder cameras', ...)` の中で `names.forEach((name, i) => { const cam = scene.getCamera(name);
  if (cam.ui_order !== i) { cam.ui_order = i; scene.setCamera(name, cam); } })` — `getCamera` はコピー (vis 設定込み) を返し、
  `setCamera` が `CameraPropEditInfo` (undo) と `cameraChanged` (SEM_CHANGED) を出すので **新しい Scene API は不要**。
  `__current` は触らない (順序値が可視 camera と重なっても名前で tie-break されるだけ)

### B-3. `services/camera/cameraOps.ts` の変更

- `createCamera` (L49-60): `if (scene.hasCamera(trimmed)) return { ok: false }` を**削除**し、常に `scene.saveViewToCam(viewId, name)`。
  undo ラベルは既存なら `Change camera <name>`、新規なら `Create camera: <name>`。戻り値に `overwritten: boolean` を追加。
  ヘッダコメント (L41「rejects empty / already-taken names」) を修正。上書きで旧 camera の vis flags が消えるのは UXP と同じ (直さない)
- `destroyCamera` / `renameCamera` / `saveViewToCamera` / `applyCameraToView` / `cameraFile.ts` / clipboard paste は**変更なし**
  (順序は camera 本体に付いて回るので TS 側の保守は不要)

### B-4. 契約行

- `services/camera/camera.service.ts`: `services` に `listCameras`, `reorderCameras` を追加、`export type * from './cameraOrder'`
- `worker/shared/calls/camera.ts`: `CameraCalls` に 2 行 + `CAMERA_KEYS` に `'listCameras'`, `'reorderCameras'`
  (`calls/index.test.ts` が registry と 1:1 を検査)
- `services/sceneTree/sceneTree.ts` の `getCameraEntries` と `buildCameraRoot` 呼び出しは Part D で撤去
- `services/anim/read.ts readCameraNames` は**無変更**で C++ のソート済み順を得る (`__current` を含むのは従来通り)

### B-5. renderer が購読するイベント (Camera pane の `useLiveFetch` listener 1 本)

```ts
{ srcMask: SEM_SCENE | SEM_CAMERA, evtMask: SEM_ANY, scopeId: sceneId, debounceMs: EVENT_BURST_DEBOUNCE_MS,
  filter: (a) => a.srcCat === SEM_CAMERA                      // cameraAdded / cameraChanged (reorder 含む) / cameraRemoving
      || a.method === 'sceneLoaded' || a.method === 'sceneAllCleared' }
```
debounce は必須 (`destroyCamera` は map から消す**前**に `cameraRemoving` を発火する。reorder は camera 数ぶん `cameraChanged` が連続する)。
undo/redo の replay も同じ event を出すので追加の refetch は不要。
(`useLiveFetch` の `LiveFetchListener.filter?: (args) => boolean` と、`worker/client/eventSlots.ts` が渡す
`{ method, srcCat, evtType, srcUID, obj }` の形は確認済)

---

## Part C: renderer — View activity view と Camera pane

### C-1. activity view「View」の追加 (すべて追記のみ・migration 不要)

- `h3-kit/primitives/appIcons.ts` に Phosphor キーを追加: `activity.view` (`Binoculars`)、`ui.viewXform`
  (`Perspective`; ViewPane ヘッダ用。`ui.camera` は Camera pane に譲る)、`ui.cameraSave` (`FloppyDisk`)、
  `ui.cameraSaveVis` (同 glyph `weight: "fill"`)、`ui.cameraApply` (`Eye`)、`ui.cameraApplyVis` (同 fill)、
  `ui.link` (`LinkSimple`; file-linked バッジ)。既存の `ui.camera` / `node.camera` / `ui.add` / `ui.trash` / `ui.eyeOpen` を再利用。
  **E2E で判断**: with show/hide 版を fill weight で区別するのが見分けにくければ、小さな `ui.eyeOpen` バッジ重ねに変える
- `shell/ActivityBar.tsx` `BUILTIN_ACTIVITY_ITEMS`: `explorer` の直後に `{ id: "view", icon: "activity.view", label: "View" }`
  (`MainLayout.knownViews` はこの配列から導出されるので他は不要)
- `shell/SidePanel.tsx`: `VIEW_TITLES.view = "View"`, `VIEW_ICONS.view = "activity.view"`;
  `VIEW_PANES.explorer` から `view` entry を削除; `VIEW_PANES.view = [ { id: "camera", defaultSize: 200, <CameraPane/> },
  { id: "view", defaultSize: 300, <ViewPane/> } ]`; ヘッダ doc の表を更新
- `features/molview/ViewPane.tsx`: ヘッダ `icon="ui.viewXform"`、file header の「Explorer view の一部」を修正
- `state/layout/LayoutProvider.tsx` `LAYOUT_DEFAULTS`: `viewSizes.view: [200, 300]`, `viewCollapsed.view: { camera: false, view: false }`
  (永続済み `explorer` の 3 要素配列や `viewCollapsed.explorer.view` は位置参照/未知 id 無視で無害)
- `shell/renderIsolation.test.tsx` に `CameraPane` の stub mock を 1 行追加

### C-2. 新規モジュール `features/camera/`

```
features/camera/
  CameraPane.tsx                header + 6 tool buttons + flat list
  useCameraList.ts              useLiveFetch(listCameras) + Part B-5 の listener 1 本
  useCameraDragDrop.ts          flat before/after HTML5 DnD -> reorderCameras
  useCameraCtxMenu.ts           既存 camera menu template 再利用 + darwin/React 切替
  cameraCtxActionToCommand.ts   SceneCtxAction (camera 系) -> CommandInvocation の純関数
  cameraOps.ts                  hooks/sceneTree/useSceneTreeCameraOps.ts の本体を plain な (cm, sceneId, ...) 関数に移したもの
                                + deleteCamera / copyCamera / pasteCamera / reorderCameras
  useCameraCommands.ts          state/sceneTree/commands/useCameraCommands.ts を移動 (下記 C-3)
  camera-pane.css               token のみ。renderer/app.css に @import を 1 行追加 (feature CSS は全て app.css 経由)
```

**CameraPane.tsx**
- 依存: `useCueMol()`, `useActiveScene()` (`activeSceneId` / `activeMolViewId`), `useCommands().dispatch`, `useCameraList`
- state: `selected: string | null` (名前キー、pane ローカル。リストに無ければ null 扱い), `editing: string | null`
- ヘッダ: `PaneSectionHeader title="Camera" icon="ui.camera"` + `actions` に `ScenePane.tsx` L469-520 と同じ
  `ButtonGroup minimal` / `Button minimal small className="section-action-btn" icon={<AppIcon/>}` / `Tooltip compact`:

  | ボタン | icon | enabled | dispatch |
  |---|---|---|---|
  | New | `ui.add` | view あり | `CameraNew` (戻り値の名前を選択) |
  | Save (from view) | `ui.cameraSave` | view あり && 選択あり | `CameraSaveFromView { name, withVisFlags: false }` |
  | Save with show/hide | `ui.cameraSaveVis` | 同上 | `CameraSaveFromView { ..., withVisFlags: true }` |
  | Apply (to view) | `ui.cameraApply` | 同上 | `CameraApplyToView { name, withVisFlags: false }` |
  | Apply with show/hide | `ui.cameraApplyVis` | 同上 | `CameraApplyToView { ..., withVisFlags: true }` |
  | Delete | `ui.trash` | 選択あり | `CameraDelete { name }` |

- 本体: `div.sp-pane-scroll.camera-pane-body tabIndex={-1} data-clipboard-scope="camera-list" onKeyDown`
  の中に `<Listbox>`; 空なら `<div className="h3-list-empty">(no cameras)</div>`
- 行 = `<ListRow selected draggable ... data-camera-name>`: `<AppIcon name="node.camera"/>` + 名前
  (`span.camera-row-name.type-row`、編集中は `features/scene/InlineRenameInput`) + 右端バッジ
  (`visSize > 0` → `ui.eyeOpen size="sm"`、`src !== ''` → `ui.link size="sm"`)
- 単クリック = 選択のみ。ダブルクリック = `CameraApplyToView { withVisFlags: true }`。
  右クリック = 選択 + `useCameraCtxMenu` (行外の右クリックは `cameraRoot` メニュー = New / Paste / Camera file > Load)
- キー (`editing` 中は全て無効): `useListKeyNav` (↑↓) → `Delete`/`Backspace` = `CameraDelete` → `F2` = inline rename 開始。
  rename commit は trim・空/同名なら cancel、それ以外 `CameraRename { oldName, newName }` → 成功で新名を選択、
  終了時は wrapper に focus を戻す (ui-style-guide「行の編集モード」)
- clipboard: `useClipboardScope('camera-list', { copy → CameraCopy{name}, paste → CameraPaste, cut → copy 成功後 CameraDelete })`
  (`useSceneTreeController` L116-154 と同型)

**kit 変更 (必須)**: `h3-kit/list/ListRow.tsx` の `ListRowProps` を
`extends Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>` にして `...rest` を div に spread
(size props は増やさない = list-kit 規約内)。行 div 自体が drag 対象の full-width flex block なので ADR-0001 の
dead-zone 問題 (Blueprint label span) は起きない

**useCameraDragDrop.ts** (flat・before/after のみ)
- `CAMERA_MIME = 'application/x-cuemol-camera'`、`planCameraReorder(names, src, tgt, side): string[] | null`
  (純関数。src を抜いて tgt の前/後に挿入、結果が同じなら null)
- `onDragStart` で `srcRef` + `setData`、`onDragOver` で `preventDefault` + 行の上下半分で side 判定 + plan が通る時だけ
  indicator (`.is-drop-before` / `.is-drop-after`)、`onDrop` で `onReorder(plan)` → `cm.invokeService('reorderCameras', { sceneId, names })`。
  表示更新は `cameraChanged` event 経由 (optimistic state は E2E でちらつきが見えたら追加)。`editing` 中は `draggable={false}`
- 参考実装: `features/scene/sceneTree/useTreeDragDrop.ts` (`dragSourceRef`、plan で indicator をゲートする方針)

**useCameraCtxMenu.ts**
- `shared/sceneCtxMenu/sceneCtxTemplates.ts` の `buildTemplate` は既に `nodeType: 'camera' → buildCameraNodeMenu`、
  `'cameraRoot' → buildCameraRootMenu` を持ち、`IPC.SCENE_CTX_SHOW` の payload (`SceneCtxMenuPayload`) は
  `nodeType` / `nodeLabel` / `clipboardKind` / `cameraInfo` だけで tree id を含まない → **そのまま再利用**
- `features/scene/useSceneContextMenu.ts` L45-54 の darwin (native popup IPC) / それ以外 (`useShowContextMenu`) 切替を
  `hooks/sceneContextMenu/useShowSceneCtxMenu.ts` に抽出し、両 feature から使う。
  `buildSceneCtxPayload.ts` L104-110 の `CLIPBOARD_CUEMOL_PEEK` も `hooks/sceneContextMenu/peekClipboardKind.ts` に抽出
- payload: `{ x, y, nodeType: cam ? 'camera' : 'cameraRoot', nodeLabel: cam?.name ?? 'Cameras', isVisible: true,
  hasVisibility: false, clipboardKind: await peekClipboardKind(), cameraInfo: cam && { src, visSize } }`
- 戻り action: `rename` → `setEditing(name)` (UI 状態、command にしない)、それ以外は `cameraCtxActionToCommand(name, action)` で
  `CameraNew / CameraLoadFromFile / CameraPaste / CameraCopy / CameraDelete / CameraReload / CameraSave / CameraSaveAs /
  CameraEditVisFlags / CameraClearVisFlags / CameraSaveFromView / CameraApplyToView` に写して dispatch
- `buildCameraNodeMenu` の `propertyItem()` は**削除** (camera は `resolveNodeTarget` / worker `props/target.ts` が null を返す
  死んだ項目で、UXP の camera menu にも Properties は無い — ADR-0005 記載)

**camera-pane.css** (token のみ、行高/hover/selected は list-kit 任せ)
- `.camera-row-name` (flex:1, ellipsis)、`.camera-row-badge` (`--text-muted`、選択行は `--accent`)、
  `.camera-pane-body .h3-list-row { position: relative }`、`.is-drop-before::before / .is-drop-after::after`
  (2px `--accent` line。`_side-panel.css` の `.sn-drop-line` と同じ扱い)

### C-3. commands

- `commands/ids.ts` / `commands/CommandMap.ts` に追加:
  `CameraDelete 'scene.camera.delete' { name } → void`、`CameraRename 'scene.camera.rename' { oldName; newName } → boolean`、
  `CameraCopy 'scene.camera.copy' { name } → boolean`、`CameraPaste 'scene.camera.paste' void → void`。
  `CameraNew` の result を `string | null` (作成した名前 / cancel) に変更。**`CameraReorder` は作らない** (DnD は単一 surface。
  scene tree の `moveNode` も service 直呼びの先例)
- `state/sceneTree/commands/useCameraCommands.ts` → `features/camera/useCameraCommands.ts` に移動し、
  signature を `useCameraCommands({ cm, getActiveSceneInfo })` (`commands/useEditCommands.ts` と同型) にして
  **`hooks/useCommandRegistrations.ts` から登録** (scene tree の provider に依存せずアプリ寿命で生きる)。
  `openNewCameraFlow` (`useSceneNewFlows.ts`) もここへ移す (renderer 側に重複名チェックは無いので prompt flow は不変)
- 新 handler: `CameraDelete → cameraOps.deleteCamera (destroyCamera)`、`CameraRename → renameCamera`、
  `CameraCopy → copyNode({ nodeType:'camera', cameraName }) + writeSceneClip`、`CameraPaste → readSceneClip (camera 以外は拒否) + pasteNode`。
  `hooks/sceneTree/useSceneTreeNodeOps.ts` L33-67 の `writeSceneClip` / `readSceneClip` は `hooks/sceneTree/sceneClipIo.ts` に抽出して共用
- `SceneTreeCommands.tsx` から `useCameraCommands` と `openNewCameraFlow` prop を外す。`useSceneTree.ts` から
  `useSceneTreeCameraOps` 合成と `SceneTreeCameraOps` 型を外し、`hooks/sceneTree/useSceneTreeCameraOps.ts` は削除

---

## Part D: scene tree からの Camera 枝の撤去 (compile error 駆動で一気に)

`worker/shared/sceneTreeTypes.ts` の `SceneNodeType` から `'cameraRoot' | 'camera'` を外すと `tsc` が全箇所を示す
(`PropTargetType = SceneNodeType | 'view'` にも波及)。**`shared/types/sceneCtxMenu.ts` の `SceneCtxNodeType` は別 union**で、
pane が使うので `camera` / `cameraRoot` を残す。

- worker: `sceneTreeTypes.ts` (`cameraInfo` field / `CameraNodeInfo` / `CameraRootEntry` / `buildCameraRoot` 削除、`buildStyleRoot` は残す)、
  `services/sceneTree/sceneTree.ts` (`CameraInfoEntry` / `getCameraEntries` / `buildCameraRoot` push 削除)、
  `services/props/target.ts` / `sceneTree/sceneOps.ts` はコメントのみ
- renderer: `features/scene/ScenePane.tsx` (`TYPE_ICON` 2 key、`isRenameableType`、`nodeLabel`、コメント)、
  `features/scene/useSceneTree.ts computeOps` (`add`/`delete` = rendish のみ、`property = type !== 'styleRoot'`)、
  `state/sceneTree/useSceneTreeController.ts` (`addSelected` / `nodeDoubleClick` / `commitInlineRename` の camera 分岐)、
  `hooks/sceneTree/useSceneTreeNodeOps.ts` (`deleteNode` の `destroyCamera` 分岐、`copyNode` の camera 分岐)、
  `hooks/sceneContextMenu/buildSceneCtxPayload.ts` (`cameraInfo` 生成)、
  `state/sceneTree/commands/sceneCtxActionToCommand.ts` (camera 系 kind は `return null` にまとめ、switch を exhaustive に保つ)、
  `useSceneNewFlows.ts` (`openNewCameraFlow` 削除)、`state/inspector/resolveNodeTarget.ts` (コメント)
- 残す共有物: menu templates (`buildCamera*Menu`) + `SceneCtxAction` + `SceneCtxNodeType`、`IPC.SCENE_CTX_SHOW` + `main/sceneContextMenu.ts`、
  `EditCameraVisFlagsDialog`、`TextPromptDialog`、worker camera services、clipboard `'camera'` kind
- `tritium/CLAUDE.md`: 「Scene-content JSON schemas」の cameras 注記 (`getCameraInfoJSON` に `ui_order` が加わり表示順で返る) と
  「IDs are not URLs」の `buildCameraRoot` 言及を `listCameras` / `buildStyleRoot` のみに修正

**既存テストの追随** (`tsconfig.web.json` はテストも型検査するので fixture の `type: 'camera'` は全て直す):
`__test__/sceneTreeService.test.ts` (cameraRoot 期待の削除・`['object','styleRoot']`)、`__test__/useSceneTree.test.tsx`
(camera node と camera-op forwarding 行の削除)、`state/sceneTree/useSceneTreeController.test.tsx` (camera Add / double-click / rename)、
`state/sceneTree/commands/sceneCtxActionToCommand.test.ts` (camera describe 削除)、`state/sceneTree/SceneTreeProvider.test.tsx`、
`state/inspector/resolveNodeTarget.test.ts`、`__test__/bulkSceneNodeOpsService.test.ts`、`__test__/sceneOpsService.test.ts`、
`__test__/genericProps.test.ts` (`'camera'` → `'style'`)、`shared/sceneCtxMenu/sceneCtxTemplates.test.ts` (Properties 無しを 1 行追加)。
`scenePane*.test.tsx` / `cameraOpsService` / `cameraFileService` / `cameraVisFlagsService` / `editCameraVisFlagsDialog` / `ViewPane.test.tsx` は影響なし (grep 確認済)

---

## Part E: テスト (新規は最小集合 — 契約を pin するものだけ)

| # | ファイル | pin する契約 |
|---|---|---|
| 1 | 新規 `src/tests/qsys/test_camera_order.cpp` (A-5 の 2 件) | `setCamera` の採番/継承ルールと `getCameraInfoJSON` の順序; qsc 往復で順序保存・属性は出ない |
| 2 | 新規 `__test__/cameraOrderService.test.ts` | `listCameras`: `getCameraInfoJSON` の順をそのまま返し `__current` を除く。`reorderCameras`: `['b','a','c']` (現状 a,b,c) → 1 txn `Reorder cameras` 内で **ui_order が変わる camera だけ** `getCamera` → `ui_order` 代入 → `setCamera` (c は触らない); 同じ順で再呼出 → txn 無し |
| 3 | 編集 `__test__/cameraOpsService.test.ts` | 「既存名を拒否」ケースを「既存名は `Change camera <name>` ラベルで `saveViewToCam` (overwritten: true)」に置換 |
| 4 | 新規 `__test__/CameraPane.test.tsx` (`ViewPane.test.tsx` と同じ paneEnv / dispatch mock) | 未選択で Save/Apply/Delete disabled・New enabled; 行選択後に 4 ボタン → `CameraSaveFromView` / `CameraApplyToView` の `withVisFlags` が正しい; ダブルクリック → `CameraApplyToView { withVisFlags: true }`; Delete キー → `CameraDelete` |
| 5 | 新規 `__test__/cameraDragDrop.test.tsx` (`scenePaneDnd.test.tsx` の `makeDataTransfer` / `fireDrag` 流用) | cam0 を cam2 の下半分に drop → `invokeService('reorderCameras', { sceneId, names: ['cam1','cam2','cam0'] })` (完全な順序リスト); 同位置 drop → 呼ばれない |
| 6 | 新規 `__test__/useCameraCtxMenu.test.tsx` (`useSceneContextMenu.test.tsx` の darwin helper 流用) | 行メニューは `nodeType:'camera'` + `cameraInfo` を送り `cameraSaveFromView` を command に写す; 行外は `nodeType:'cameraRoot'`; `rename` は `onRename` のみで dispatch しない |

fake harness (`@renderer/worker/testing`): `fakeCamera` に `ui_order` accessor が無ければ `extra` で渡す (3 件目が必要になったら fake 側に足す)。

---

## Part F: docs

- **Step 0 (実装開始時)**: `docs/plans/260917-camera-pane-plan.md` にこのプランを置き、`docs/plans/_index.md` の表 (`| ファイル | 内容 | 状態 |`) に 1 行。完了時に状態を「実装済み」に更新
- **完了時**: `docs/architecture/camera-pane.md` (実装済み仕様: View activity view、name-keyed 行、toolbar/menu/keys、
  **camera `ui_order` の採番/継承ルールと qsc 要素順による保存 (object/renderer との対応、`saveViewToCam` での -1 リセット、旧 UXP 再保存で
  アルファベット順に戻る制約)**、DnD → `reorderCameras` (getCamera/setCamera 経由の undo)、refresh mask、tree から外した理由、共有物)
  + `docs/architecture/_index.md` に bullet 1 行
- mapping: `docs/migration/mapping/panels.md` の `panel.workspace.tree` (cameraRoot 合成を撤去、camera double-click は pane へ)、
  `panel.workspace.toolbar` (Add は New Camera に行かない)、`panel.workspace.ctxmenu.camera` (surface は Camera pane、template/action 写像は再利用、
  Properties 項目削除)、`panel.fakedial` (ViewPane は View activity view へ); `custom_widgets.md` `widget.wheelbtn` の `panes/ViewPane.tsx` パス修正;
  `_index.md` に「Updated: 2026-09-17」行 (counts 不変)
- ADR-0005 に短い追記 (surface 移動・name-keyed 境界は不変・`cameraInfo` 合成は `listCameras` に置換・実装ポインタ更新)、ADR-0025 に配置の追記

---

## 実装順序と検証チェーン

1. **Part A** (C++) → `cd build_scripts && task build_libcuemol2` (`error:` を grep) → `task run_gtest` (test_qsys)
2. `task build_tritium_core` (= `cd tritium/core && npm run install`) で `Camera.ts` wrapper に `ui_order` が生成されることを確認
3. **Part B** (worker: shared DTO → `cameraOrder.ts` → `cameraOps.ts` 変更 → registry/契約行)
4. **Part C** (renderer、追記のみでアプリはビルド可能な状態を保つ): icons → `ListRow` 透過 → `features/camera/*` + CSS import →
   commands 行 + handler 移動 → SidePanel/ActivityBar/Layout defaults → ViewPane icon
5. `cd build_scripts && task build_tritium` → `task run_tritium` (`launch worker OK` → `CueMol2 nodejs add-on : INITIALIZED` → `bindCanvas` → `shader program created OK`)
6. **ユーザー目視確認 (E2E)**: View activity の 2 pane (collapse/resize の永続)、New (既存名で上書きされる)、Save/Apply ×2、
   ダブルクリック、F2 / ctx Rename、Delete キー、drag 並べ替え → qsc 保存 → `<camera>` 要素が表示順に並び `ui_order` 属性が無いことを確認 →
   再オープンで順序復元、並べ替え直後の Cmd+Z で順序が戻り pane が追従、Apply 後に別 camera へ Save しても順序が動かない (A-3)、
   行/空白の右クリック (macOS native)、Cmd+C/V、dark/light、fill weight アイコンの判読性。挙動が確定するまで 4-6 を繰り返す
7. **Part D** (tree 撤去。`tsc` に導かれて 1 回で終える) → `task build_tritium` → 起動確認
8. **Part E** のテスト追加・追随 → `cd tritium/react-gui && npm test` → `npx tsc -p tsconfig.web.json --noEmit` →
   `npx tsc -p tsconfig.node.json --noEmit` → `task lint_tritium_style` (ベースライン件数を増やさない)
9. **Part F** docs

## リスク / 注意

- `View::m_curcam` は apply した camera の `ui_order` を持ち越す → `saveViewToCam` で -1 に戻さないと別 camera の slot を奪う (A-3 で対処。E2E 項目にも入れた)
- `CameraPropEditInfo` は Camera 全値を保持するので、`copyFrom` に `m_nUIOrder` を足し忘れると undo で順序が -1 に落ちる
- Part B の契約行 (`listCameras` / `reorderCameras` / `CameraEntry`) が無いと Part C が compile しない → B を先に
- `SceneNodeType` 縮小の波及 (テスト 9 ファイル + `PropTargetType`) は Part D で一気にやる
- `IPC.SCENE_CTX_SHOW` が 2 surface 共有になる (payload ベースなので安全。architecture doc に明記)
- HTML5 DnD (Electron): `dragover` の `preventDefault` 必須、rename 中は `draggable` を切る
- 上書き保存で旧 camera の vis flags が消えるのは UXP と同じ (直さない)。architecture doc に記載
- 旧 UXP ビルドで再保存すると camera はアルファベット順に戻る (要件「tritium だけでよい」の範囲内)
