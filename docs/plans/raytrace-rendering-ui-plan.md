# 実装計画書: レイトレーシングレンダリング UI（案C）

> 対象: `tritium/react-gui`
> 設計方針: 案C（Inspector の対象種別拡張）+ アプローチ1（結果は新規タブ）
> ステータス: ドラフト（実装着手前レビュー対象）
> 関連: `docs/migration/mapping/` の `dialog.tool.render-pov`

---

## 0. 背景・前提・調査結果サマリ

### 0.1 背景

CueMol2 旧 UI（uxp_gui）の POV-Ray レンダリング機能は **モードレスダイアログ** `render-pov-dlg.xul` として実装されており、"Main options" / "POV-Ray options" の 2 タブ構成・UI コントロール **38 個** を持つ。tritium/react-gui への移行にあたり、巨大 modal をそのまま再現せず、現行アーキテクチャ（Inspector / BottomPanel / ContentArea）に機能を分散配置して再設計する。

`docs/migration/mapping/_index.md` 上 `dialog.tool.render-pov` は `todo`。`docs/migration/option-ux-guidelines.md` は "one-shot export / rendering with many options" を巨大 modal でなく panel / drawer 型へ誘導しており、本計画の方針と整合する。

### 0.2 確定した設計方針

- **案C**: Inspector の責務を「現在フォーカスされているコンテキストのプロパティエディタ」と再定義し、既存4種別（renderer / object / scene / view）に5番目 `renderSettings` を追加する。Render Settings は**永続化しない**。Inspector ヘッダーで現在の対象種別を視覚的に明示する。
- **アプローチ1**: レンダリング完了時、ContentArea に**新しいタブ**として結果画像を開く。MolView タブ内トグルは採用しない。結果タブは独立タブとして複数並べられ、元シーンへの参照を保持する。
- POV-Ray の **exe / inc / blendpng パス等の環境依存設定はアプリ設定（SettingsPane、永続）に分離**する。Render Settings（Inspector、非永続）はシーン毎の表現設定に限定する。
- スコープは**単フレームレンダリングのみ**。アニメ連番レンダリング（UXP `anim-render-dlg`）は将来拡張点として §10 に記録する。
- 外部プロセス実行は libcuemol2 の `ProcessManager` を tritium/core 経由で再利用する（新規 spawn 機構は不要、§7）。
- 将来複数のレンダリングバックエンドをサポートするため、POV-Ray を1実装とし、バックエンド切り替えを追加しやすい抽象化を入れる（§8）。

### 0.3 移植元の実行パイプライン（`povrender.js`）

実行ロジックの移植元は `uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/povrender.js`。確定パイプラインは以下:

1. **入力ファイル生成** — `StreamManager.createHandler("pov", 2)` で exporter を生成し、`perspective` / `useClipZ` / `usePostBlend` / `showEdgeLines` / `usePixImgs` / `camera` / `width` / `height` 等を設定 → `attach(scene)` → `setPath(.pov)` → `setSubPath("inc", .inc)` → `write()` → `detach()`。post-blend 時は `exporter.blendTable`(JSON) と `imgFileNames` を取得。
2. **プロセス投入** — post-blend 時はレイヤー数ぶん `ProcessManager.queueTask(povExe, args, "")` を投入し、最後に `queueTask(blendpng, args, depends)` で合成タスクを投入。単レイヤー時は POV-Ray タスク1個（DPI 指定時のみ後段タスク）。
3. **進捗ポーリング** — 1 秒間隔タイマーで全タスクの `getTaskStatus(tid)` / `getResultOutput(tid)` を確認。stdout を正規表現 `Rendered (\d+) of (\d+) pixels \((\d+)%\)` で進捗 % に変換。
4. **完了** — 全タスク done で最終 PNG（一時ファイル）が利用可能。`saveImage(file)` でコピー保存、`onCopyImage()` でクリップボードコピー。

### 0.4 移植元の C++ バックエンド

