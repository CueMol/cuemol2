# Scene app data と render 設定の scene 保存

Status: Accepted (2026-09)

## 背景と目的

tritium の Rendering window (POV-Ray / umbreon / umbreon NPR) の設定は、それまで
`useRenderSettings` のメモリ上にしか無く、scene をまたいで共有され、保存もされなかった
(ADR-0017 / ADR-0035 で「非永続」と明記)。「この scene をこの設定でレンダーした」を
`.qsc` に残し、再オープン時に scene ごとに復元できるようにする。UXP には無かった機能なので
migration ADR ではなくここに記録する。

## 決定事項

| 論点 | 決定 | 理由 |
|---|---|---|
| スキーマ | QIF scriptable class `render::RenderSettings` (common 設定) + backend ごとの子 object `povray` / `umbreon` / `umbreon_npr` (各 1 property = 1 設定 key) | 型 validation と直列化を既存の property 機構に任せられる。`LScrObjBase::readFrom2` は未知 property を無視し、型不一致は `InvalidCastException` を catch して skip するので version 変更に対して tolerant |
| 既定値の原典 | **qif の `default` 文が唯一の原典**。GUI は fresh object の値から editor を初期化し、TS カタログは既定値を持たない (`RenderPropSpec = Omit<PropDef, 'value'>`) | 既定値が 2 箇所にあると drift し、意図しない値が scene に書かれる。qif に集約すれば将来の既定値変更が保存済み scene にも効く |
| 保存する値 | **ユーザーが明示的に変えた値だけ**。default と同じ値に戻したら `resetProp` で default フラグを戻し、ファイルから消す | 変えていない値が qsc に固定されると、将来 default が改善されても scene が古い値を引き継ぎ続ける |
| 格納場所 | `Scene` の汎用 typed app-data store (`<appdata id="render" type="RenderSettings" .../>`) | `qsys::ObjExtData` (QDF 向け) の qsc XML 版。class 未登録なら raw node を保持して再保存時にそのまま出す (データを失わない) |
| modified / undo | property 書き込みは undo/redo 対象。`Scene::isModified()` は undo スタックから導出 (別 flag は持たない) | scene 内容は全て undo 経由で変更されるという既存モデルに揃える。camera / style / anim も同様 |
| enum 風 UI 設定 | qif では `string`。選択肢 validation は TS 側 (PropDef カタログ) | "Per output pixel" のような UI 文字列は識別子ではなく、qif に enum を二重定義すると同期漏れで保存が失敗する |
| default 文 | 全 property に置く。ctor は `resetAllProps()` (wrapper 生成、event 無し) で宣言 default を適用。`backend` の default は `""` (未選択 = アプリ既定) | backend ごとに既定値が異なる (`lightIntensity` は POV 1.3 / umbreon 1.2 / NPR 1.55) が、backend ごとの子 object にしたので各ブロックが自分の default を持てる。NPR は umbreon を `extends` し、異なる default の property だけ再宣言 |
| 属性値の改行 | `LDom2OutStream` の属性エスケープに `&#10;` `&#13;` `&#9;` を追加 | hatch spec は複数行。XML parser は属性値内の生の改行を空白に正規化する (既存バグ。`ScriptColoring` の CDATA は回避策だった) |

## ファイル形式

```xml
<scene>
  ...
  <appdata id="render" type="RenderSettings" backend="umbreon" width="800">
    <umbreon type="UmbreonRenderSettings" aoEnabled="true" aoSamples="128"
             hatchLayersSpec="layer: kind=line&#10;layer: kind=dot&#10;"/>
  </appdata>
</scene>
```

- `id` と `type` は store が所有する属性。app-data class はこの名前の property を宣言してはならない。
- default と同じ property は書かれない (`LDom2OutStream` は default フラグの attr を skip)。全て default の
  子ブロックは要素ごと省略される (read-only container は `hasModifiedNodes` のときだけ書く)。触っていない
  backend のブロックはファイルに現れず、`backend` 属性もユーザーが選んだときだけ出る。
- 子ブロックの要素名 = backend id (`povray` / `umbreon` / `umbreon_npr`) = 親の object property 名。
- 同じ id が複数あれば後勝ち。

### 既定値の流れ

