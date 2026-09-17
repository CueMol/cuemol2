# Camera pane と camera の表示順 (`ui_order`)

Status: Accepted (2026-09)

## 背景と目的

UXP GUI では名前付き camera は workspace tree の `Camera` ノード配下にぶら下がり、
操作 (save from view / apply to view / vis flags / file I/O / rename / delete) は**すべて
右クリックメニュー**にあった。tritium も当初その構成を移植していた (ADR-0005 / ADR-0026)。

ユーザーからの要望は 4 つ:

1. camera を独立した pane にする (既存の View pane と合わせて **View activity view** を新設)
2. 新規 camera 作成時に既存名を入力したら**上書き** (UXP と同じ挙動)
3. エントリを**並べ替え**でき、順番が **qsc に保存**される
4. save / apply を context menu なしに **tool button** で。**with show/hide** 版も同様に

camera は object の階層の一部ではなく視点のリストなので、tree の枝ではなく専用 pane が素直だった。

## 決定事項

| 論点 | 決定 | 理由 |
|---|---|---|
| `__current` | 一覧に出し、**先頭に固定** (ドラッグ不可・その上には何も置けない) | UXP も tree に出していた。scene を開いたときの視点そのものなので、ユーザーが並べる「名前付きの視点」とは役割が違い、常に同じ場所にある方が探しやすい |
| 配置 | activity bar に **View** view を新設。上が **Camera pane**、下が既存の **View pane** (Explorer から移動) | camera と view transform はどちらも「視点」の操作。Explorer は scene 構造 (Scene / Color) に専念する |
| scene tree の Camera 枝 | **撤去**。`buildCameraRoot` と `SceneNodeType` の `camera` / `cameraRoot` を削除 | 表示と操作の入口が 2 箇所にあると必ず drift する。tree 側は uid キー、camera は名前キーで、同じ union に同居させる必然性も無かった |
| 並び順の保存 | Camera に `ui_order` property を新設 (`(nopersist)`)。qsc には**要素の並び順**として保存 | object / renderer と同じ仕組み。順序が camera 本体に付いて回るので、rename / delete / paste / undo で TS 側のリスト保守が一切要らない |
| 上書き | `createCamera` は既存名でも `saveViewToCam` する (undo ラベルだけ変える) | UXP `ws.createCamera` と同じ。`Scene::setCamera` はもともと upsert |
| with show/hide | ツールバーに 4 ボタン (Save / Save+show-hide / Apply / Apply+show-hide) | トグル状態を覚えさせるより、押したボタンが何をするか見えるほうが誤操作が少ない |

## C++ 側: camera の表示順

`src/qsys/Camera.{hpp,cpp,qif}`, `src/qsys/Scene.{hpp,cpp}`。

- `Camera::m_nUIOrder` (既定 `-1` = 未採番) と `ui_order` property (`(nopersist)`)。
  `copyFrom` でコピーされるので、`Scene::getCamera` のコピー・undo の `CameraPropEditInfo`・
  `View::m_curcam` がスロットを保持する。`equals()` には**含めない** (唯一の利用は
  `View::setCameraAnim` の anim 判定で、順序は view の状態ではない)。
- `Scene::setCamera` は、渡された camera の `ui_order` が負のときだけ採番する:
  **新規なら `max+1`、上書きなら旧 camera のスロットを継承**。undo 情報を積む前に行うので、
  undo/redo でも順序が再現する。この 1 ルールで qsc ロード (読んだ順に採番)・paste・
  `.cam` load・reload・rename (destroy + 同一オブジェクトの setCamera) が全部正しくなる。
- `Scene::saveViewToCam` は view の camera のコピーに対し `setUIOrder(-1)` する。
  view は最後に apply した camera のスロットを持ち越しているので、これをしないと
  別 camera のスロットを奪う。