- `ProcessManager`（libcuemol2 サービス）— 外部プロセスのキュー実行。`queueTask(exe, args, depends) → tid` / `getTaskStatus(tid)` / `getResultOutput(tid)` / `waitForExit(tid)` / `killAll()`。
- `StreamManager`（libcuemol2 サービス）— `createHandler("pov", 2)` で POV exporter を生成。
- `src/modules/rendering/` — `PovSceneExporter` / `PovDisplayContext` / `PovSilBuilder`。`PovSceneExporter` の主プロパティ: `perspective` / `makeRelIncPath` / `useClipZ` / `usePostBlend` / `blendTable` / `showEdgeLines` / `creaseLimit` / `edgeRise` / `usePixImgs` / `imgFileNames`。

---

## 1. 機能の責務分担（論点1）

### 1.1 判断原則

| 原則 | 配置先 |
|---|---|
| 設定値の編集（次回も同じ値で再現したい表現パラメータ） | **Inspector / Render Settings** |
| 状態遷移を伴う操作（実行・停止・進捗・ログ） | **BottomPanel / Render タブ** |
| 完了後の成果物の閲覧・書き出し（結果画像・保存・コピー） | **ContentArea / Render Result タブ** |
| 環境依存の永続設定（exe / inc / blendpng パス） | **SettingsPane**（責務表の枠外、参照のみ） |

### 1.2 uxp_gui 38 機能の配置（網羅表）

凡例: I=Inspector / B=BottomPanel Render タブ / R=Render Result タブ / S=SettingsPane

| # | uxp_gui 機能 | uxp の所在 | 配置先 | グループ／備考 |
|---|---|---|---|---|
| 1 | 画像幅 (output-image-width) | render-pov-dlg Main | I | Image |
| 2 | 画像高さ (output-image-height) | render-pov-dlg Main | I | Image |
| 3 | サイズ単位 (output-image-unit: px/in/mm/cm) | render-pov-dlg Main | I | Image（単位変換の振る舞い注記） |
| 4 | DPI (output-image-dpi) | render-pov-dlg Main | I | Image |
| 5 | プリセットサイズ (preset-size-list) | render-pov-dlg Main | I | Image |
| 6 | 画像スケール | （Blender 参考で追加） | I | Image |
| 7 | 投影方式 (proj-mode-list: perspec/ortho) | render-pov-dlg Main | I | Camera |
| 8 | ステレオモード (stereo-mode-list: none/left/right) | render-pov-dlg Main | I | Camera |
| 9 | ステレオ深度 (stereo-depth) | render-pov-dlg Main | I | Camera |
| 10 | CPU スレッド数 (num-threads) | render-pov-dlg Main | I | Quality |
| 11 | エッジライン表示 (enable-edgelines) | render-pov-dlg Main | I | Quality |
| 12 | crease limit（エッジ検出角度） | PovSceneExporter.creaseLimit | I | Quality |
| 13 | edge rise | PovSceneExporter.edgeRise | I | Quality |
| 14 | 出力ファイル形式 | render-pov-dlg | I | Output |
| 15 | 保存先（既定保存ディレクトリ） | render-pov-dlg | I | Output |
| 16 | 背景透過 (use-transp-bg) | render-pov-dlg Main | I | Output |
| 17 | クリップ平面有効化 (enable-clip-plane) | render-pov-dlg Main | I | Output |
| 18 | ポストブレンド有効化 (enable-post-blend) | render-pov-dlg Main | I | Output |
| 19 | ピクセルラベル表示 (enable-pixlabels) | render-pov-dlg Main | I | Output |
| 20 | バックエンド選択 | （新規。§8） | I | Render Settings 先頭セレクタ |
| 21 | radiosity モード (radio-mode-list: -1〜10) | render-pov-dlg POV | I | Backend Options（POV-Ray） |
| 22 | シャドウ有効化 (enable-shadow) | render-pov-dlg POV | I | Backend Options（POV-Ray） |
| 23 | ライトデフォルト使用 (povopt-lightdefault) | render-pov-dlg POV | I | Backend Options（連動の振る舞い注記） |
| 24 | ライトスプレッド (povopt-lightspread) | render-pov-dlg POV | I | Backend Options（POV-Ray） |
| 25 | ライトインテンシティ (povopt-lightinten) | render-pov-dlg POV | I | Backend Options（POV-Ray） |
| 26 | フラッシュ比率 (povopt-flashfrac) | render-pov-dlg POV | I | Backend Options（POV-Ray） |
| 27 | アンビエント比率 (povopt-ambinten) | render-pov-dlg POV | I | Backend Options（POV-Ray） |
| 28 | POV-Ray exe パス (povray-exe-path + btn) | render-pov-dlg POV | S | アプリ設定（永続） |
| 29 | POV-Ray inc パス (povray-inc-path + btn) | render-pov-dlg POV | S | アプリ設定（永続） |
| 30 | blendpng exe パス | preferences | S | アプリ設定（永続） |
| 31 | Start / Stop ボタン (accept, ラベル動的) | render-pov-dlg Result | B | 実行操作 |
| 32 | 進捗バー (progress) | render-pov-dlg Result | B / StatusBar | 詳細は B、概要は StatusBar（§4） |
| 33 | レンダリングログ（POV-Ray stdout） | putLogMsg | B | フェーズ・ログ表示 |
| 34 | 結果プレビュー画像 (image-box) | render-pov-dlg Result | R | 画像ビューア |
| 35 | ズーム操作 (ZoomBtn/UnzoomBtn/ZoomList 10〜300%) | render-pov-dlg Result | R | ビューアツールバー |
| 36 | Save Image ボタン (extra1) | render-pov-dlg Result | R | ビューアツールバー |
| 37 | Copy to Clipboard ボタン (extra2) | render-pov-dlg Result | R | ビューアツールバー |
| 38 | Close ボタン (cancel) | render-pov-dlg Result | — | tritium ではタブクローズに吸収 |