```
RenderSettings.qif (+ Pov/Umbreon/UmbreonNpr の qif) の default
  -> ctor resetAllProps()  -> fresh object
  -> worker getSceneRenderSettings: scene に無ければ fresh object の values / defaults を返す
  -> TS snapshotFromRenderSettings(values, { defaults }) -> editor (PropDef[])
  -> ユーザー編集 -> worker setSceneRenderSettings: 現在値と違う key だけ setProp、default と同値なら resetProp
  -> レンダー: scene の object (無ければ fresh object) -> C++ UmbreonSceneExporter::applyRenderSettings
```

TS 側に残る既定値のコピーはテスト fixture `react-gui/src/renderer/__test__/fixtures/renderSettingsValues.ts`
(qif の default の写し。drift してもテストにしか影響しない) だけ。設定 -> exporter の写像とその中の定数
(GI off 時の ambientFraction 0.16 固定、`umbreon-gi-lighting-balance.md` に根拠) は C++ の
`applyRenderSettings` にあり、TS には無い (下記「レンダー時の適用」)。

## 読み込みの寛容性 (warning, not error)

`Scene::appDataReadFrom` (src/qsys/Scene.cpp) の挙動:

| 入力 | 動作 | 報告 |
|---|---|---|
| `type` の class が未登録 | raw node を保持し、再保存時に verbatim 出力 | `appendErrMsg` (`SceneXMLReader.error`) |
| 未知の property | 無視 (`LScrObjBase::readFrom2` が consume しない)。子ブロック内は `umbreon.x` の形で報告 | 同上 (`property 'x' ignored (unknown or invalid)`) |
| 型に変換できない値 | skip、ctor 値のまま | 同上 |
| `id` / `type` 欠落 | 要素ごと無視 | 同上 |

`readFrom2` は `setPropertyImpl` を直接呼ぶので、ロード中に prop event も undo 記録も発生しない。
子ブロックの要素は readonly object property として既存の子 object に読み込まれるが、その要素自体は
consumed にならないため、`Scene::appDataReadFrom` の未消費報告は container を下降して leaf だけ報告する。

## 入れ子 property の落とし穴 (子ブロックを扱うときの規約)

`NestedPropHandler` (`src/qlib/NestedPropHandler.hpp`) による dot-path (`umbreon.aoSamples`) の
get/set には非直感的な制限がある:

- 経路途中の property が無い / object でない / null のとき、**例外を投げずに root object を返す**
  (`last_name` は full の dotted 名)。typo した `setProp("umbreno.aoSamples")` は root の未知 property として
  静かに失敗する。
- by-value の `object<Foo>` (`$` 無し) は `getProperty` がコピーを返し、子への書き込みが元に反映されない。
- 子の変更を undo / event に載せるには親 ctor の `setupParentData(name)` が必須 (root uid の配線)。

規約: **dot-path を C++ に渡して書き込まない**。worker は `parent.getProp('umbreon')` で子 wrapper
(smart pointer なので同一 object) を取り、子に対して plain な `setProp` / `resetProp` / `getProp` /
`getPropsJSON` を呼ぶ (`renderSettings.service.ts`)。`<block>.key` は TS 側の map の key に過ぎない。
子ブロックは全て `object<Foo$>` で宣言する。

## event と undo

- `qsys::SceneAppData` (src/qsys/SceneAppData.{hpp,cpp}) が基底。`LNoCopyScrObject` + `LUIDObject` +
  `LPropEventListener`。ctor で `ObjectManager::sRegObj`、自身を prop listener に登録。
- `propChanged`: `Object::propChanged` と同型。`UndoUtil(sceneID)` が有効 (txn 中) なら
  `PropEditInfo::setup(getUID(), ev)` を積む。txn 外の書き込みは記録されず `isModified()` も変わらない
  (GUI は必ず txn で包む)。
- その後 scene event `SCE_SCENE_APPDATA_CHG` (category `sceneAppDataChanged`, `SEM_SCENE` /
  `SEM_CHANGED`, `descr` = app-data id, JSON に `propname`) を発火。scene ロード中は発火しない。
  C++ は property ごとに 1 event を出すので GUI 側は burst debounce する。
- undo/redo の replay も同じ経路で event を出す (GUI が追従できる)。

## Scene.qif API