- `Scene::camerasWriteTo` と `getCameraInfoJSON` は `ui_order` 昇順 (同値は名前順) で走査する。
  前者により **qsc の `<camera>` 要素順 = 表示順** となり、`ui_order` 属性は書かれない
  (nopersist)。後者により GUI / anim の camera select / スクリプトが同じ順を見る。
  `getCameraInfoJSON` の各要素に `"ui_order": N` が加わった。

**既知の制約**: 旧 UXP ビルドでその qsc を再保存すると、camera は `std::map` の名前順に戻る
(UXP は順序を持たないため)。要件は「tritium だけが順番を尊重すればよい」なので許容する。

## worker services

`renderer/worker/server/services/camera/cameraOrder.ts` + 契約行 (`worker/shared/calls/camera.ts`)。

| service | 役割 |
|---|---|
| `listCameras({ sceneId })` | `getCameraInfoJSON` を parse して `CameraEntry[]` を返す。C++ が既にソート済みなので TS 側では並べ替えない。**`__current` も 1 行として出し、常に先頭に固定する** |
| `reorderCameras({ sceneId, names })` | pane が drop 後の**完全な順序**を送る。現存する camera 名に絞り、送られなかったものは末尾に補完。**`__current` は並べ替えの対象外**なのでスロットを受け取らず、他の camera が 0 から採番される。現在の表示順と同じなら **txn を張らない** (空 commit は redo スタックを消すため)。変更時は 1 つの `Reorder cameras` txn 内で、スロットが変わる camera だけ `getCamera` -> `ui_order` 代入 -> `setCamera` |

`reorderCameras` が `setCamera` 経由なのは、それが `CameraPropEditInfo` (undo) と
`cameraChanged` イベントを出す既存の経路だからで、Scene に新しい API は要らなかった。

`createCamera` は `hasCamera` による拒否をやめ、既存名なら undo ラベルを `Change camera <name>`
にして上書きする (戻り値に `overwritten` を追加)。**上書きすると旧 camera の vis flags は消える**
(view の camera は vis flags を持たないため)。これも UXP と同じ挙動なので直していない。

`CameraEntry` と `INTERNAL_CAMERA_NAME` は `worker/shared/cameraTypes.ts` にある
(renderer は `worker/server` から値を import できないため)。

## renderer 側

`renderer/features/camera/`:

| ファイル | 役割 |
|---|---|
| `CameraPane.tsx` | ヘッダ (6 ツールボタン) + flat list。行は名前キー |
| `useCameraList.ts` | `useLiveFetch(listCameras)` + イベント購読 |
| `useCameraDragDrop.ts` | before/after だけの HTML5 DnD。`planCameraReorder` / `planCameraDropAtEnd` は純関数。**行の下の空き領域も drop 先** (= 末尾へ移動)。ドラッグ画像は `setDragImage` で行自身を指定する |
| `useCameraCtxMenu.ts` | 既存の camera menu template を再利用 |
| `cameraCtxActionToCommand.ts` | menu action -> command (camera 名に対して解決) |
| `cameraOps.ts` | worker 呼び出し (plain async 関数) |
| `useCameraCommands.ts` | `CmdId.Camera*` のハンドラ。`useCommandRegistrations` からアプリ全体に登録 |

- **ツールバー**: New / Save / Save with show/hide / Apply / Apply with show/hide / Delete。
  Save・Apply は選択行とアクティブな molview が要る。
- **固定行**: `__current` は先頭に固定し、`draggable` を外して drop 先としても「その下」に解決する
  (indicator も下側にしか出ないので、見えている位置と結果がずれない)。それ以外の操作 (apply / save /
  rename / delete / メニュー) は他の行と同じ。
- **末尾へのドロップ**: 行の下の空き領域に落とすと末尾へ移動する (indicator は最終行の下に出る)。
  最終行の下半分だけが末尾への入口だと、リストの一番下へ持っていく操作が当たり判定探しになるため。
- **行**: 単クリック = 選択のみ、ダブルクリック = apply **with** show/hide (UXP parity)、
  F2 / 右クリック Rename でインライン編集、Delete / Backspace で削除
  ([ui-style-guide](../migration/ui-style-guide.md) の「行の編集モード」)。
  右端に `src` があればリンク、`visSize > 0` なら eye のバッジを出す。