> uxp_gui 調査での総数: render-pov-dlg = 38 コントロール。加えて `anim-render-dlg` 専用 4 コントロール（出力ディレクトリ / ベース名 / FFmpeg / フレームスライダー）はスコープ外（§10）。

---

## 2. Inspector における設定のグルーピング（論点2）

### 2.1 方針

既存 `RendererPropertyEditor` 系（`PropertiesTab.tsx`）と一貫させ、`AccordionSection` を `PROPERTY_GROUPS` 相当のグループ定義配列で順に描画する方式を踏襲する（SegmentedControl は採用しない）。Render Settings は項目数が多いため、先頭にバックエンドセレクタ、続いてアコーディオン群を置く。

### 2.2 グループ構成

| 順 | グループ | UI | 項目 | defaultExpanded |
|---|---|---|---|---|
| 0 | Backend セレクタ | 非アコーディオン（`HTMLSelect`） | バックエンド選択（#20） | — |
| 1 | Image | AccordionSection | width / height / unit / dpi / preset / scale（#1-6） | `true` |
| 2 | Camera | AccordionSection | projection / stereo mode / stereo depth（#7-9） | `true` |
| 3 | Quality | AccordionSection | num threads / edge lines / crease limit / edge rise（#10-13） | `false` |
| 4 | Output | AccordionSection | file format / 保存先 / 背景透過 / clip plane / post-blend / pixel labels（#14-19） | `false` |
| 5 | Backend Options | AccordionSection（動的） | 選択中バックエンドの固有項目（POV-Ray: #21-27） | `false` |

- Image〜Output はバックエンド非依存（共通）。**Backend Options のみ §8 のバックエンド記述子 `optionGroups` から動的生成**する。
- バックエンドセレクタの選択肢が1個（POV-Ray のみ）の間も、将来の追加を見越してセレクタ自体は常設する。

### 2.3 振る舞いの注記（計画段階で明示、実装フェーズ1で詳細化）

- **単位変換**: `unit` 変更時、現在値を px 経由で新単位へ換算する（UXP `convImgSizeUnit` / `convPixToUnit` 相当）。`dpi` は in/mm/cm 換算に必要。
- **プリセット**: 選択で width / height / dpi を一括設定（UXP の `view` / `100x100@72dpi` / … 相当）。
- **radiosity 連動**: `radiosity mode` 変更時、ライト群の初期値をモードに応じて切り替える（UXP `setupLightDefault`）。
- **lightdefault 連動**: 「ライトデフォルト使用」ON の間、light spread / intensity / flash / ambient のスライダーを無効化する（UXP `setupDisableState`）。