```
object<LScrObject$> getAppData(string id);                       // 無ければ null
object<LScrObject$> getCreateAppData(string id, string className); // holder 作成は編集ではない
boolean hasAppData(string id);                                    // live object の有無 (raw-only は false)
boolean removeAppData(string id);                                 // undo 不可、event なし (GUI 未使用)
```

`getCreateAppData` は `ClassRegistry::getClassObjNx` で class を引き、`SceneAppData` でなければ
`IllegalArgumentException`、未登録なら null。C++ の RenderSettings は `src/modules/rendering/`
(`render.moddef` で登録)。

### 別の app data を足す手順

Scene や直列化の変更は不要:

1. `qsys::SceneAppData` を継承した scriptable class を qif で宣言 (全 property に `default`、ctor で
   `resetAllProps()`) し、その module の moddef で登録する。
2. worker で `scene.getCreateAppData("<id>", "<Class>")` を呼び、property を読み書きする (書き込みは
   `withUndoTxn` / `undoTxnResult` の中で、現在値と違う key だけ)。
3. tritium 側にその id の消費者を足す。bridge の `sceneAppDataChanged` listener は `descr` (= id) で
   filter しているので、新 id には別の listener を用意する。

id は小文字の名詞 (`render`)、アプリ固有なら接頭辞付き (`tritium.layout`) を推奨。

## レンダー時の適用 (C++ `applyRenderSettings`)

設定 -> umbreon exporter property の写像は C++ に 1 つだけ置き、tritium / cuetty / Python が共有する
(POV-Ray は blendpng 起動など TS 依存が強いので対象外。`PovrayBackend.ts` は従来どおり snapshot から写す):

```
string UmbreonSceneExporter::applyRenderSettings(object<RenderSettings$> settings, string backend)
```

- `backend`: `"umbreon"` | `"umbreon_npr"` | `""` (auto: `settings.backend` が `umbreon_npr` ならそれ、
  それ以外 (`""` / `povray`) は `umbreon`)。他の明示値は `IllegalArgumentException`。戻り値は適用した block id。
- common: `projection` -> `perspective`、`clipPlane` -> `useClipZ`、`edgeLines` -> `showEdgeLines`、
  `transparentBg` -> `transparentBackground`、`width` / `height` は `unit` + `dpi` を px に換算
  (`max(1, round(v))`; TS `sizeUnitToPx` と同じ式)。camera は触らない (呼び出し側)。
- block: `aoEnabled` false -> `aoSamples` 0 で AO の他 knob は書かない (exporter の ctor 値のまま。GI と
  `aoResDiv` -1 の組み合わせ警告を避ける)、`aoGather` -> `aoResDiv` (-1 / 0)、`useGI = !npr && block.useGI`、
  `ambientFraction` は GI on のときだけ block 値で GI off では 0.16 固定、plain: `giSamples` (文字列 -> int、
  不正は 32) / `denoise` (OIDN / A-trous / None -> `giDenoise` + `denoiser`) / sky、npr: `hatchEnable`、
  `hatchColoring` -> `hatchBase` + `hatchInk`、custom スイッチ off の色は `""`、`hatchLayersSpec` /
  `hatchToneSpec` はそのまま転送 (`""` = style 自身)。
- POV 専用の common (`numThreads` / `postBlend` / `stereo*` / `pixelLabels`) は読まない。

### 消費者

| 消費者 | 設定 object | block |
|---|---|---|
| tritium `worker/.../backends/UmbreonBackend.ts` (`makeExporter`) | `renderSettingsForRender(ctx, scene)`: scene の app data、無ければ `createObj("RenderSettings")` の transient (fresh) object。**holder は作らない** (render は edit ではない)。`flushBeforeStart` が editor の状態を scene に書いてからレンダーが始まる (同じ IPC channel -> 同じ worker queue で FIFO)。editor が fresh 既定と同値で書かなかった scene は fresh object と一致する | window が選んだ backend id を明示 (`backend` は未選択だと `""`) |
| `cli/render_scene.cpp` (cuetty) | `getAppData("render")`、無ければ `cuemol2::createObj("RenderSettings")` の transient object。`invokeMethod("applyRenderSettings")` 経由 (rendering module のヘッダは install されない) | `""` (scene の選択) |
| `pymod/python/cuemol/umbreon_render.py` (`apply_scene_settings`) | 同上 (`cm.createObj`) | `""` |