- **context menu**: `SceneCtxMenuPayload` は camera を名前と表示状態だけで identify していて
  tree id を含まないので、`buildCameraNodeMenu` / `buildCameraRootMenu` と
  `IPC.SCENE_CTX_SHOW` (macOS native / 他は MenuPanel) をそのまま再利用できた。
  空白部分の右クリックは root menu (New / Paste / Camera file > Load)。
  camera の **Properties 項目は削除**した (UXP の camera menu にも無く、camera は uid を
  持たないので inspector が解決できない死んだ項目だった)。
- **リフレッシュ**: `SEM_CAMERA` の任意イベント + `SEM_SCENE` の `SEM_CHANGED` を購読する。
  debounce は必須で、`destroyCamera` は map から消す**前**に `cameraRemoving` を出し、
  reorder は camera 数ぶん `cameraChanged` を連続で出す。undo/redo の replay も同じ
  イベントを出すので、コマンド結果による再取得は要らない。

`h3-kit/list/ListRow` は div の props を透過するようにした (drag ハンドラ・data 属性を
行に付けるため)。サイズ props は増やしていないので list-kit の規約内。

## scene tree 側の撤去

`SceneNodeType` から `camera` / `cameraRoot` を外すと `tsc` が全箇所を示す
(`PropTargetType = SceneNodeType | 'view'` にも波及)。消したもの:
`buildCameraRoot` / `CameraNodeInfo` / `cameraInfo` / worker の `getCameraEntries`、
ScenePane のアイコン・ラベル・rename 可否、`computeOps` の camera 分岐、
controller の Add / double-click / inline-rename の camera 分岐、
`deleteNode` / `copyNode` の camera 分岐、ctx payload の `cameraInfo`。

**残した共有物**: menu template (`buildCamera*Menu`) と `SceneCtxAction` /
`SceneCtxNodeType` (pane が使う)、`IPC.SCENE_CTX_SHOW` と main 側、
`EditCameraVisFlagsDialog`、worker の camera services、clipboard の `'camera'` kind。
`sceneCtxActionToCommand` の camera ケースは `return null` にまとめて switch の網羅性を保つ。

## テスト

| 内容 | 場所 |
|---|---|
| `setCamera` の採番/継承と `getCameraInfoJSON` の順序、qsc 往復で順序保存・`ui_order` 属性は出ない | `src/tests/qsys/test_camera_order.cpp` |
| `listCameras` の順序と `__current` の先頭固定、`reorderCameras` の 1 txn / 変更行のみ / 無変更は txn 無し / stale 名の扱い / `__current` を採番しないこと | `react-gui/src/renderer/__test__/cameraOrderService.test.ts` |
| 既存名は `Change camera` ラベルで上書き | `react-gui/src/renderer/__test__/cameraOpsService.test.ts` |
| ツールボタン 4 種の `withVisFlags`、ダブルクリック、Delete キー、選択がないときの disabled | `react-gui/src/renderer/__test__/CameraPane.test.tsx` |
| drop が完全な順序を送る / 無変更 drop は何もしない / 行の下の空き領域への drop は末尾へ / `__current` は drag 不可でその上に置けない | `react-gui/src/renderer/__test__/cameraDragDrop.test.tsx` |
| payload の nodeType と cameraInfo、action -> command、Rename は行エディタ | `react-gui/src/renderer/__test__/useCameraCtxMenu.test.tsx` |

## 関連

- [ADR-0005](../migration/adr/ADR-0005-camera-name-keyed.md) — worker 境界が名前キーである理由 (不変)
- [ADR-0026](../migration/adr/ADR-0026-camera-vis-flags-editor.md) — vis flags エディタ
- [ADR-0025](../migration/adr/ADR-0025-view-panel.md) — View pane 本体 (この変更で View view へ移動)