---

## 3. レンダリング起動経路（論点3）

| 経路 | 挙動 | 確認ダイアログ |
|---|---|---|
| Toolbar の Render ボタン / メニュー | Inspector を `renderSettings` 対象で開き、BottomPanel の Render タブを表示。**実行はしない**（設定確認を促す） | なし |
| F12 ショートカット | 即座に実行（直近 Render Settings、なければ既定値）。BottomPanel の Render タブを前面化 | なし |
| BottomPanel / Render タブの Start ボタン | 即座に実行 | なし |
| 結果タブの "Re-render with these settings" | 結果タブが保持する `settingsSnapshot` を Render Settings に流し込み、即座に実行 | なし |

**原則**: 設定をいじってから実行したい経路（Toolbar）は Inspector を開く / 素早く回したい経路（F12・Start・Re-render）は即実行。停止・再実行が安価なため確認ダイアログは原則出さない。実行中に重複起動された場合は、進行中ジョブの存在を Render タブで明示し新規起動を抑止する。

---

## 4. 進捗表示の階層（論点4）

**原則: 概要は StatusBar、詳細は BottomPanel。**

| 表示先 | 表示内容 | 表示条件 |
|---|---|---|
| **StatusBar** | 「Rendering… 42%」相当の1行サマリ。`busy` 相当の表示も連動 | レンダリング中のみ。完了/キャンセルで消える |
| **BottomPanel / Render タブ** | 進捗バー（%）、フェーズ表示（exporting / running / blending）、バックエンド stdout ログ、経過時間、Start/Stop | 常時（タブ選択時） |

- `StatusBar` は `StatusBarProps` を拡張して対応（既存 `statusMessage` / `busy` の枠組みを利用）。
- ジョブ状態 (`RenderJob`) は単一の source of truth とし、StatusBar と Render タブはともにそれを参照する。

---

## 5. Render Result タブの仕様（論点5）

### 5.1 タブタイトル命名規則

`🎬 <SceneName> — <W>×<H> (<elapsed>s)`
例: `🎬 Scene1 — 1216×612 (15.2s)`。`TabData.title` に格納する。複数回レンダリングすると複数の結果タブが並ぶ。

### 5.2 画像ビューア

- 表示は静的画像（PNG）。**WebGL を使わない**ため、`MolViewPane` の OffscreenCanvas「一度だけマウント」制約とは無関係。
- 機能: Fit-to-View / 100% 表示 / ズームイン・ズームアウト（UXP の 10〜300% 相当のステップ）/ Pan（ドラッグ）。

### 5.3 ツールバーアクション

| アクション | 動作 |
|---|---|
| Save Image | `IPC.DIALOG_OBJECT_SAVE` でファイルダイアログを開き PNG 保存 |
| Copy to Clipboard | 画像をクリップボードへコピー（Electron `clipboard.writeImage`、main 側 IPC 経由） |
| Show Settings | `settingsSnapshot` をポップオーバー / パネルで表示 |
| Re-render | `settingsSnapshot` を Render Settings に流し込み再実行（§3） |
| Show Source Scene | `sourceSceneId` の MolView タブへ遷移（なければ復元） |

### 5.4 元シーン情報・設定スナップショット

- 結果タブは `RenderResult` を保持し、`sourceSceneId` + `sourceSceneName`（Show Source Scene 用）と `settingsSnapshot`（`RenderSettings` の deep copy、Show Settings / Re-render 用）を持つ。
- スナップショットはレンダリング開始時点の値を凍結する（その後 Render Settings を変更しても結果タブの記録は不変）。

---

## 6. 型定義と状態管理（論点6）

### 6.1 `InspectorTarget` の discriminated union 化

現状はフラット型 `{ sceneId; nodeId; nodeType: PropTargetType }`（`hooks/useInspectorState.ts`）。これを discriminated union へ再定義する:

```
type InspectorTarget =
  | { kind: 'renderer';       sceneId: number; nodeId: number }
  | { kind: 'object';         sceneId: number; nodeId: number }
  | { kind: 'scene';          sceneId: number; nodeId: number }
  | { kind: 'view';           sceneId: number; viewId: number }
  | { kind: 'renderSettings'; sceneId: number }
```

