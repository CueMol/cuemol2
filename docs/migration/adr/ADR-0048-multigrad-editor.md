# ADR-0048: Multi-gradient color editor (Illustrator-like redesign)

- Status: accepted (host E2E verified)
- Date: 2026-08-11
- Mapping rows: [`dialog.tool.multigrad-editor`](../mapping/tool_dlgs.md#dialogtoolmultigrad-editor), [`panel.coloring.deck.multigrad`](../mapping/panels.md#panelcoloringdeckmultigrad), [`panel.coloring.shell`](../mapping/panels.md#panelcoloringshell), [`panel.densitymap`](../mapping/panels.md#paneldensitymap)

## Context

UXP の multi-gradient editor (`uxp_gui/.../tools/multigrad_editor.{xul,js}`)
は、map 系 scalar object (DensityMap / ElePotMap) で renderer を着色する際の
gradient 編集**モーダルダイアログ**。histogram + gradient preview はあるが
stop (tick) の編集は listbox ベースで、値の直接入力でしか動かせず、
Preview / OK / Cancel の 3 ボタン運用だった。

tritium への移植にあたり、モーダルを廃して **Illustrator の gradient editor
風の直接操作 UI** (bar 下の stop marker をドラッグで移動、空白クリックで追
加、下方向ドラッグで削除、選択 stop の値/色編集) に再設計し、ColorPane の
multigrad deck と DensityMapPane への **inline 埋め込み (非モーダル・live
編集)** とした。1 操作 = 1 undo step。

write path の制約: C++ `MultiGradient` は `copyFrom()` だけが PROPCHG イベ
ント発火 + undo 記録 (`UndoUtil` + `MultiGradEditInfo` + `MultiGradEvent`,
`src/qsys/MultiGradient.cpp`) を行い、`insert/removeAt/changeAt/clear` は
silent。txn 外 copyFrom = live preview (redraw のみ)、txn 内 = 1 undo step。
UXP の Preview/OK/Cancel と同一機構を drag protocol (preview/commit/abort)
に流用した。

## Decision

**Phase 0 (C++ batch API)**: 境界越えを 1 call 化するため
`qsys::MultiGradient` に `getNodesJSON()` / `setNodesJSON(json)` を追加
(`MultiGradient.qif/hpp/cpp`)。`setNodesJSON` はローカル scratch を
`gfx::AbstractColor::fromStringS` + `insert` で構築して **`copyFrom()` を呼
ぶだけで undo 記録 + イベント発火を既存機構ごと継承**する。JSON パースは
**Boost.PropertyTree `read_json`** (deplibs Boost 1_84_0 に header 同梱、
header-only なので CMake 変更なし。std に equivalent が無い領域は Boost が
正、という方針に整合)。named color は `color` フィールドで symbolic に
round-trip し、UI 表示用に `r/g/b` (0-255) を併載する。

**worker 層** (`RG/worker/server/services/coloring/multiGrad.ts`):
`getMultiGradState` (capable / colormode / color_mapname / nodes /
mapObjects / mapStats を 1 call) と `getMultiGradHistogram`
(`getHistogramJSON` の rebin passthrough; 返却 JSON の min/max は無視し
`nmax` で正規化)、唯一の書き込み経路 `setMultiGradNodes` (drag protocol:
`preview` = txn なし / `abort` = original 復元 / `commit` = original 復元
→ `tryUndoTxn` 内で final 書き込み、genericProps の restore-then-txn 方式)、
`setMultiGradColorMap`。モード切替は `setRendererColoring` の
`'paint-type-multigrad'` case: 1 txn で color_mapname default (map renderer
は自身の client map 名、molsurf は scene 先頭の scalar map) → `colormode =
'multigrad'` → 空 gradient なら heatmap seed。

**widget** (`RG/components/multigrad/`): `GradientStopBar.tsx` は
controlled + CueMol 非依存の pure widget (histogram canvas strip /
gradient preview bar / stop marker lane / min-max 行)。幾何・色計算は
`gradientGeometry.ts` (keepRatioRescale は UXP `onParChanged` の忠実移植:
端点 anchor + 0.001 veto、重複値は `MIN_STOP_SPACING` nudge — C++
`std::set` が重複値を silent drop するため)。preset は
`multiGradPresets.ts` (rainbow1 / resmap1 / heatmap1、UXP `onPresetSel` の
1:1 移植)。共有 feature component `MultiGradSection.tsx` が両 pane に埋め
込まれ、drag 配線 (originalNodes snapshot + ローカル preview override +
in-flight 1 本の coalesced preview) を持つ。

## Consequences

- **live 編集**: drag 1 フレームごとに txn なし `setNodesJSON` → 3D view
  が即時更新。release で restore-then-txn の 1 undo step。Esc で abort。
  E2E (実マウスドラッグ) で「drag = 1 undo step / Esc = 0 step」を確認済み。
- **optimistic commit (snap-back 対策)**: 全 mutation (drag release / 値 /
  色 / 追加 / 削除 / preset) は commit 時にローカル override へ即時反映し、
  `fireService` 直後に `refetch()` を呼ぶ。refetch の token bump が in-flight
  の stale fetch を破棄し、worker のメッセージ順序 (commit → fetch) が
  「次に届く canonical は commit 済み」を保証するので、UI が編集前状態へ
  一瞬戻る flash が起きない。override は次の canonical 到着 (または 1.5s
  の safety timeout) で解除。named color の optimistic swatch は簡易
  named→hex 解決で近似し、canonical 到着時に正値へ置換。
- **表示レンジは stop 範囲から独立 (UXP からの deviation)**: UXP は
  histogram のレンジを stop min/max に固定していたため範囲外へ色を置けな
  かった。tritium では bar の上に `View range` 行 (`<` pan / `-` zoom out /
  `+` zoom in / `>` pan / `Fit`) を置く。Fit の基準は「stop があれば stop
  min–max、無ければ map histogram の中央 95% (2.5/97.5 percentile —
  `getMultiGradState.mapPercentiles`、raw min/max は外れ値で広がりすぎる
  ため)」。pan は span の 25% ずつ平行移動、zoom は 1.5 倍ステップ。view
  範囲外の stop marker は非表示 (端に pin すると偽の位置表示になり lane
  端のクリック追加も塞ぐため。値/色は選択行から編集可能なままで、Fit で
  視界に戻る)。drag / pending 中は domain を
  freeze し、bar 上のジェスチャで stop min/max が変わった場合はドラッグ中
  の表示フレームを override として維持する (auto-refit で端点 marker が
  lane 端へ跳ぶのを防ぐ; Fit で再フィット)。histogram strip は 48px。
  histogram strip 上の trackpad gesture にも対応: pinch (Chromium は
  ctrlKey 付き wheel として配送) はカーソル位置アンカーで zoom、drag は
  grab/grabbing カーソルで pan、横 2 本指スクロール (wheel deltaX) も pan。
  wheel は React synthetic では page-zoom を preventDefault できないため
  native listener (passive: false) で attach。histogram bins は fetch 時の
  domain を保持し、gesture 中は既存 bins を新 view domain に再マップ描画
  して 100ms debounce の refetch を待たずに追従する。
- **histogram binning は d3/Vega 流の nice グリッド**: bin 幅は view span
  と strip の px 幅 (~3px/bar、32-256 bin) から 1-2-5 x 10^k ラダーへ切り
  上げ (`niceBinWidth`)、fetch レンジは bin 幅の整数倍に整列
  (`alignedBinRange`、origin 0)。同一ズーム中は bin 境界がデータ空間に固定
  されるため、pan は「同じ棒の平行移動」になり位相エイリアシング (pan の
  たびに山の形が変わる boiling) が消える。1 bin 未満の pan は refetch 自体
  が発生しない。y スケールは `getMultiGradHistogram.globalNmax` (map 全域
  を同一グリッドでリビンした最大値; C++ base histogram キャッシュからの
  O(bins) リビン 1 回、全域 bin 数 65,536 超の極端 zoom-in では null で窓内
  max に縮退) で固定し、pan による縦伸縮をなくす。bin 幅が変わる zoom 時に
  y 最大が変わるのは Plotly/matplotlib と同じ仕様。E2E で「pan 往復後に
  canvas dataURL が完全一致」を機械検証。
- **y 軸は log(1 + n) スケール (UCSF ChimeraX 準拠)**: 上記の「全域 max で
  y 固定」を linear のまま運用すると、solvent flatten 済み map のように 1
  つの値 (通常 0) へボクセルが集中している場合、そのスパイクが y 最大を
  占有して他の feature が sub-pixel に潰れ実用不能になる。ChimeraX の
  volume viewer は `h.show_data(log(counts + 1))` として log を適用し、
  縦方向の zoom UI を一切持たない (`chimerax.map.histogram.Histogram` は
  `max(heights)` で割るだけ; 汎用の `MarkedHistogram` も `scaling` =
  `'logarithmic'` 既定 / `'linear'` の 2 値のみで y zoom は無い)。これに
  倣い `histogramBarFraction()` が `log1p(count) / log1p(yMax)` を返す。
  log は比を差に変換するため、ピーク 1e6 に対して count 1000 が約半分、
  count 1 でも約 5% の高さを保ち、6 桁のダイナミックレンジが 48px に収まる
  (linear では順に 0.05px / 0.00005px で不可視)。y zoom は ChimeraX 同様
  実装しない — log 単体で解決し、UI 面を増やさないため。将来 linear/sqrt
  トグルが必要になれば `histogramBarFraction` の差し替えで済む。
- **bin 幅の下限 (Vega-Lite `bin.minstep` 方式)**: bin 数を strip の px 幅
  から決めているため、zoom in を続けると bin 幅がデータの実解像度を下回り、
  空 bin が櫛状に並ぶ。実測 (合成 map 2 種を実アプリで計測) では、13.8k
  voxel の疎な map で深い zoom 時に空 bin 99%、262k voxel の現実的な map
  では 0-5% だった。`minHistogramBinWidth()` が 2 つの下限の粗い方を返す:
  (1) C++ base histogram の解像度 `sigma/1000`
  (`ScalarObject::calcBaseHistogram` の bin 幅)、(2) 1 bin あたり平均 10
  サンプルを保つ `10 * range / N_eff`。`N_eff` は全域 voxel 数から**最大
  bin (スパイク) を除いた**数で、solvent flatten 済み map では voxel の
  8 割がゼロ bin に集中するため除外しないと 4.5 倍過大評価になる。両項とも
  map ごとの定数なので bin 幅は zoom レベルのみに依存し、pan 不変性は保た
  れる。下限に達した後の zoom は「棒が太くなるだけ」になり、Plotly /
  matplotlib / d3 の既定挙動 (bin はデータ空間で固定し zoom は viewport
  変換) へ漸近する。ChimeraX が x zoom を持たないため直接の前例は無い。
  必要な統計 (`mapVoxelCount` / `mapPeakCount`) は `getMultiGradState` が
  既に取得している全域ヒストグラムから無料で得られるので **C++ 変更は不要**。
- **pan は span を保存する形で計算する**: `{min+shift, max+shift}` だと
  pan を繰り返すたびに `max-min` が浮動小数点誤差で漂い、zoom レベルが
  静かに変わる。`{min+shift, min+shift+span}` として span を厳密に保つ
  (button pan / drag pan / wheel pan の 3 経路すべて)。
- **seed-on-switch は UXP からの deviation**: UXP はモーダルを開くまで空
  gradient のままだったが、live 切替では黒一色になるため、切替時に空なら
  heatmap1 相当を seed する (`seedEmptyGradient`)。map の range が縮退
  (max-min < 0.001) している場合は seed しない (黒表示 + 空状態 UI で案内)。
- **panelList 拡張**: map renderer (contour / isosurf / gpu_*) は `coloring`
  プロパティが無く従来 ColorPane の対象外だった (今回発見のギャップ)。
  `listPaintCapableRenderers` を `rendererHasColoringProp || isMultiGradCapable`
  に拡張し、map renderer では Coloring dropdown に Multi-gradient のみを出す
  (他の paint-type は coloring プロパティが無く適用不能)。multigrad 以外の
  colormode では誤解を避けるため案内 deck を表示する。
- **DensityMapPane inline 埋め込み**: ▼メニューに UXP と同じ radio 対
  (Solid color / Multi-gradient color) を追加。multigrad 側は
  `setRendererColoring` 経由 (default + seed ロジックを ColorPane と共有)、
  solid 側は `setMapRendererProp('colormode','solid')`。multigrad 時は色
  swatch を隠し (UXP parity) `MultiGradSection` を **ColorPane と完全同一
  構成**で埋め込む (map selector は「別 map で着色」に有用なため compact
  variant は作らない)。
- **widget は feature-local 配置 (h3-kit 非採用)**: 単一機能向け widget は
  feature 近くに置く既存の流儀 (`components/panels/anim/AnimStrip.tsx` 等)
  に従い `components/multigrad/` に集約。カタログ規約は label+control 型
  form 部品のサイズ一貫性が趣旨で gradient bar は対象外。将来の再利用候補
  (GLSLMapVolRenderer の transfer function editor — 同じ `MultiGradient`)
  が現れたら昇格できるよう props 契約は pure に保ってある。
- **worker が pure module を components から import**: `applyColoring.ts` の
  seed が `components/multigrad/multiGradPresets.ts` を import する (preset
  定義の single source 維持)。同 module は依存ゼロの pure data で、bundler
  はスレッドを問わず取り込める。「file location = 実行 thread」の原則の
  例外だが、重複定義よりよいと判断。
- **Inspector 経由の切替は許容**: `MolSurfRendererSection` の colormode
  `MappedEnumRow` は enum 定義から `multigrad` を自動列挙する (表示ラベル
  「Multi-gradient」を追加)。この経路は color_mapname default / seed を通
  らないが、deck の空状態 + map selector から復旧可能なので許容。
- **color-only の display cache 分離は見送り**: multi_grad PROPCHG →
  `invalidateDisplayCache()` → 次 draw で surface 全再構築 (marching cubes
  込み) が preview 1 フレームごとに走るが、既存の DensityMapPane siglevel
  realtime drag が同じコスト (幾何再計算込み) で成立しているため許容範囲。
  大 map / GLSL renderer で重い場合の将来最適化として note (対策候補:
  `MultiGradSection` の preview に ~30ms throttle 追加、根本対策は
  color-only cache の分離)。
- **histogram API は変更不要**: `calcBaseHistogram()` が C++ 側でキャッシュ
  済み・rebin のみ per-call。

## Notes

- C++: `src/qsys/MultiGradient.{qif,hpp,cpp}` (getNodesJSON / setNodesJSON)、
  gtest `src/tests/qsys/test_multigradient.cpp` (round-trip / dup skip /
  clear / throw)。undo 継承テストは multi_grad プロパティを持つ renderer
  が xtal/surface module にしか無いため
  `src/tests/modules/xtal/test_multigrad_undo.cpp` に配置 (scene +
  isosurf renderer 経由)。
- N-API 境界: `tritium/core/src/tests/qsys/MultiGradient.test.ts` (wrapper
  再生成 + string marshaling を pin)。
- worker: `coloring/multiGrad.ts` + `colorTargets.ts` の
  `getMultiGradOrNull` / `isMultiGradCapable` probe + `applyColoring.ts` の
  `paint-type-multigrad` case + `deckState.ts` の `multiGradCapable` +
  `panelList.ts` 拡張。`WorkerCalls.ts` ServiceMap 4 行。
- renderer: `components/multigrad/{GradientStopBar,MultiGradSection}.tsx`、
  `gradientGeometry.ts`、`multiGradPresets.ts`、`hooks/useMultiGradState.ts`
  (SEM_OBJECT|SEM_RENDERER 30ms debounce、propname filter は
  `multi_grad`/`colormode`/`color_mapname` + prefix + 不明イベント通過
  fallback)、`hooks/useMultiGradHistogram.ts` (nbins=128、domain 変化
  ~100ms debounce、drag 中 skip)、`styles/_multigrad.css`。
- UXP parity 参照: `uxp_gui/cuemol2/base/content/tools/multigrad_editor.js`
  (`onParChanged` = keepRatioRescale、`onPresetSel` = presets、
  `onPreview`/`onDialogAccept`/`onDialogCancel` = drag protocol)。
- テスト: gtest 10 / core Jest 5 / vitest 63 (gradientGeometry 22 +
  presets 4 + service 17 + widget 8 + ColorPane wire 7 + DensityMapPane
  wire/service 拡張 5)。host E2E: 実アプリ (playwright _electron) で
  load → 切替 → seed → histogram → preview/commit/abort → undo/redo →
  実マウスドラッグ → Esc abort → dark/light 両テーマを機械検証 (22+5 項目)。
- 既知の制約: histogram canvas はテーマ切替後の再描画を持たない
  (SequencePanel と同じ制約; 次の domain 変化 / refetch で再描画される)。