scene に設定が無い場合、cuetty / Python は GUI の `applyViewCamera` と同じく projection だけ camera の
`perspec` に従う (class default の perspective で ortho scene を描かないため)。設定がある scene は
保存された `projection` が camera に勝つ (GUI と同じ)。

TS 側から呼ぶときは method の存在を probe し、無ければ throw する (古い addon)。TS に fallback の写像を
残さない (二重実装に戻る)。

## tritium 側

### データフロー

```
Rendering window                 main proc            Main window (bridge)            Web Worker
---------------------------------------------------------------------------------------------------
target scene 変更 ---RELAY_GET sceneRenderSettings--> responder --invokeService--> getSceneRenderSettings
   <---------------------------- { ok, exists, values } <-----------------------------------
   snapshotFromRenderSettings(values) -> settings.loadFromScene(...)        (書かない)

ユーザー編集 (debounce) --COMMAND write-settings {sceneId, values}--> execCommand --> setSceneRenderSettings
                                                                                     (undoTxnResult, 不変 key skip)
                                                                                     C++ が sceneAppDataChanged
                                                        useCueMolEventListener <---- event-notify
                                                        --invokeService getSceneRenderSettings-->
   <---STATE_PUSH { kind:'sceneSettings', sceneId, exists, values } ---- pushState
   guard: pending write あり / editor と同値 なら無視、それ以外は loadFromScene   (書かない)
```

### 書き込みトリガー (`useSceneSettingsSync`)

書く: ユーザー編集 (`useRenderSettings.userEditSeq`: `handleChange` / backend / lighting / quality step /
size preset / hatch 編集、`PERSIST_DEBOUNCE_MS` で 1 burst = 1 undo entry)、レンダー開始
(`flushBeforeStart`)、履歴の「Use settings」(`restoreFromHistory`、即時 1 回)。

書かない: 履歴の `<` `>` (画像のみ切替。ADR-0035 の挙動を変更)、scene からの読み込み、target view の
カメラ既定 (`applyViewCamera`; scene に保存済み設定があれば呼ばれない)、起動時の umbreon auto-default、
mode 切替 (mode は保存対象外。サイズ副作用は次の編集かレンダーで書かれる)、movie 出力設定 (ADR-0043)。

umbreon のレンダーは snapshot ではなく scene の object から設定を読む (上記「レンダー時の適用」) ので、
`flushBeforeStart` がレンダー前の書き込みを担う。snapshot は mode / movie 出力設定 / POV backend のために
残っている。

### Rendering window の Cmd+Z

設定が scene の編集になった以上、render window の Cmd+Z / Shift+Cmd+Z は target scene の undo /
redo を意味する (テキスト欄にフォーカスがあるときは入力の取り消し。main window と同じ振り分け)。
キーの所有者は OS ごとに 1 つ ([keyboard-shortcuts](keyboard-shortcuts.md) と同じ構成):

| OS | 入口 |
|----|------|
| macOS | native menu の key equivalent -> `main/menu.ts` がフォーカスを見て、Rendering window なら `RENDER_WINDOW_EDIT_PUSH { action }` を push (他の window は従来通り native edit) |
| Windows / Linux | `useRenderWindowEditKeys` の window keydown (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) |

両者とも `useRenderWindowEditKeys.handle` に合流し、`dispatchEditUndoRedo` (テキスト欄なら main 経由の
native undo) で処理されなければ `RenderWindowCommand { type: 'edit', action, sceneId }` を送る。
main window の bridge (`RenderWindowBridge.tsx` の `onEditScene`) は、target が active scene なら
`CmdId.Undo` / `CmdId.Redo` を dispatch して toolbar / menu の undo 状態も更新し、それ以外の scene は
`cm.undo(sceneId)` を直接呼ぶ。undo された entry が render 設定なら `sceneAppDataChanged` が飛んで
editor が追従する。

### loop guard

bridge は stateless (event -> 再取得 -> push)。render window 側で「pending write がある」「push 値が
editor と同値」なら無視、それ以外は reload。load は決して書かないので ping-pong は起きない。
自分の書き込みの echo、undo/redo、他 writer、C++ 側の値正規化を 1 つの規則で扱える。

### validation (`sceneRenderSettings.ts`)