`renderSettings` はシーンツリーノードではないため `nodeId` を持たない。

### 6.2 Render Settings / Job / Result の型（要点）

```
type RenderBackendId = 'povray'   // 将来 'luxcore' | ... を追加

interface CommonRenderSettings {   // バックエンド非依存（Image/Camera/Quality/Output）
  width; height; unit; dpi; preset?; scale;
  projection: 'perspec' | 'ortho'; stereoMode: 'none'|'left'|'right'; stereoDepth;
  numThreads; edgeLines: boolean; creaseLimit; edgeRise;
  fileFormat; outputDir?; transparentBg: boolean; clipPlane: boolean;
  postBlend: boolean; pixelLabels: boolean;
}

interface PovraySettings {         // POV-Ray 固有
  radiosityMode: number;           // -1〜10
  shadow: boolean; lightDefault: boolean;
  lightSpread; lightIntensity; flashFraction; ambientFraction;
}

type BackendSettingsUnion = { backend: 'povray'; povray: PovraySettings }

interface RenderSettings {
  backend: RenderBackendId;
  common: CommonRenderSettings;
  backendOptions: BackendSettingsUnion;
}

interface RenderJob {
  jobId: string;
  backend: RenderBackendId;
  status: 'idle'|'exporting'|'running'|'blending'|'done'|'error'|'cancelled';
  progress: number;                // 0..100
  phase: string;
  log: string[];
  startedAt: number;
}

interface RenderResult {
  id: string;
  imageData: Uint8Array | string;  // PNG bytes または一時ファイルパス
  width: number; height: number;
  elapsedSec: number;
  sourceSceneId: number;
  sourceSceneName: string;
  settingsSnapshot: RenderSettings;
}
```

### 6.3 `TabData` の拡張

現状 `TabType = "welcome" | "settings" | "molview"`（`types.ts`）。これに `"renderResult"` を追加し、`TabData` に `renderResult?: RenderResult` を持たせる。`ContentPane.tsx` の `switch (tab.type)` に `case "renderResult": return <RenderResultPane .../>` を追加する。

### 6.4 custom hook

| hook | 役割 |
|---|---|
| `useRenderSettings(sceneId)`（新規） | Render Settings の編集状態を保持（非永続、シーン毎）。バックエンド切替時は `common` を保持しつつ `backendOptions` を §8 記述子の `defaultOptions` で差し替える。`{ settings, update, setBackend }` を返す |
| `useRenderJob()`（新規） | `renderStart` / `renderCancel` を呼び、進捗・完了イベントを購読。`{ job, start, cancel }` を返す |
| `useInspectorState`（変更） | `InspectorTarget` を union 化。`handleShowRenderSettings(sceneId)` を新設。`renderSettings` も `targetsBySceneRef`（シーン毎の前回ターゲット記憶）に乗せる |
| `useTabManager`（変更） | `addRenderResultTab(result: RenderResult)` を追加 |
| `useLayoutPersistence` | **変更不要**（BottomPanel Render タブ高さは `centerSizes`、結果タブは ContentArea 既存機構に乗る） |

### 6.5 主要コンポーネント（props 概形）

| コンポーネント | 配置 | props 概形 |
|---|---|---|
| `RenderSettingsEditor` | InspectorPanel 内 | `{ settings: RenderSettings; onChange; onBackendChange }` |
| `BackendOptionGroups` | RenderSettingsEditor 内 | `{ backend: RenderBackendId; options; onChange }`（§8 記述子から描画） |
| `RenderPanel` | BottomPanel タブ | `{ job: RenderJob | null; onStart; onCancel }` |
| `RenderResultPane` | ContentPane | `{ result: RenderResult; onReRender; onShowSource }` |
| `RenderImageViewer` | RenderResultPane 内 | `{ imageData; width; height }`（ズーム/Fit/Pan） |

---

## 7. IPC / バックエンド連携の境界（論点7）

### 7.1 重要な前提

