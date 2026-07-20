# PR 2: Movie (animation) rendering — Rendering window の Still/Animation モード

- 対象: `tritium/react-gui/`
- 関連: [ADR-0040](../migration/adr/ADR-0040-animation-rendering.md) decision (1)、
  [ADR-0035](../migration/adr/ADR-0035-render-window.md) (拡張対象の window)、
  [ADR-0017](../migration/adr/ADR-0017-povray-rendering-ui.md) (拡張対象の worker pipeline)
- 前提: [PR 1](260720-animmgr-state-restore-plan.md) (`AnimMgr` の状態復元) がマージ済みであること
- 移植元: `uxp_gui/cuemol2/base/content/anim/anim-render-dlg.{xul,js}`

## 1. スコープ

既存の Rendering window に **Still / Animation のモード切替**を追加し、Animation モードで
フレーム連番レンダリング + ffmpeg エンコードを行う。新規メニュー項目・新規 `CmdId` は作らない
(`shared/menuTemplate.ts:116-118` の既定路線)。

**含まない** (ADR-0040 で決定済み): scene duplication、rendering 中の target scene ロック、
再生中のユーザー編集制御、morph animation 生成ツール (`dialog.tool.morphanim-tool` は別 workstream)。

## 2. 既存資産と不足分

| 層 | 現状 | 必要な変更 |
|---|---|---|
| Rendering window | modeless child BrowserWindow、job は window を閉じても継続 | モード切替 UI の追加 |
| `AnimMgr` TS wrapper | `setupRender` / `writeFrame` / `stop` / `goTime` / `frameno` / `startcam` **すべて露出済み** (`core/src/wrappers/AnimMgr.ts:119-137` 他) | なし |
| `animation.service.ts` | `play` / `pause` / `stop` / `goTime` / `setLoop` | `setupRender`/`writeFrame` を叩く経路は `renderJob` 側に新設 |
| `renderJob.service.ts` | 単一フレーム。`RenderJobEntry` は `outputPath` 1 本、phase は `render`→`finalize` の 2 段 | フレームループで包む |
| `RenderBackend` | `outputImagePath(exported)` が単一パス | フレーム番号を受け取る形へ |
| `RenderStartArgs` | `{ sceneId, viewId?, snapshot, binaries }` | mode + animation 設定 |
| `RenderUpdate` | `progress` / `complete` (`imageDataUrl` 必須) / `error` | フレーム進捗と movie 完了 |
| `RenderResult` | `imageDataUrl` 必須の単一画像 | movie 結果の表現 |
| `RenderBinaries` | `povrayExe` / `povrayInc` / `blendpng` | `ffmpeg` を追加 |
| ffmpeg バイナリ | `bundle_apps/ffmpeg` に**同梱済み** (`packaging/collect-cuemol2-runtime.sh:185-191`、"future wiring") | `getRenderBinaries()` (`main/ipcHandlers.ts:91-108`) での解決 + Settings 行 |
| `SegmentField` | `h3-kit/form/SegmentField.tsx` に**存在** | Still/Animation 切替に使用 |

## 3. 設計

### 3.1 モードは snapshot に持たせる

`RenderSettingsSnapshot` (`data/renderResult.ts:23-27`) に `mode` を追加する。
snapshot は結果に保存され Re-render で `restore()` されるので、モードも一緒に凍結されるのが一貫する。

```ts
export type RenderMode = "still" | "animation";

export interface RenderSettingsSnapshot {
  mode: RenderMode;              // 追加
  backend: RenderBackendId;
  commonProps: PropDef[];
  backendProps: PropDef[];
  animation?: AnimationRenderProps;   // mode === "animation" のときのみ
}

export interface AnimationRenderProps {
  outputDir: string;
  baseName: string;
  fps: number;
  /** 出力するフレーム範囲。省略時は全体 (0 .. AnimMgr.length) */
  startMs?: number;
  endMs?: number;
  /** 最終フレームを含めるか (UXP の "Loop" チェックに相当) */
  dupLastFrame: boolean;
  /** ffmpeg エンコードを行うか。false なら PNG 連番のみ */
  makeMovie: boolean;
  movieFormat: MovieFormatId;    // mov_h264 / mov_h265 / mp4_h264 / mp4_h265 / wmv2 / gifanim
  bitrateKbps: number;
}
```

既存の `commonProps` / `backendProps` (画像サイズ・POV-Ray オプション) は **Still と Animation で共通**。
UXP も Main options タブと Render options タブを両モードで共有していた。

### 3.2 フレームループは逐次で回す

`RenderJobEntry` にフレーム状態を足し、既存の `render`→`finalize` の 2 段遷移を
**1 フレーム分の内部サイクル**として扱う。

```ts
interface RenderJobEntry {
  // ... 既存フィールド ...
  mode: RenderMode;
  anim?: {
    frameCount: number;
    currFrame: number;
    outputDir: string;
    baseName: string;
    framePaths: string[];        // ffmpeg 入力の検証用
    encodeSpec: RenderTaskSpec | null;
  };
}
```