key 命名: common は `key`、backend ブロックは `<backend>.key` (`umbreon.aoSamples`)、hatch spec は
`umbreon_npr.hatchLayersSpec` / `hatchToneSpec`。

`snapshotFromRenderSettings(values, { defaults, umbreonAvailable, mode })`:

- `backend`: 空文字は「未選択」で警告なしにアプリ既定 (`backendExplicit: false`)。未知値 / umbreon 不可なら
  既定 + 警告。
- `unit` を先に解決し、`width` / `height` は `setSizeProp` で単位に合わせて再構築 (finite かつ > 0)。
- `enum`: `options` に含まれる。`color`: `#rrggbb`。`combo` (`dpi`): finite > 0 (preset は候補であり
  custom 値を許す)。`boolean`: typeof。`integer`/`real`: finite かつ `[min,max]`。
- 欠落 / 不正な値 -> C++ の class default (`defaults`) + 警告。それも受理できなければ placeholder。
- editor に無い key (C++ class が持つが UI に出さない property、例: NPR が継承する GI key) は無視 (警告なし)。
- `mode: 'warn'` (既定) は `console.warn` 1 回、`'strict'` は throw (テスト用)。

`valuesFromSnapshot(s, { backendExplicit })` は `backend` (未選択なら `""`) + common + active backend の
block key (+ `umbreon_npr` の hatch 2 key) を C++ 型に強制して返す。`getSnapshot('store')` は template
未到着中も hatch spec を含め、ロード直後の書き込みで保存済み look を消さない。backend 切替時の editor は
`useSceneSettingsSync.backendPropsFor(id)` (scene の値 = 保存値 or C++ 既定) から組み、TS カタログの値は
使わない (カタログに値は無い)。

### 契約行

| マップ | 行 |
|---|---|
| `worker/shared/calls/render.ts` `ServiceMap` | `getSceneRenderSettings` / `setSceneRenderSettings` |
| `worker/server/services/renderSettings/renderSettings.service.ts` | 上記 2 service (`RENDER_SETTINGS_UNDO_LABEL = 'Change render settings'`)。reply は `{ exists, values, defaults }`、書き込みは子 wrapper 経由・default 同値は `resetProp` |
| `data/renderSettings.ts` / `data/renderBackends.ts` | `RenderPropSpec` (値を持たないカタログ行) |
| `worker/shared/renderSettingsValues.ts` | `sameRenderValue` / `sameRenderValues` (両 thread で使う比較) |
| `shared/types/renderWindow.ts` | `RenderSettingsValues`, `SceneRenderSettingsReply`, `RelayKinds.sceneRenderSettings`, `RenderWindowCommand` `'write-settings'` / `'edit'`, `RenderWindowStateUpdate` `'sceneSettings'`, `RenderWindowEditAction` |
| `shared/ipcChannels.ts` / `shared/ipcContract.ts` | `RENDER_WINDOW_EDIT_PUSH` (push: main -> render window, `RenderWindowEditAction`) |
| `main/ipc/windowRelay.ts` | `FALLBACKS.sceneRenderSettings` |
| `shared/ipcContract.ts` | 変更なし (union を型名で参照) |
| `.qif` (`Scene` / `RenderSettings`) | `getAppData` / `getCreateAppData` / `hasAppData` / `removeAppData`、event `sceneAppDataChanged` (`descr: "render"`) |
| `.qif` (`UmbreonSceneExporter`) | `applyRenderSettings(settings, backend)` (設定 -> exporter の唯一の写像) |
| `worker/server/services/renderSettings/renderSettings.service.ts` | `renderSettingsForRender(ctx, scene)` (scene の object か transient な fresh object。holder を作らない) |
| `worker/server/services/renderjob/backends/RenderBackend.ts` | `beginInProcessAnimFrame(ctx, scene, animMgr, snapshot, outputPath)` (frame の scene = 設定の出所) |
| `cli/render_scene.cpp` / `pymod/python/cuemol/umbreon_render.py` | 同じ method を呼ぶ CLI / Python の消費者 (`--width/--height`, `-W/-H` は上書き) |

## 採らなかった案

- **Scene に RenderSettings 専用 member**: `AnimMgr` と同型で最短だが、qsys が rendering module に
  依存する。汎用 store なら class 未登録でもデータを温存でき、将来の app data にも使える。