外部プロセス実行は libcuemol2 の `ProcessManager` 再利用で完結する。**Electron main process での新規プロセス spawn 機構は不要**。`povrender.js` と同じ経路（StreamManager → ProcessManager → ポーリング）を tritium の Web Worker から踏む。

### 7.2 API 形

レンダリングパイプラインは **Web Worker 内で完結**する（`ProcessManager` / `StreamManager` は C++ サービスで worker からアクセス可能）。

| 境界 | API 形 | 追加先 |
|---|---|---|
| renderer → worker | `renderStart(settings: RenderSettings) => { jobId }` | `ServiceMap`（`worker/shared/calls/`） |
| renderer → worker | `renderCancel(jobId: string) => { ok: boolean }` | `ServiceMap` |
| worker → renderer | `onRenderProgress(cb)` — `{ jobId; progress; phase; logChunk? }` | worker→renderer イベント転送機構 |
| worker → renderer | `onRenderComplete(cb)` — `{ jobId; result: RenderResult } \| { jobId; error: string }` | worker→renderer イベント転送機構 |

### 7.3 worker 側パイプライン

`renderStart` サービスは: ① `StreamManager` で .pov/.inc を出力 → ② `ProcessManager.queueTask` でタスク投入 → ③ `jobId` を即返却。その後 worker 内で `setInterval` ポーリング（`povrender.js` の 1 秒タイマー相当）し、`getTaskStatus` / `getResultOutput` でフェーズ・%・ログを取得して renderer へ進捗イベントを送出。全タスク done で完了イベントを送出する。

進捗・完了イベントの送出経路は既存の worker→renderer イベント転送機構（C++ scene event の購読経路）に乗せる。**具体的な hook 名・チャネルは実装フェーズ4着手時に確認する**（§10 未解決事項）。

### 7.4 型契約マップへの追加（CLAUDE.md 準拠）

追加の起点は `worker/shared/calls/` の `ServiceMap` 行 → `commands/CommandMap.ts` + `commands/ids.ts`。SettingsPane のパス保存に IPC 永続化を使う場合のみ `shared/ipcChannels.ts` + `shared/ipcContract.ts` にも行追加する。

---

## 8. レンダリングバックエンドの抽象化（追加要件）

将来 POV-Ray 以外のバックエンドを追加・切り替え可能にする。**設計目標: バックエンド追加 = 記述子1個 + worker 実装1個 + registry 登録の4ステップで完了し、Inspector / BottomPanel / 結果タブの構造は不変。**

### 8.1 フロント側 — バックエンド記述子レジストリ

```
interface RenderBackendDescriptor {
  id: RenderBackendId;
  label: string;                 // Backend セレクタ表示名
  defaultOptions: BackendSettingsUnion;
  optionGroups: PropGroupDef[];   // Inspector の Backend Options を駆動する宣言データ
}                                 // PropGroupDef は既存 PROPERTY_GROUPS/PropDef と同形式

const RENDER_BACKENDS: Record<RenderBackendId, RenderBackendDescriptor>
```

- 1ファイル（例 `data/renderBackends.ts`）に集約する。
- Inspector の Backend Options グループは「選択中バックエンドの `optionGroups`」を描画するだけ。共通グループ（Image〜Output）はバックエンド非依存で常に同一。
- Backend セレクタの選択肢は `RENDER_BACKENDS` のキーから生成する。

### 8.2 worker 側 — バックエンド実行インターフェース

```
interface RenderBackend {
  id: RenderBackendId;
  exportScene(ctx, scene, settings): ExportedInput;      // StreamManager で入力ファイル生成
  buildTasks(input: ExportedInput, settings): TaskSpec[]; // ProcessManager.queueTask 用引数列
  parseProgress(stdout: string): number;                  // stdout → 進捗 %
  collectResult(input, tasks): { imagePath; width; height };
}
```

- `PovrayBackend` がこれを実装する（`povrender.js` のロジックを移植）。
- `renderStart` サービスは `settings.backend` で registry から `RenderBackend` 実装を引き、パイプライン（export → queueTask → ポーリング → complete）を**バックエンド非依存に**駆動する。

### 8.3 新バックエンド追加の手順