poll tick で「現フレームの全 task 完了」を検知したら、次フレームの
`writeFrame` → `buildTasks` → `queueTask` を投げる。全フレーム完了後に ffmpeg task を 1 本 queue する。

**逐次にする理由**: UXP は `procMgr.setSlotSize(ncpu)` でプロセス並列にし、POV-Ray 自体は
1 スレッド (`nThreads = 1`, `anim-render-dlg.js:232`) にしていた。tritium の既存 Still 経路は
逆に POV-Ray のマルチスレッドを使う。初版は既存 Still 経路と同じ設定のまま逐次で回して
実装を単純に保ち、**プロセス並列化は follow-up** とする (§7 に記録)。

**ProcessManager の制約** (ADR-0017:72-76) はフレームごとに効く: `LProcMgr` は `queueTask`
呼び出し時にしかキューを進めず、`getResultOutput` が終了 task の slot を解放する唯一の手段。
既存 `pollJob` の 2 フェーズ実装がそのまま各フレームに適用できるはず。

### 3.3 AnimMgr の駆動

`renderStart` (animation モード) の手順:

1. `scene.getAnimMgr()`。`size <= 0` なら early error
2. **元シーンの現カメラを名前付き Camera として確保し `am.startcam` に設定**
   — `startImpl` は `startcam` も target view も無いとデフォルトカメラを黙って使う
   (`AnimMgr.cpp:76-81`)。Still 経路の `scene.saveViewToCam(viewId, "__current")`
   (`renderJob.service.ts:367-377`) と同じ手を使い、`startcam = "__current"` を設定する
3. `am.setupRender(tvStart, tvEnd, fps)` → フレーム数
4. 各フレーム: exporter を用意 → `am.writeFrame(exporter)` → POV-Ray task を queue
5. 全フレーム完了 → ffmpeg task
6. **完了時・キャンセル時・エラー時のいずれでも `am.stop()` を呼ぶ** (PR 1 の復元がここで効く)

**exporter の width/height を必ず明示設定する** — `PovSceneExporter` は view も height も
無いと `fac = zoom/(height*1.5)` で 0 除算する (`:131-142`)。UXP はここを渡していない
(`anim-render-dlg.js:206-207,242-243` は POV-Ray の `-W/-H` にしか渡していない)。
既存 `PovrayBackend.exportScene` が `pixelImageSize(common)` を使っているので、
同じ値を exporter にも設定する。

### 3.4 進捗と結果

`RenderUpdatePhase` に `"encoding"` を追加。`progress` update にフレーム情報を足す:

```ts
| { type: "progress"; jobId: string; progress: number; phase: RenderUpdatePhase;
    frameIndex?: number; frameCount?: number; logChunk?: string }
```

全体進捗は `(frameIndex + frameProgress) / frameCount * 100`。

完了は **movie 専用の variant** を足す (数百 MB を data URL で送らない):

```ts
| { type: "completeMovie"; jobId: string; moviePath: string | null;
    frameDir: string; frameCount: number; elapsedSec: number;
    /** 最終フレームのプレビュー (既存の画像転送と同じ 1 回きりの data URL) */
    previewDataUrl?: string; width: number; height: number }
```

`RenderResult` も `kind: "still" | "movie"` で分岐させる。movie の場合 `imageDataUrl` は
プレビュー用の 1 枚 (任意) とし、`moviePath` / `frameDir` / `frameCount` を持つ。

### 3.5 UI

- **モード切替**: `RenderPanel` 上部に `SegmentField` で Still / Animation
  (`h3-kit/form/SegmentField.tsx`)。Animation で anim が空のシーンが target のときは
  Start を disable し理由を表示
- **設定**: `RenderSettingsEditor` に Animation モードでのみ出るグループを 2 つ追加
  - *Frame range*: 出力ディレクトリ (フォルダ選択)、ベース名、fps、範囲、最終フレーム重複
  - *Movie*: Make movie トグル、フォーマット、ビットレート
  - サイズ・POV-Ray グループは両モード共通のまま
- **結果表示**: `RenderResultPane` は movie のときプレビュー画像 + 出力先パス +
  「Reveal in Finder / Explorer」。Save / Copy は still のときのみ表示
  (`onOpenSettings` が optional である前例と同じ扱い)
- **出力ディレクトリ選択**: main 側の file dialog をフォルダ選択モードで使う経路が
  既にあるか要確認 (§5-3)

## 4. Phase 分割

| Phase | 内容 | 完了条件 |
|---|---|---|
| **1** | 型拡張 (`mode` / `AnimationRenderProps` / `RenderUpdate` / `RenderResult` / `RenderBinaries`)、モード切替 UI、設定グループ、フレームループ、**PNG 連番出力まで** | Animation モードで N 枚の PNG が出力ディレクトリに出る。ffmpeg は未配線 |
| **2** | ffmpeg 配線 (`getRenderBinaries()` + Settings 行 + `MovieFormatId` ごとの引数生成)、encode task、`completeMovie` | 動画ファイルが生成され再生できる |
| **3** | 結果表示の仕上げ (プレビュー・Reveal)、キャンセル時の中間ファイル後始末、進捗の精度 | UXP と同等の操作感 |

