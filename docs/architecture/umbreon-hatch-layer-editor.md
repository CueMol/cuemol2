# umbreon (NPR) hatch layer editor と shading knob

tritium の Rendering window (Umbreon (NPR) backend) で、hatch style をテンプレートとして
読み込み、layer 構成 (本数・角度・pitch・太さ/径・randomness) と shading (tone → インク量) を
編集してレンダーする仕組みの設計記録。UXP に無かった新規機能 (migration ではない)。

umbreon 側の変更 (dotScale / 確率的 Stipple / 被覆→半径テーブル / auto fade /
`ToneRecipe::strength, curve` / spec テキスト API) は
`~/proj64/umbreon/docs/plans/npr-hatch-mark-geometry.md` を参照。

## 背景

- GUI の `Mark width` が網点系 style で効かなかった (umbreon の `widthPx` は Line 専用で、
  Dot の半径は pitch と tone だけから決まっていた)。
- stipple は中間調で薄すぎ、screentone の反転域は被覆が 50% で平坦になる、richardson 以外の
  style は平坦な既定 tone recipe のまま、と「default が薄い / 調整できない」要因が重なっていた。
- ユーザー要件: マーク形状は tone から独立させ、被覆による暗さは照光の明るさに連続に相関させ、
  richardson 相当を layer の編集で自作できるようにする。

## 決定事項

| 項目 | 決定 |
|---|---|
| Style = テンプレート | Render タブの Style を選ぶと C++ (`UmbreonSceneExporter.getHatchStyleSpec`) が解決した look/preset を spec テキストで受け取り、parse して編集状態にする。Style を切り替えると編集は確認なしで破棄 (window-local・非永続、"Edited" バッジで補う) |
| 置き場所 | Render settings pane の **"Detail" タブ** (Image / Render と並ぶ第 3 タブ、umbreon_npr のときだけ出る。Render タブの Hatching グループが既に hatching の preset 設定なので "Hatching" とは呼ばない)。Render タブの Hatching グループには preset 系 (Style / Coloring / Mark density / Mark width / 色 / 輪郭) だけを残す |
| 効かない設定 | layer 種別で無意味なフィールドは**非表示** (kinds フィルタ: Line の width / stroke 系、Dot の dotscale / shape、Stipple では subdiv / invert 無し)。他の値で無効になるものは **disabled** (`layerFieldEnabled` / `toneFieldEnabled` / `inkFieldEnabled`: 例 slen=0 で stroke gap/taper、rim=0 で rimpow/rimbias、hl>=1 で hlsoft、AO off で contact/shape AO、base が paper で albedoquant、円ドットの dotangle、乱数なしの seed)。spacing×ss が最小 pitch 2 px を下回る layer には「clamped (raise Supersampling)」のヒント |
| dirty-or-nothing | snapshot には編集内容が template と異なるときだけ `hatch: { layersSpec, toneSpec }` (文字列 2 本) を載せる。未編集なら C++ の従来経路と bit 同一 |
| 適用順 (C++) | `applyHatchStyle(style)` → `hatchLayersSpec` (layer 全置換) → `hatchToneSpec` (tone/ink キー上書き) → strength/curve 乗算 → density / width (Line=widthPx, Dot・Stipple=dotScale) → Coloring / 色の明示指定 (spec より優先) |
| Mark density / Mark width | Render タブのままマスター乗数として残す (全 layer に一律、可逆)。Hatching タブは基準値を編集し、乗数が 1 でないときは注記と各 layer の spacing / width / dot scale の**実効値**を表示する。layer 値へ焼き込まない (往復の丸め誤差で Edited 扱いになるのを避ける) |
| Shading の一次コントロール | `Strength` (被覆ゲイン) と `Curve` (中間調の寄せ方) の 2 knob のみ常時表示。他の tone recipe と ink 系は Advanced に折りたたみ |
| 太らせすぎの黒潰れ | 許容 (レンジは tone 精度で縛らない: width / dotscale 0.1-8) |
| spec の型 | `data/hatchSpec.ts` のフィールドテーブル 1 枚で parse / format / 既定値 / UI レンジを駆動。レコードのフィールド名 = spec キー。未知キーは `extra` で温存 |

## データフロー