1. `RenderBackendId` の union に ID を追加。
2. フロントの `RENDER_BACKENDS` に `RenderBackendDescriptor` を追加。
3. worker の `RenderBackend` 実装を追加。
4. worker 側 registry に実装を登録。

---

## 9. 実装フェーズ分割（step-by-step 動作確認前提）

**進め方の原則**: 各フェーズは単独で動作確認可能な単位とし、フェーズ末で必ず**ユーザーレビュー checkpoint** を置く。レビュー通過まで次フェーズに着手しない。共通の型検証として各フェーズ末に `cd tritium/react-gui && npm test` と `npx tsc -p tsconfig.web.json --noEmit` を実行する。

### フェーズ1 — Inspector に Render Settings 対象を追加

- **内容**: `InspectorTarget` の union 化、`renderSettings` 対象、`RenderSettingsEditor`（§2 アコーディオン + Backend セレクタ）、バックエンド記述子レジストリ（§8 フロント側）、Toolbar の Render ボタン、`useRenderSettings`。データは mock。
- **着手前（degrade 検出）**: `InspectorTarget` union 化は既存 renderer/object/scene/view Inspector に影響する構造変更。先に `__test__/` に既存 Inspector の観測契約（ターゲット切替時の挙動・`targetsBySceneRef` 復元）を pin するテストを追加する。
- **動作確認手順**: `npm run dev` 起動 → Toolbar の Render ボタンで Inspector が `renderSettings` で開く → 全アコーディオンの展開/折畳、Backend セレクタ切替で Backend Options グループが入れ替わる → 既存ノードを選び renderer/scene/view Inspector が従来どおり動く。
- **完了条件**: Render Settings が mock 値で全グループ編集でき、既存 Inspector に degrade なし（pin テスト緑、`npm test` / `tsc` 緑）。
- ✅ **ユーザーレビュー checkpoint**

### フェーズ2 — BottomPanel に Render タブを追加（mock ジョブ）

- **内容**: `BottomTabType` に `"render"`、`RenderPanel`、Start/Stop ボタン、進捗バー、ログ表示、`useRenderJob`（タイマー駆動 mock）、StatusBar 連動。
- **動作確認手順**: BottomPanel の Render タブ → Start で mock 進捗が 0→100% 進行、StatusBar に「Rendering… N%」、Stop でキャンセル、ログ行が増える。
- **完了条件**: mock ジョブで進捗・停止・StatusBar 連動・フェーズ表示が動作（`npm test` / `tsc` 緑）。
- ✅ **ユーザーレビュー checkpoint**

### フェーズ3 — ContentArea に Render Result タブを追加（mock 画像）

- **内容**: `TabType` に `"renderResult"`、`RenderResultPane`、`RenderImageViewer`（ズーム/Fit/100%/Pan）、ツールバー、Re-render、`useTabManager.addRenderResultTab`。
- **動作確認手順**: mock 完了で結果タブが開く → タイトル命名規則を確認、ズーム/Fit/Pan、Re-render で再実行、Show Source Scene で元 MolView タブへ遷移。既存 molview/settings タブに degrade なし。
- **完了条件**: mock 画像で結果タブ一式（ビューア・ツールバー・Re-render）が動作（`npm test` / `tsc` 緑）。
- ✅ **ユーザーレビュー checkpoint**

### フェーズ4 — worker サービス + バックエンド実装の結線

- **内容**: `renderStart` / `renderCancel`（`ServiceMap`）、`RenderBackend` インターフェース（§8 worker 側）、`PovrayBackend`（`povrender.js` 移植）、`StreamManager` / `ProcessManager` 経由の実行、worker→renderer 進捗/完了イベント結線。
- **着手前**: §10 未解決事項（worker→renderer イベント機構、`tritium/core` の wrapper 生成状況）を調査して確定する。
- **動作確認手順**: `cd build_scripts && task build_tritium` → `task run_tritium` → 実シーンを単レイヤー設定でレンダリング → 実 POV-Ray 出力画像が結果タブに表示、進捗が実 stdout 由来で更新。
- **完了条件**: 実 POV-Ray で単レイヤーレンダリングが端から端まで動作（mock を実装に差し替え完了）。
- ✅ **ユーザーレビュー checkpoint**