UXP の Preview タブ (フレームスライダーによる出力画像のプレビュー) と Re-encode ボタンは
**初版では移植しない**。Phase 3 で必要性を判断する (§7)。

## 5. 実装前に確認すること

1. **`RenderResult` / `useRenderWindowBridge` の `latestResultRef` が 1 件保持**
   (ADR-0035:85-86) である前提が movie でも妥当か。動画は再生成コストが大きいので
   履歴を持ちたくなるが、初版は既存どおり 1 件で通す
2. **`SceneExporter` の使い回し** — UXP は全フレームで同じ exporter を使い回していた
   (`anim-render-dlg.js`)。tritium でフレームごとに `createHandler` し直すか使い回すかを決める。
   使い回す場合、内部状態 (blendTable) の持ち越しに注意
3. **フォルダ選択ダイアログの既存経路** — `main/` の file dialog に
   `properties: ['openDirectory']` モードがあるか。無ければ IPC 追加
4. **`ProcessManager` の slot 設定** — 既存 Still 経路は `pm.setSlotSize(renderSpecs.length)`
   (`renderJob.service.ts:407-409`)。フレームループで毎フレーム呼ぶのが安全か、1 回でよいか
5. **`blendTable` がフレームごとに変わりうるか** — 半透明レイヤの構成がアニメで変化すると
   レイヤ数が変わり、task 構成も変わる。`PovrayBackend.computeLayers` (`:65-87`) の入力が
   フレームごとに変わる前提で組む
6. **キャンセル時の `am.stop()`** — `renderCancel` (`:452-485`) の外部プロセス経路に
   `am.stop()` を足す。in-process (umbreon) 経路で animation を許すかも決める
   (初版は **POV-Ray のみ**に絞るのが安全 — umbreon は `attach`〜`detach` 間ライブ Scene 参照を
   保持するため、フレームごとの attach/detach と噛み合うか未検証)
7. **`animation.service.ts` との競合** — UI から play 中に render を start した場合の扱い。
   同じ `AnimMgr` を両方が触るので、少なくとも start 時に再生中なら停止する

## 6. テスト

Vitest (`react-gui/src/renderer/__test__/`)。既存の
`renderJobInProcess.test.ts` / `useRenderJob.test.ts` / `renderPanel.test.tsx` に倣う。

| # | 検証する契約 |
|---|---|
| 1 | `renderStart` (animation) が `setupRender` → フレーム数分の `writeFrame` を呼び、完了時に `stop()` を呼ぶ (wrapper setter/method spy) |
| 2 | キャンセル時にも `stop()` が呼ばれ、中間ディレクトリが片付く |
| 3 | `RenderUpdate` の `frameIndex`/`frameCount` が単調に進み、全体進捗が 0..100 に収まる |
| 4 | `makeMovie: false` で ffmpeg task が queue されない |
| 5 | mode 切替で `RenderSettingsEditor` の Animation グループが出/消えする |
| 6 | anim が空のシーンで Start が disable される |

1 と 2 が核。`AnimMgr` は wrapper をプレーンオブジェクトでモックし、
`setupRender`/`writeFrame`/`stop` の呼び出し順を pin する
(tritium/CLAUDE.md の「Worker-service tests with wrapper setter spying」パターン)。

**E2E 検証チェーン** (root CLAUDE.md): Vitest → `tsc -p tsconfig.web.json --noEmit` →
`task build_tritium` → `task run_tritium` で実際にアニメを 10 フレーム程度レンダリングし、
出力とシーン状態の復帰を目視確認する。

## 7. 先送りする項目 (ADR-0040 の Consequences に反映する)

- **プロセス並列レンダリング** — UXP の `setSlotSize(ncpu)` 相当。長尺で効くが、
  ProcessManager の slot 管理と進捗集計が複雑になる
- **Preview タブ** (出力済みフレームのスライダー閲覧) と **Re-encode ボタン**
- **umbreon backend での animation** — 初版は POV-Ray のみ
- **結果履歴** — 現行どおり最新 1 件
- **設定の永続化** — 現行の Still と同じく window ローカルで、閉じるとリセット
  (`useRenderSettings.ts:11`)。ただし**出力ディレクトリとベース名は毎回入れ直すのが苦痛**なので、
  `option-ux-guidelines.md:117-122` の「one-shot 操作は last-used settings を永続化」に従い
  この 2 つだけ electron-store に持たせることを Phase 3 で検討する

## 8. 完了後の更新

- `docs/migration/mapping/other_dlgs.md` の `dialog.anim-render` 行: status を `done` に、
  React 列に実装ファイル群を記入
- `docs/migration/mapping/menus.md` の `menu.cuemol2.rendering` (現在 wip / 2 wired):
  Animation rendering が render window に統合された旨と counts を更新
- `docs/migration/mapping/_index.md` の counts と In Progress リスト
- ADR-0040 の Status を `accepted` に