- **JSON blob (`<![CDATA[...]]>`) + TS validation のみ**: C++ 変更は最小だが QIF の型情報を使えず、
  Python/JS から `scene.getAppData("render").aoSamples` のように読めない。
- **qif enum**: TS カタログと二重管理になり、同期漏れが保存失敗 (throw) になる。
- **平坦な 1 class + default 無し (初版)**: 全 property が書かれ、触っていない backend の値まで scene に
  固定される。将来 default を変えても保存済み scene に効かないため、子ブロック + default 宣言に改めた。
- **TS カタログに既定値を残す**: qif と drift すると意図しない値が「明示的な変更」として書かれる。
- **hatch spec を CDATA 子要素に**: RenderSettings に独自 `writeTo2/readFrom2` が要る。属性エスケープの
  修正は全 string property の問題を直す。
- **undo 非対象 + 別 modified flag**: `isModified()` の定義に例外を足すことになる。

## テスト (必要最低限: 契約が壊れたら検知できるものだけ)

| 内容 | 場所 |
|---|---|
| 属性値の LF/CR/TAB ラウンドトリップ | `src/tests/qlib/test_ldom2stream.cpp` |
| event category mapping (GUI が購読する文字列) | `src/tests/qsys/test_sceneevent.cpp` |
| 未登録 class -> null、未登録 type の verbatim 温存 | `src/tests/qsys/test_scene_appdata.cpp` |
| fresh object が宣言 default と一致 (subclass 上書き含む)、未変更は要素ごと省略 / 変更した属性だけ出力 / reset で消える、qsc 往復 (子ブロック・複数行 spec)、子ブロック内の不正値の tolerance (`umbreon.x` で報告)、子 object の変更の undo/redo (txn 外は非記録)、event (parent 名付き、ロード中は無音) | `src/tests/modules/rendering/test_render_settings.cpp` (`test_render`, 常時ビルド) |
| 全 backend の値ラウンドトリップ、fallback (不正値 -> C++ default、欠落、umbreon 不可、`""` backend、default 自体が不正) と warn/strict | `react-gui/src/renderer/__test__/sceneRenderSettings.test.ts` |
| 書き込みの undo 粒度 (差分 key のみ・子 wrapper 経由・default 同値は `resetProp`・1 txn・変更なしは txn なし)、scene に無ければ fresh object の値 | `react-gui/src/renderer/__test__/renderSettingsService.test.ts` |
| load は書かない、編集 burst は 1 write、echo push は無視・差分 push は反映 | `react-gui/src/renderer/__test__/useSceneSettingsSync.test.ts` |
| `userEditSeq` は編集のみ、読み込みサイズの preset 表示 | `react-gui/src/renderer/__test__/useRenderSettings.test.ts` |
| `sceneAppDataChanged` -> 再取得 -> `sceneSettings` push | `react-gui/src/renderer/__test__/useRenderWindowBridge.test.ts` |
| `applyRenderSettings` の写像 (common + block、単位換算、AO / ambient / hatch の gating、backend 解決と未知 id の throw) | `src/tests/modules/rendering/test_umbreon_apply_settings.cpp` (`test_render`、umbreon 不要) |
| umbreon backend は scene の object (無ければ fresh、holder 非作成) を `applyRenderSettings(obj, id)` で attach / beginFrame の前に渡す、method 不在は throw、start 順序と handle の転送 | `react-gui/src/renderer/__test__/umbreonBackend.test.ts` |
| 設定の無い scene は class 既定 + camera の projection (holder 非作成)、保存設定がレンダーを決め明示サイズが勝つ | `tests/rendering_tests/test_umbreon_render.py` (umbreon 必須) |

## 既知の制約と今後

- 初回書き込みを undo すると ctor 値の RenderSettings が scene に残る (holder 作成は非 undo)。TS は
  既定値として読むだけなので破綻はしない。
- 複数 render window は非対応 (open-or-focus)。
- `removeAppData` は undo 不可のまま (GUI から未使用)。
- movie は frame ごとに scene の object を読み直すので、レンダー中に設定を編集すると後続 frame に反映される
  (以前は開始時の snapshot で全 frame を描いた)。
- ロード直後 (hatch template 未到着) の umbreon_npr レンダーは、scene に保存された hatch spec をそのまま
  描く (以前の snapshot 経路は template と比較できず style 自身の look で描いていた)。