### フェーズ5 — post-blend / エラー処理 / SettingsPane 仕上げ

- **内容**: blendpng レイヤー合成、stdout 進捗パース精緻化、エラーハンドリング（パス未設定・プロセス失敗）、SettingsPane の exe/inc/blendpng パス設定 UI。
- **動作確認手順**: post-blend を要するシーンでレンダリング、パス未設定時のエラー表示、SettingsPane でパス変更が反映。
- **完了条件**: UXP `render-pov` と機能 parity。`docs/migration/mapping/` の `dialog.tool.render-pov` を `done` 相当へ更新できる状態。
- ✅ **最終ユーザーレビュー checkpoint**

---

## 10. アーキテクチャ制約 / 未解決事項

### 10.1 遵守するアーキテクチャ制約

- **`useLayoutPersistence`**: 新規キーは不要。BottomPanel の Render タブ高さは既存 `centerSizes`、結果タブは ContentArea 既存機構で扱う。
- **Allotment ネスト構成**: `App.tsx` の3段 Allotment（main / right / center）には手を入れない。
- **Inspector 表示制御**: `inspectorOpen` フラグと `targetsBySceneRef`（シーン毎の前回ターゲット記憶）を尊重し、`renderSettings` もこの記憶機構に乗せる。Inspector ヘッダーには対象種別バッジを表示する。
- **MolViewPane の OffscreenCanvas 制約**: `canvas.transferControlToOffscreen()` は一度のみ実行可能。Render Result タブは静的画像のみで WebGL を使わないため本制約は無関係。`ContentPane.tsx` の `switch (tab.type)` に `renderResult` を正しく追加すること。

### 10.2 未解決事項（実装フェーズ着手時に確認・要ユーザー判断）

- worker→renderer の進捗イベント転送に使う既存機構（hook 名・チャネル）の特定 — フェーズ4着手時に `worker/server` と event 転送経路を調査する。
- tritium/core の自動生成 wrapper（`tritium/core/src/wrappers/`）に `ProcessManager` / `StreamManager` が含まれるか — フェーズ4着手時に確認する。
- `src/modules/rendering` の `.qif` インターフェースが tritium wrapper に生成済みか。
- post-blend 用 `blendpng` バイナリの同梱・配布方法。
- **アニメ連番レンダリング**（UXP `anim-render-dlg`: 出力ディレクトリ・連番ファイル・FFmpeg ムービー化）は本計画のスコープ外。将来 Render Settings に「フレーム範囲」グループを追加する拡張余地として記録する。

---

## 参照する既存ファイル

| ファイル | 用途 |
|---|---|
| `tritium/react-gui/src/renderer/App.tsx` | 3段 Allotment 構成 |
| `.../hooks/useInspectorState.ts` | `InspectorTarget`、`targetsBySceneRef` |
| `.../components/panels/InspectorPanel.tsx` | Inspector ヘッダー・モード |
| `.../components/inspector/PropertiesTab.tsx` / `AccordionSection.tsx` | アコーディオングルーピング |
| `.../components/panels/BottomPanel.tsx` | `BottomTabType`、`TabButton` |
| `.../components/ContentArea.tsx` / `panes/ContentPane.tsx` / `types.ts` | `TabData` / `TabType` |
| `.../hooks/useTabManager.ts` / `useLayoutPersistence.ts` | タブ管理・レイアウト永続化 |
| `.../worker/shared/calls/` | `ServiceMap` |
| `.../commands/CommandMap.ts` / `commands/ids.ts` | コマンド契約 |
| `.../worker/server/services/*.service.ts` | service 実装パターン |
| `src/modules/rendering/` | `PovSceneExporter` ほか |
| `ProcessManager` / `StreamManager` の `.qif` | バックエンド API |
| `uxp_gui/cuemol2/components/jsmods/cuemol2ui-lib/povrender.js` | 実行パイプライン移植元 |
| `uxp_gui/cuemol2/base/content/tools/render-pov-dlg.xul` / `.js` | UI 移植元 |
| `docs/migration/uxp-inventory/tool_dlgs.md` / `mapping/_index.md` / `option-ux-guidelines.md` | 移行管理 |