```
Render window (renderer)                      main                      Main window (renderer)        worker (C++)
useHatchTemplate --RENDER_HATCH_STYLE_GET--> renderWindowIpc --REQUEST(push)--> useRenderWindowBridge --invokeService--> hatchStyleSpec.service
   <-- HatchStyleSpecReply <-- (reqId) <-------- REPLY(invoke) <----------------------------------- getHatchStyleSpec(name)
parseHatchSpec -> useRenderSettings.applyHatchTemplate (stale style は無視)
編集 -> getSnapshot().hatch -> RENDER_WINDOW_COMMAND -> UmbreonBackend.makeExporter -> exporter.hatchLayersSpec / hatchToneSpec
```

Rendering window は別 BrowserWindow で worker を持たないため、`RENDER_VIEW_CAMERA_*` と同型の
相関 ID ラウンドトリップを 1 組追加した (timeout は `{ ok: false, error: "timeout" }`)。

## 契約行

| マップ | 行 |
|---|---|
| `worker/shared/WorkerCalls.ts` `ServiceMap` | `getHatchStyleSpec: { args: GetHatchStyleSpecArgs; result: GetHatchStyleSpecResult }` |
| `shared/ipcChannels.ts` | `RENDER_HATCH_STYLE_GET` (invoke) / `RENDER_HATCH_STYLE_REQUEST` (push) / `RENDER_HATCH_STYLE_REPLY` (invoke) |
| `shared/ipcContract.ts` | `InvokeChannels` に GET / REPLY、`PushChannels` に REQUEST |
| `shared/ipcTypes.ts` | `HatchStyleSpecReply`、`RenderSettingsSnapshotWire.hatch?` |
| `data/renderResult.ts` | `RenderSettingsSnapshot.hatch?: RenderHatchSnapshot` |
| `.qif` (`UmbreonSceneExporter`) | `hatchLayersSpec` / `hatchToneSpec` / `hatchToneStrength` / `hatchToneCurve` / `getHatchStyleSpec(name)` |

## UI 構成 (form-kit のみ、consumer でサイズ指定しない)

```
RenderSettingsPane: [Image] [Render] [Detail]   (Detail は hatch prop があるときだけ)
└ Detail タブ = HatchLookEditor    .hatch-look
   ├ caption "Style template: <name>" / status caption (loading / error)
   ├ ButtonRow: FormButton "Reset to style" (dirty のときだけ有効) + "Edited"
   ├ HatchLayersSection = FieldSection "Layers" (titleActions: +Line / +Dot)
   │   └ HatchLayerRow x N (React.memo, key = layer.id)
   │       ├ .h3-list-row ヘッダ (Layer n -- kind, duplicate, trash)
   │       ├ Field "Kind" > SelectField (line / dot / stipple)
   │       ├ SliderField: angle / spacing / width | dot scale / tone high / tone low / fade / opacity / ink darkness
   │       └ AccordionSection "Randomness / Advanced": jitter / wobble / ... / shape / aspect / invert (kind でフィルタ)
   └ HatchShadingSection = FieldSection "Shading"
       ├ SliderField Strength / Curve
       └ AccordionSection "Advanced": ambient / wrap / rim ... / ink shade / min contrast / tone fog / fill posterize
```

`hooks/useRenderSettings.ts` が `HatchEditState { style, template, spec }` と操作
(`applyHatchTemplate` / `updateHatchLayer` / `addHatchLayer` / `removeHatchLayer` /
`duplicateHatchLayer` / `updateHatchTone` / `updateHatchInk` / `resetHatchToTemplate`) を持ち、
`hooks/useHatchTemplate.ts` が非同期のテンプレート取得を担う (`useRenderSettings` は同期 API のみ)。

## 制約と今後

- 編集値は Rendering window 内の状態で非永続。名前付き custom style として保存・一覧に並べる
  機能は後続タスク (spec がテキストなのでそのまま保存できる)。
- layer の並べ替え (drag) は未実装 (duplicate + remove で代替)。
- Style 変更時の確認ダイアログを足す場合は `RenderWindowApp` 側で `onChange` を包み
  `settings.hatchDirty` を見るだけで済む (hook API は不変)。
- preset ごとの tone recipe 既定値は umbreon 側 `hatchPresetTone` で目視調整中。
