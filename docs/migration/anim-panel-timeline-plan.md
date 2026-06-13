<!-- Planning document generated via ultracode workflow (research + 3-way design panel + synthesis), 2026-06-13. -->
<!-- Verified against source: AnimMgr.qif / AnimObj.qif read directly; API surface matches this plan 1:1. -->

# 検証メモ（裏取り結果, 2026-06-13）

このプランは ultracode ワークフロー（UXP 実装 / C++ API / 現 mock / Blender UI の 4 並列 research → 3 案 design panel → 統合）で作成し、提示前に以下を実ファイルで確認した:

- `src/qsys/anim/AnimMgr.qif` / `src/qsys/anim/AnimObj.qif` を直読。本プランが参照する API（`getAt`/`size`/`append`/`insertBefore`/`removeAt`/`resolveRelTime`/`start`/`stop`/`pause`/`goTime`/`length`/`elapsed`/`playState`/`loop`/`startcam`、`AnimObj` の `name`/`disabled`/`timeRefName`/`start`/`end`/`absStart`/`absEnd`/`quadric`/`uid`）は**全て実在**し、シグネチャも一致。
- **§9 未確定 #1 を解消**: `playState` は `.qif` の `enum` property（`stop`/`play`/`pause`）。プロジェクト規約「enum property は生成 TS 上 number 型だが**実行時は文字列 ID を返す**」に該当するため、worker での数値→文字列マップは不要で、`playState as unknown as string` を `'stop'|'play'|'pause'` として直接扱える。§5.1 / §9#1 の「number 前提・並び要確認」は**不要**。

---

# 移行計画: tritium AnimationPanel を Blender 風アニメーションタイムラインへ再構築

> Status: PROPOSED (FINAL design plan) · Author: tech lead · Date: 2026-06-13
> Scope: `tritium/react-gui` AnimationPanel (bottom panel "animation" tab) のフルリライト + 新規 worker service。オフライン movie render (POV-Ray/ffmpeg) は対象外（§9）。

---

## 1. エグゼクティブサマリ

CueMol の animation element は C++ 側で **時間範囲を持つ `AnimObj`（`absStart`/`absEnd` の span）** であり、点 keyframe ではない。したがって採用するパラダイムは **Blender VSE/NLE 風の strip timeline**（1 element = 1 lane 上の横バー）を body に、**Blender Timeline 風の transport header**、**Dope-Sheet 風の左 channel list** を組み合わせた **hybrid**（3 提案のうち proposal 3 "hybrid-strip-plus-detail" をベースに、proposal 1/2 の strip 描画・worker service 設計・degrade 検出方針を統合）とする。

現 mock の `Keyframe[]` per `AnimationTrack` モデルは **C++ データモデルと根本的に不一致なため全廃**し、`AnimElement`（1 AnimObj = 1 strip, time は全て ms = `TimeValue.millisec`）へ置き換える。バーは resolved な `absStart/absEnd` で描き、編集は relative な `start/end` に書いて `resolveRelTime()` で再解決する。新規 `animation.service.ts`（N+ getter ループ; bulk JSON は存在しない）と `useAnimTimeline` フックで実データ配線し、再生・スクラブは `goTime`/`start`/`pause`/`stop` を通じて **実際に 3D view をアニメーションさせる**（mock のローカル rAF カウンタは削除）。

採用根拠（C++ データモデル適合性、最重要判定）: strip バーの atomic unit は **start + end + draggable duration** を既に持ち、`AnimObj` と 1:1 対応する。duration（最重要プロパティ）がバー幅として可視化され、keyframe ダイアモンドモデルでは表現できない。全 UI 操作が既存 `.qif`/wrapper メソッド（`getAt`/`size`/`start`/`end`/`absStart`/`resolveRelTime`/`goTime`/`append`/`removeAt`）に backing され、**C++ 側に新規 capability を一切要求しない**（検証済み: §6 の wrapper は全て存在）。

---

## 2. UXP 実装状況の確認（移植対象スコープ）

UXP anim UI が実際に提供している機能（research brief A より、再確認済み）:

| 機能 | UXP 実装 | tritium 移植スコープ |
|---|---|---|
| **要素リスト** | `<tree>` 3 列 (Name/Start/End)、index == AnimMgr index | strip timeline の lane へ（リストではなくバー配置） |
| **要素の追加** | Add メニュー (Simple spin/Camera motion/Show/Hide/Slide In/Slide Out/Mol Morphing/No-op) | 同等の Add メニュー → `addElement` |
| **削除/上下移動** | Delete / Move up / Move down（move = delete+reinsert） | strip 選択削除 / lane drag reorder |
| **プロパティ編集** | modal property dialog（Common タブ: Start/Duration/Relative-to、type タブ） | 非 modal の inline detail inspector（hybrid の編集面） |
| **時間編集** | `timeedit` (HH:MM:SS.mmm 数値フィールド) のみ。**グラフィカルなタイムライン widget は存在しない** | strip ドラッグ/リサイズ + inspector 数値（新規 UX） |
| **relative-time chaining** | `timeRefName` で前要素の `absEnd` に連結。新規要素は前要素へ自動 chain | バー位置で暗黙可視化 + inspector の "Relative to" select |
| **transport** | 別 widget (`anim-ribbon`): Play/Pause/Stop/Loop + 1D scale slider + cur/total label。fps なし、`elapsed` ベース | header transport（同等）+ playhead |
| **scrub** | slider `dragStateChange` → drag-end でのみ `goTime(tv, view)` commit | playhead drag、drag-end commit |
| **movie render** | `anim-render-dlg`: POV-Ray frame renderer + ffmpeg encode、range は常に全体 | **対象外**（§9、別ワークストリーム） |

**重要な前提修正**（brief A 冒頭の通り）: UXP には **track-based timeline widget が存在しない**。これは port ではなく **新規 UX** の設計。移植する「機能契約」は「順序付き time-ranged 要素リスト + 数値時間編集 + 1D transport」であり、見た目（strip timeline）は Blender 由来の新規デザイン。

---

## 3. 現 mock の評価（何が使えて何が不一致か）

**全廃する不一致部分（C++ データモデルと矛盾）:**

| Mock | C++ `AnimMgr`/`AnimObj` | 判定 |
|---|---|---|
| `Keyframe { frame, value:string }` 点モデル | 時間範囲を持つ `AnimObj`（start/end span が要素の identity） | **不一致 → 全廃**。点では duration を表現できず、`value` は型なし display string、`uid` で C++ object に紐付かない |
| `AnimationTrack { keyframes:[] }`（1 track = 複数点） | 1 lane = 1 `AnimObj`（範囲） | **不一致 → 全廃** |
| `frame:int` + global `fps` 軸 | nanosecond ベース、`goTime(TimeValue)` で time scrub | **不一致**。X 軸は ms へ。frame はオフライン render のみ存在 |
| ローカル `currentFrame` rAF カウンタ | `AnimMgr.start(view)` が実 view loop を駆動、`elapsed` がソース | **不一致 → 削除**。3D を一切アニメートしていない no-op |
| `useState(SAMPLE_ANIMATION)`（setter なし）、`alignmentData.ts` の hardcode | worker service 経由の実データ | **全廃**。配線が存在しない（worker service: 確認の上 **皆無**） |

**再利用できる足場（DNA として残す）:**

- コンポーネント分割の骨格（transport bar / label column / scrollable timeline / ruler / playhead）と vertical scroll-sync ロジックは構造として流用可能。
- `FrameRuler` → `AnimTimeRuler` へ（frame ticks を ms ticks に置換、scroll-sync は流用）。
- 既存 token 化済みの色（`--accent*`/`--bg*`/`--text*`/`--border*`）は維持。
- icon は既に `<AppIcon>` + `AppIconKey` データ駆動（§0.7 準拠済み）。

**CSS 負債（§6 で解消）:** 全 geometry が JS 定数（`PX_PER_FRAME`/`TRACK_HEIGHT`/`RULER_HEIGHT`/`TRACK_LABEL_WIDTH`）と raw px、`!important` Blueprint override（`.bp5-button { min-height:22px!important }` 等）、raw `--fs-*` 直参照。全て form-kit + token + `.type-*` role に置換。

---

## 4. 採用する UI 設計（Blender 風 timeline）

### 4.1 確定版レイアウト（ASCII）

bottom panel は横長・低背なので、proposal 3 の 3-pane（label/strip/detail を inline 横並び）は幅圧迫が強い。**detail inspector は inline 3 列目ではなく折りたたみ可能 drawer**とし、デフォルトは 2-pane（label + strip）。要素選択時にトグルで右に展開、または狭い時は RightPanel 側へ寄せる（§9 で未確定として明示）。

```
+==========================================================================================================+
| TRANSPORT HEADER  (form-kit FormButton row + NumericField cluster)                                       |
| [|<][<][>/||][#][>][>|]   00:02.500 / 00:10.000   [Loop]   [sec|ms]   [Fit] [- zoom +]   [+Add v] [Insp] |
|  jmp prv play stop nxt jmp   elapsed / length      (Switch)  (Segment)   (FormButton)      (menu) (toggle)|
+----------------------+-----------------------------------------------------------------------+-----------+
| CHANNEL LIST (left)  | TIME RULER  (ms or mm:ss.mmm, scrollX-synced)                          | DETAIL    |
|  width=--anim-label-w| 0       1.0s     2.0s     3.0s     4.0s     5.0s    ...                 | INSPECTOR |
|                      | |...|...|...|...|...|...|...|...|...|...|       <- ticks                | (drawer,  |
|                      |        [====== active range band (lighter) ======]                     |  collap-  |
|                      |                      | <- blue playhead, spans all lanes, snaps        |  sible)   |
+----------------------+-----------------------------------------------------------------------+ FieldSec  |
| (cam) CamMotion0 [o] |   #=========== CamMotion0 ===========#                                 | "Element" |
+----------------------+-----------------------------------------------------------------------+  name[__] |
| (spin) SimpleSpin1[o]|             #=== SimpleSpin1 ===#  (chained ->CamMotion0)              |  enab[x]  |
+----------------------+-----------------------------------------------------------------------+ FieldSec  |
| (show) Fade 1CRN [o] |        #== Fade ==#  RED-hatch overlap w/ CamMotion0                   | "Timing"  |
+----------------------+-----------------------------------------------------------------------+  relto[v] |
| (mol) Morph A->B [/] |                          #====== MolAnim ======#  (disabled=dimmed)   |  start[_] |
+----------------------+-----------------------------------------------------------------------+  dur [_]  |
| [+][-] [^][v]        | <------- scrollX ------->                                              |  ease[_]  |
+----------------------+-----------------------------------------------------------------------+ FieldSec  |
                                                                                                | "Type"... |
                                                                                                +-----------+
   ^ left = list-kit rows (--row-h)    ^ each lane = 1 AnimObj, bar = absStart..absEnd          ^ form-kit
```

### 4.2 各 animation element の時間配置の見せ方

**バー geometry:** `left = absStartMs * pxPerMs - scrollLeftPx`、`width = (absEndMs - absStartMs) * pxPerMs`。左端 = `absStart`、右端 = `absEnd`、幅 = duration。**duration（最重要プロパティ）がバー長として常に可視**。

**strip anatomy（1 AnimObj）:**

```
       absStart                                          absEnd
          v                                                 v
  left  | ###############  type-icon  Label (CamMotion0)  ##############| right
 handle | <-- body: drag = move whole strip (preserves duration) -->   | handle
        +-- drag = trim start (writes rel start)   drag = trim end -----+
```

- **type → 色 + icon**: バー fill 色を subtype で keyed（VSE per-type 流儀）。leading に type icon（color-blind 安全、Blender の shape+color pairing）。type は C++ に getter が無いため worker 側で wrapper class 名から導出（§5）。
- **chaining (`timeRefName`)**: バーは resolved `absStart/absEnd` で配置するので chain は位置として暗黙可視。左端に細い connector tick + tooltip "after CamMotion0"、inspector の "Relative to" select で参照を露出/編集。
- **active range band**: `[0, length]` を lighter shade、範囲外を darker（Blender Timeline 流儀）。`length` は `max(absEnd)` で自動再計算（§9 リスク）。
- **overlap**: 隣接 lane で時間が重なる領域を **red hatch**（VSE 警告流儀）。自動 reflow はしない（CueMol は同時 active 要素を許容）。
- **disabled** (`disabled=true`): バーを低 opacity + 斜線 strike、label gutter に eye-off トグル。

### 4.3 playhead / ruler / track / strip の扱い

- **playhead**: 単一の青い縦線が ruler + 全 lane を貫通、`pointer-events:none`、ms グリッドに snap（ms 表示時）/ frame 境界に snap（frame 表示時）。再生中は polled `elapsedMs`、非再生時は scrub target を反映。
- **ruler**: `AnimTimeRuler`（mock の `FrameRuler` を置換）。"nice" な ms 間隔で tick + label。`sec|ms` SegmentField で表示単位切替（基底は常に ms）。
- **track (lane)**: 1 AnimObj = 1 lane。lane 順 = AnimMgr index 順（top→bottom）。これで `index == lane order` が自明に保たれ、add/remove/reorder が単純化（AnimMgr の index-as-handle 契約と一致）。
- **strip**: 自己完結の drag/resize gesture handling。`onMove(index, newStartMs, newEndMs)` / `onResize(index, edge, newMs)` を上位に emit、panel が worker へ routing。

### 4.4 インタラクション

| 操作 | 振る舞い | commit 先 |
|---|---|---|
| **scrub playhead** | ruler/body クリック・ドラッグ → `toMs(x)` を frame/ms に snap。drag-end でのみ（per-move ではない、UXP `dragStateChange` 流儀）`goTime(viewId, ms)`。ドラッグ中は local view-state で preview | `animGoTime` |
| **strip body move** | Δpx→Δms。`startMs=start+Δ`、`endMs=end+Δ`（duration 保存）。optimistic に local 移動、drag-end → `setElementTime`。chained 要素は resolver が abs を再導出 | `animSetElementTime` |
| **resize start/end** | 左/右 handle ドラッグ → その端のみ変更（他端固定）。`start>end` は renderer 側で pre-clamp（C++ は silent 自動 clamp するので surprise 回避）。cursor は handle 上で `ew-resize`、body 上で `grab` | `animSetElementTime` |
| **select** | strip/label row クリック → `selectedUids={uid}`。Shift+click 拡張、box-select（lane 横断 rubber-band）。選択 strip は brighten + handle 表示 + outline。単一選択で inspector 起動 | local state |
| **zoom time axis** | Ctrl+wheel（cursor anchor で `pxPerMs` 変更）。plain wheel = 水平 pan。**Fit** ボタン = `pxPerMs = canvasWidth / lengthMs`。vertical scroll（lane）は独立軸 | local `pxPerMs` |
| **add** | Add メニュー（Simple spin/Camera/Show/Hide/Slide in/Slide out/Mol morph/No-op）→ `addElement`。新規要素は `timeRefName=prev.name` で自動 chain（UXP parity） | `animAddElement` |
| **delete** | 選択削除 → `removeElement`（index 降順で除去、AnimMgr index 維持） | `animRemoveElement` |
| **reorder lane** | label row 上下ドラッグ → `removeElement`+`insertBefore`（in-place reorder API 無し） | `animReorderElement` |
| **detail edit** | inspector field → `setElementProp`（name/timeRefName/quadric/disabled/type props）または `setElementTime`（start/duration → end=start+dur、UXP parity） | `animSetElementProp`/`animSetElementTime` |
| **transport play（実配線）** | Play → `animPlay(viewId)`（C++ `AnimMgr.start(view)` が実 view loop 駆動）+ `getMgrState` poll 開始。Pause/Stop → `animPause`/`animStop` + poll 停止。**3D view が実際にアニメートする** | `animPlay/Pause/Stop` + poll |

**active view 依存:** scrub/play は active `viewId` が必須（C++ `goTime`/`start` が `View` を要求）。`BottomPanel` は既に `activeMolViewId` を scope に持つ（確認済み）。active molview が無い時 transport は disable。

### 4.5 color / affordance 規約

- バー vs diamond: time-ranged 要素は **filled bar**。`NoopAnimObj`（spacer）は zero-width に近い narrow marker。
- selected: バー brighten + outline、highlight は `--accent-selected`（Blender の yellow 流儀）。
- handle grips: 左右 edge grip が hover/selection で出現、cursor 区別（`ew-resize` vs `grab`）。
- active range shading: `[0,length]` lighter、範囲外 darker。
- playhead: 青縦線、frame/ms snap、ruler から drag scrub。
- overlap: red hatch（`--anim-overlap`）。
- per-type 色: theme-able palette token（§6）。type は色 + leading icon の双方で表現（color-blind 安全）。

---

## 5. データモデル設計

### 5.1 `types.ts` 変更点

**削除**（`types.ts:139-191`）: `Keyframe`, `AnimationTrack`, `AnimationData`（keyframe モデル全体。consumer は mock `alignmentData.ts` と `App.tsx` のみ）。

**新規追加:**

```ts
// types.ts -- replaces Keyframe / AnimationTrack / AnimationData

/** Concrete AnimObj subtype. No `type` getter exists on AnimObj.qif --
 *  the worker derives this from the wrapper class name (see service §6). */
export type AnimElementType =
  | 'SimpleSpin' | 'CamMotion' | 'ShowHideAnim' | 'SlideInOutAnim'
  | 'MolAnim' | 'RealPropAnim' | 'RendXformAnim' | 'NoopAnimObj'
  | 'unknown';

/** One AnimObj -> one strip. All times in ms (TimeValue.millisec). */
export interface AnimElement {
  index: number;        // AnimMgr position == op handle (matches SEM_ANIM index; VOLATILE across edits)
  uid: number;          // AnimObj.uid -- STABLE id (React key + selection identity)
  name: string;         // AnimObj.name (also the timeRefName target)
  type: AnimElementType;// derived worker-side (NOT a C++ property)
  disabled: boolean;    // AnimObj.disabled (enabled = !disabled)
  timeRefName: string;  // '' = absolute; else chained to that element's absEnd
  startMs: number;      // AnimObj.start.millisec    (RELATIVE -- what edits write)
  endMs: number;        // AnimObj.end.millisec      (RELATIVE)
  absStartMs: number;   // AnimObj.absStart.millisec (RESOLVED, read-only -> bar left)
  absEndMs: number;     // AnimObj.absEnd.millisec   (RESOLVED, read-only -> bar right)
  quadric: number;      // AnimObj.quadric (easing, 0 = linear)
  /** Subtype-specific props (angle/axis/mol/rend/...). Opaque to the timeline grid;
   *  read only when type is known; consumed by the detail inspector. */
  typeProps: Record<string, string | number | boolean>;
}

/** AnimMgr-level snapshot. Polled during playback (no position event fires). */
export interface AnimMgrState {
  lengthMs: number;     // AnimMgr.length.millisec (AUTO = max(absEnd); see §9 risk)
  elapsedMs: number;    // AnimMgr.elapsed.millisec (POLL during play -- no event)
  playState: 'stop' | 'play' | 'pause'; // mapped from numeric enum (see below)
  loop: boolean;        // AnimMgr.loop
  startcam: string;     // AnimMgr.startcam
}

/** Full timeline snapshot the panel renders from. */
export interface AnimTimeline {
  sceneId: number;
  elements: AnimElement[]; // index-ordered; lane order = this order
  mgr: AnimMgrState;
  /** Display-only fps for the frame<->ms ruler toggle + future render default.
   *  NOT a C++ property (setupRender arg only). Renderer-state default 30. */
  fps: number;
}
```

> **確認済み修正**: `AnimMgr.playState` の wrapper は `number` を返す（`enum`、`AM_STOP=0/AM_RUNNING=1/AM_PAUSED=2`）。3 提案は文字列前提だったが、worker service 側で `'stop'|'play'|'pause'` へマップする（`.qif` enum は文字列 id でも読めるが、wrapper の型は number なので数値→文字列マップを worker に置く）。**未確定**: 数値 0/1/2 の正確な並びは C++ enum 宣言（`AnimMgr.qif:43-48`）で要確認（§9）。

### 5.2 C++ `AnimMgr`/`AnimObj` API への 1:1 マッピング

| TS フィールド / 操作 | C++ wrapper（確認済み存在） | 備考 |
|---|---|---|
| `AnimElement.index` | `AnimMgr.getAt(i)` の i | volatile。remove で renumber |
| `AnimElement.uid` | `AnimObj.uid` (get) | stable。React key |
| `AnimElement.name` | `AnimObj.name` (get/set) | timeRef target |
| `AnimElement.type` | （getter 無し）wrapper class 名から導出 | `classNameToType` |
| `AnimElement.disabled` | `AnimObj.disabled` (get/set) | enabled = !disabled |
| `AnimElement.timeRefName` | `AnimObj.timeRefName` (get/set) | '' = absolute |
| `AnimElement.startMs` | `AnimObj.start.millisec` (get) / `start = tv` (set) | RELATIVE |
| `AnimElement.endMs` | `AnimObj.end.millisec` / `end = tv` | RELATIVE |
| `AnimElement.absStartMs` | `AnimObj.absStart.millisec` (get only) | RESOLVED → バー描画 |
| `AnimElement.absEndMs` | `AnimObj.absEnd.millisec` (get only) | RESOLVED |
| `AnimElement.quadric` | `AnimObj.quadric` (get/set) | easing |
| `AnimMgrState.lengthMs` | `AnimMgr.length.millisec` | auto = max(absEnd) |
| `AnimMgrState.elapsedMs` | `AnimMgr.elapsed.millisec` | poll only |
| `AnimMgrState.playState` | `AnimMgr.playState` (number → string map) | |
| `AnimMgrState.loop` | `AnimMgr.loop` (get/set) | |
| `AnimMgrState.startcam` | `AnimMgr.startcam` (get/set) | |
| add | `cm.createObj(typeName)` → `mgr.append(obj)` / `mgr.insertBefore(i, obj)` | C++ 側で既に undoable |
| remove | `mgr.removeAt(i)` | C++ 側で undoable、SEM_REMOVING 発火 |
| move/resize | `e.start=tv; e.end=tv2; mgr.resolveRelTime()` | TimeValue は `ctx.svc.createObj('TimeValue')` |
| reorder | `mgr.removeAt(from)` + `mgr.insertBefore(to, obj)` | in-place 無し |
| scrub | `mgr.goTime(tv, view)` | time-based、jump+pause |
| play/pause/stop | `mgr.start(view)` / `mgr.pause()` / `mgr.stop()` | |
| acquire | `scene.getAnimMgr()` | 確認済み（`Scene.ts:267`） |

---

## 6. アーキテクチャ / 配線

### 6.1 worker service（新規 `animation.service.ts`）

`tritium/react-gui/src/renderer/worker/server/services/animation.service.ts`。既存規約（確認済み）に厳密準拠:
- `export const services = { ... }`（`import.meta.glob` で自動登録）。
- 各 fn は `(ctx: WorkerContext, args) => result`。
- object 生成は `ctx.svc.createObj(className)`（server facade、確認済み）。`getService` を service 内で呼ばない。
- undo は既存 service と同じく `scene.startUndoTxn()/commitUndoTxn()/rollbackUndoTxn()` を直接（共通 helper は無いので各 service で try/finally）。add/remove は C++ 側で既に undoable なので二重 txn は避ける。
- 全て worker 内 sync wrapper call。時間境界は ms（`TimeValue.millisec`）。

```ts
// signatures (bodies follow brief B.7 + verified wrappers)
function listTimeline(ctx, { sceneId }): AnimTimeline           // N+ getter loop; resolveRelTime in try; map playState num->str
function getMgrState(ctx, { sceneId }): AnimMgrState            // cheap poll target during play
function setElementTime(ctx, { sceneId, index, startMs, endMs }): { ok; clamped?; error? }  // rel start/end + resolve, undo-txn
function setElementProp(ctx, { sceneId, index, prop, value }): { ok }                        // name/disabled/timeRef/quadric/typeprop
function addElement(ctx, { sceneId, typeName, props?, insertIndex? }): { ok; uid; index }    // createObj + defaults + auto-chain
function removeElement(ctx, { sceneId, index }): { ok }
function reorderElement(ctx, { sceneId, from, to }): { ok }
function goTime(ctx, { sceneId, viewId, ms }): { ok; elapsedMs }   // needs View
function play(ctx, { sceneId, viewId }): { ok }
function pause(ctx, { sceneId }): { ok }
function stop(ctx, { sceneId }): { ok }
function setMgrProp(ctx, { sceneId, prop, value }): { ok }         // loop / startcam (NOT length -- auto)
```

`classNameToType` helper（`services/helpers/animElementType.ts`）: `AnimObj` に type getter が無いため wrapper の判別。第一に wrapper の class 名（`obj.constructor.name`）、fallback で distinguishing prop probe（`'angle' in r && 'axis' in r` → SimpleSpin、`'endcam' in r` → CamMotion、`'start_tran' in r` → RendXformAnim、`'fade' in r` → ShowHideAnim、`'direction' in r && 'distance' in r` → SlideInOutAnim、`'mol' in r` → MolAnim、`'rend' in r && 'startValue' in r` → RealPropAnim、最後 NoopAnimObj）。1 箇所に集約し fallback lane 色は `'unknown'`。

### 6.2 `ServiceMap` 行（`worker/shared/WorkerCalls.ts`）

```ts
animListTimeline:   { args: { sceneId: number };                                                       result: AnimTimeline }
animGetMgrState:    { args: { sceneId: number };                                                       result: AnimMgrState }
animSetElementTime: { args: { sceneId: number; index: number; startMs: number; endMs: number };        result: { ok: boolean; clamped?: boolean; error?: string } }
animSetElementProp: { args: { sceneId: number; index: number; prop: string; value: string | number | boolean }; result: { ok: boolean } }
animAddElement:     { args: { sceneId: number; typeName: AnimElementType; props?: Record<string, unknown>; insertIndex?: number }; result: { ok: boolean; uid: number; index: number } }
animRemoveElement:  { args: { sceneId: number; index: number };                                        result: { ok: boolean } }
animReorderElement: { args: { sceneId: number; from: number; to: number };                             result: { ok: boolean } }
animGoTime:         { args: { sceneId: number; viewId: number; ms: number };                           result: { ok: boolean; elapsedMs: number } }
animPlay:           { args: { sceneId: number; viewId: number };                                       result: { ok: boolean } }
animPause:          { args: { sceneId: number };                                                       result: { ok: boolean } }
animStop:           { args: { sceneId: number };                                                       result: { ok: boolean } }
animSetMgrProp:     { args: { sceneId: number; prop: 'loop' | 'startcam'; value: string | boolean };   result: { ok: boolean } }
```

> **TS naming 注意**: `services` の named export key（runtime）と `ServiceMap` key は一致必須。上記 service fn は `services = { animListTimeline: listTimeline, ... }` のように map export する（`getSeqPanelData` パターンと同じく fn 名と export key は分離可）。

### 6.3 AsyncCueMol 経由の呼び出し + イベント購読（renderer）

呼び出しは `cm.invokeService('animListTimeline', { sceneId })`（`AsyncCueMol.invokeService<K>`、確認済み）。

新規 `hooks/useAnimTimeline.ts`（`useDensityMapPanel` を雛形）:
- mount + `sceneId` 変化で `invokeService('animListTimeline')`。
- `useCueMolEventListener`（確認済みのフック）で `srcMask: SEM_ANIM`（`event.ts:13` で `SEM_ANIM = 0x0100` 定義済み）, `evtMask: SEM_ANY`, `scopeId: sceneId`, `debounceMs: 30` を購読 → refetch。これで undo/redo/script/他タブ由来の編集も拾う（`start`/`end` move は `SEM_PROPCHG` で来る → "refetch list" 扱い）。
- mutation callback は各 service を呼んで返り値で再同期（多くの mutator は `{ ok }` のみ返すので、ok 後に refetch するか、または service が refreshed `AnimTimeline` を返す設計に統一するか **要決定** → 本計画では「mutator は `{ ok }` を返し、SEM_ANIM 経由の debounced refetch に一本化」を採用。理由: event 駆動が単一の source of truth になり、optimistic UI との二重更新を避ける）。
- 別フック `useAnimTransport(sceneId, viewId)`: play/pause/stop/goTime + **再生中のみ** `requestAnimationFrame` で `getMgrState` を ~15Hz poll（位置変化イベントが無いため必須、brief B.5）。`playState !== 'play'` で poll 停止（leak 防止）。これが mock のローカル rAF カウンタを置換。

### 6.4 commands/CommandMap・IPC の要否

- **IPC（main↔renderer）は不要**。AnimationPanel は bottom panel 内の純 renderer↔worker 機能。menu からの起動も現状不要（panel は常設タブ）。
- **commands/CommandMap も初期段階では不要**。transport/編集は panel 内 local 操作。ただし **detail inspector を将来 modal ダイアログ化する**場合や **menu から "Add animation element" を出す**場合は `CmdId` + `CommandMap` 行が起点になる（§9 未確定、初期 phase ではスコープ外）。
- 配線変更の起点は **`ServiceMap` 行追加**（§6.2）と **`types.ts`**。callsite は compile error で誘導される（tritium 規約）。

### 6.5 form-kit / token / ui-style-guide 準拠

§3 の CSS 負債を全て解消（確認済み: 全 form-kit component が catalog に存在）:

| Mock（raw Blueprint） | form-kit 置換 | 除去される負債 |
|---|---|---|
| 6× `<Button small>` in `ButtonGroup minimal`（transport） | `ButtonRow` + `FormButton`（icon-only） | `.anim-transport-controls .bp5-button { min-height:22px!important; min-width:26px!important }` |
| `<NumericInput small>` frame | `NumericField` / scrub は `DragNumericField` | `.anim-frame-input .bp5-input { height:20px!important }` |
| FPS 表示 span | `NumericField`（renderer-only state） | raw `--fs-*` |
| relative-to / endcam / mol / prop select（新規） | `SelectField` | — |
| enabled / hide / fade / ignore*（新規） | `SwitchField` | — |
| start/dur/quadric/startValue/endValue（新規） | `NumericField` | — |
| sec\|ms, frames\|seconds | `SegmentField` | bespoke span |
| loop | `SwitchField` | — |
| inspector groups | `FieldSection`（title）+ `Field` rows | modal 回避 |

> **catalog gap**: icon-only segmented transport cluster が `FormButton`/`ButtonRow` で正しいサイズにならない場合、ui-style-guide §0「無い部品は先にカタログへ追加」に従い **先に catalog へ transport variant を追加**してから使う（Phase 2 で先行確認）。

**token 規約（raw px/hex 禁止）:**
- 新規 timeline geometry は `_variables.css` に named token を**先に追加**: `--anim-lane-h`（= `--row-h`）、`--anim-ruler-h`、`--anim-label-col-w`、`--anim-handle-w`、`--anim-strip-radius`（= `--radius-sm`）、`--anim-playhead-w`、`--anim-marker-w`。`pxPerMs` のみ dynamic 値として inline `style`（§原則1 で許可）。strip の `left`/`width` はそこから算出。
- per-type 色を named token 化: `--anim-type-spin`/`--anim-type-cam`/`--anim-type-showhide`/`--anim-type-slide`/`--anim-type-mol`/`--anim-type-realprop`/`--anim-type-xform`/`--anim-type-noop`、`--anim-overlap`、`--anim-range-shade`。dark/light 両対応。playhead は `--accent-red`、選択は `--accent-selected` 再利用。
- typography は `.type-*` role（raw `--fs-*` 禁止）: transport readout → `.type-mono`、"FRAME/FPS/LOOP" eyebrow → `.type-eyebrow`（uppercase+`--ls-wide` を bundle）、label row → `.type-row`、ruler label → `.type-caption`。
- label column は list-kit row（`--row-h`/`--bg-hover`/`--bg-active`/`.type-row`）。strip lane は「dense 専用 widget」（§0 で許容）だが固定寸法は `--anim-*` token 参照。
- icon は `<AppIcon>`（既存準拠）+ per-type bar icon を `typeIconMap`（`AppIconKey` データ駆動）。
- 検証: `cd tritium/react-gui && npm run lint:style` が baseline 件数を増やさないこと。lint は `.type-*` role 誤用と raw `height`/`width` を捕捉しないので review-gated（全固定寸法を `--anim-*` token 経由にする規律で担保）。

---

## 7. 実装フェーズ計画

各 Phase は「観測契約を pin するテストを先に書く」原則（tritium 規約「Refactoring 前の degrade 検出テスト」）に従う。**Phase 1 は C++ 実データで strip を描く最小縦切り**。

### Phase 0: 観測契約 pin（既存 mock の wire を固定）
- **目的**: mock 削除前に「現状」を壊さないための baseline ではなく、新 service の wire 契約を先に test として書く（実装は空 → red）。
- **触るファイル**: `__test__/animationService.test.ts`（service contract: `listTimeline(ctx,{sceneId})` が `getAnimMgr().getAt(i)` を size 回呼び、各要素の `start.millisec`/`absStart.millisec` 等を読んで `AnimElement[]` を組むこと、playState num→str マップ、resolveRelTime を try で包むこと）、`__test__/useAnimTimeline.test.ts`（mount で `invokeService('animListTimeline',{sceneId})` 1 回、`SEM_ANIM` で refetch）。
- **完了判定**: test ファイルが存在し（実装未着で red）、契約 shape が `ServiceMap`/`types.ts` と整合。

### Phase 1: 最小縦切り — 実データで strip を描く（read-only）
- **目的**: `getAnimMgr` から実 `AnimObj` を列挙し、strip バーを `absStart/absEnd` で描画。編集・再生はまだ無い。
- **触るファイル**:
  - 新規 `worker/server/services/animation.service.ts`（`listTimeline`/`getMgrState` のみ）+ `services/helpers/animElementType.ts`。
  - `worker/shared/WorkerCalls.ts`（`animListTimeline`/`animGetMgrState` 行）。
  - `types.ts`（`AnimElement`/`AnimMgrState`/`AnimTimeline`/`AnimElementType` 追加。旧 3 interface は**まだ消さない**、共存）。
  - 新規 `hooks/useAnimTimeline.ts`（fetch + SEM_ANIM 購読）。
  - `components/panels/AnimationPanel.tsx`（strip 描画パスを追加、`animation` prop と並行に `sceneId` 経由の実データを試験表示。feature flag or 条件分岐）。
  - `_variables.css`（`--anim-*` token）、`_animation-panel.css`（strip/lane/ruler base）。
  - `BottomPanel.tsx`（`AnimationPanel` に `cm`/`activeSceneId`/`activeMolViewId` を渡す。既に scope にある — 確認済み）。
- **完了判定**: scene に AnimObj が有る時、各要素が正しい時間位置・幅・type 色で strip 表示される。`npm test` の Phase 0 service test が green。`tsc -p tsconfig.web.json`/`tsconfig.node.json` pass。
- **degrade 検出テスト**: Phase 0 の service contract test を実装で green 化 + component render test（`listTimeline` の固定 fixture → strip の `left`/`width` が `absStartMs*pxPerMs` 等で算出される DOM 検証）。

### Phase 2: transport + scrub + 再生の実配線
- **目的**: playhead scrub と play/pause/stop を実 `goTime`/`start`/`pause`/`stop` に配線。3D view が実際に動く。mock のローカル rAF カウンタ削除。
- **触るファイル**: `animation.service.ts`（`goTime`/`play`/`pause`/`stop` 追加）、`WorkerCalls.ts`（行追加）、新規 `hooks/useAnimTransport.ts`（play 中 poll）、`AnimationPanel.tsx` transport を `FormButton`/`ButtonRow`/`SegmentField`/`SwitchField` へ置換、`_animation-panel.css`（`!important` override 除去）。catalog gap があれば form-kit に transport variant を先行追加。
- **完了判定**: Play で 3D view がアニメート、playhead が `elapsed` を追従、Stop で 0 へ。scrub drag-end で view が jump。`run_tritium` で起動し再生確認。
- **degrade 検出テスト**: transport contract test（Play ボタン → `invokeService('animPlay',{sceneId,viewId})`、scrub drag-end → `animGoTime` 1 回 commit、ドラッグ中は call しない）。

### Phase 3: 編集（move/resize/add/delete/reorder）
- **目的**: strip body drag = move、handle drag = trim、Add メニュー、delete、lane reorder を実 API へ。
- **触るファイル**: `animation.service.ts`（`setElementTime`/`addElement`/`removeElement`/`reorderElement` 追加、undo-txn）、`WorkerCalls.ts`、`AnimationPanel.tsx`/`AnimStrip.tsx`（gesture handling）、`AnimLabelColumn.tsx`（reorder drag, +/-/^/v）。
- **完了判定**: strip drag/trim が `start/end`（relative）に書き `resolveRelTime` で再描画。add/delete/reorder が SEM_ANIM 経由で UI 更新。undo/redo が効く。
- **degrade 検出テスト**: service contract test（`setElementTime` が `start<=end` で呼ばれること pre-clamp、`addElement` が `createObj(typeName)`+`append`/`insertBefore`+`timeRefName=prev.name`、`removeElement` が降順 index）。

### Phase 4: detail inspector（hybrid の編集面）
- **目的**: 選択要素の name/timing/type props を form-kit `FieldSection` で inline 編集（UXP modal の置換）。
- **触るファイル**: `animation.service.ts`（`setElementProp`/`setMgrProp`、typeProps 読み）、新規 `components/panels/anim/AnimDetailInspector.tsx` + per-type field groups、`WorkerCalls.ts`。inspector は collapsible drawer。
- **完了判定**: 各 subtype の固有 prop（angle/axis/endcam/mol/rend/...）が編集でき、start/duration 編集が end=start+dur へ反映。relative-to select で chain 変更。
- **degrade 検出テスト**: inspector → `setElementProp`/`setElementTime` の wire test、per-type field の条件描画 test。

### Phase 5: 仕上げ — mock 完全削除・token lint・両テーマ
- **目的**: 旧 keyframe モデルと SAMPLE_ANIMATION を完全削除、CSS 負債ゼロ化、両テーマ確認。
- **触るファイル**: `types.ts`（`Keyframe`/`AnimationTrack`/`AnimationData` 削除）、`data/alignmentData.ts`（`SAMPLE_ANIMATION` 削除）、`App.tsx`（`animation` state 削除、`sceneId`/`viewId` 配線へ）、`BottomPanel.tsx`（prop 整理）、`_animation-panel.css`（残 raw px/`--fs-*` を token/`.type-*` へ）。
- **完了判定**: `npm run lint:style` が baseline を増やさない。dark/light 両方で表示確認。旧 interface 参照が compile error で残っていない。
- **degrade 検出テスト**: 全 Phase の test が green を維持。E2E チェーン（§8）通過。

---

## 8. テスト方針

**vitest（`cd tritium/react-gui && npm test`）:**
- **worker-service contract test**（最重要、degrade 検出の核）: `animation.service.ts` の各 fn を mock `ctx`（fake `getAnimMgr().getAt` 等）で呼び、wire 形式を pin —
  - `listTimeline`: `size` 回 `getAt(i)`、各 `start.millisec`/`absStart.millisec`/`uid`/`name` 読み、playState num→str、`resolveRelTime` を try で包む。
  - `setElementTime`: `ctx.svc.createObj('TimeValue')` で tv 構築 → `e.start=tv`/`e.end=tv2` → `resolveRelTime`、undo-txn、`start<=end` pre-clamp。
  - `addElement`: `createObj(typeName)` → defaults → `timeRefName=prev.name` → `append`/`insertBefore`。
  - `goTime`/`play`/`pause`/`stop`: `View` 解決 + 正しい wrapper メソッド呼び。
- **hook test**: `useAnimTimeline` が mount で `invokeService('animListTimeline')` 1 回、`SEM_ANIM` で debounced refetch。`useAnimTransport` が play 中のみ poll、pause で停止。
- **component render test**: 固定 `AnimTimeline` fixture → strip DOM の位置/幅、type 色 class、selected/disabled state、playhead 位置、empty state。
- 原則: 内部実装ではなく **wire 形式 / service 名 / payload shape / call 順序** を pin（内部を入れ替えても test が pass する形）。不必要に類似 test を増やさない。

**E2E 検証チェーン**（`npm test` は worker/main を mock するので実 IPC は捕捉できない。最終確認は順に）:
1. `cd tritium/react-gui && npm test`
2. `npx tsc -p tsconfig.web.json --noEmit`（renderer）+ `tsconfig.node.json`（main+preload）
3. `cd build_scripts && task build_tritium`（electron-vite production bundle — bundler 依存解決を catch）
4. `cd build_scripts && task run_tritium` で起動、`launch worker OK` → `INITIALIZED` → `bindCanvas` → `shader program created OK` を確認し、AnimObj を持つ scene で **strip 表示 → Play で 3D アニメート → scrub** を手動確認。

> **host 依存の注意（MEMORY）**: commit/push は user の別 host(uxp_gui) への同期にすぎず、E2E は host 側検証が要る。各 Phase 完了は user の verify-OK を待ってから次へ進む（勝手に「完了」判定して先行しない）。

---

## 9. リスク・未確定事項・要ユーザー確認ポイント

**C++ API 不足/挙動由来のリスク:**
- **`AnimMgr.length` 自動上書き**（`max(absEnd)` で毎編集再計算、B.1）: ユーザー設定の length は内容超過時以外 silent に無視される。→ transport は length を **read-only/auto 表示**、length フィールドは出さない（Blender 同様 End≈length）。active range band は常に内容に密着。
- **`start>end` 自動 clamp**（C++ silent、B.2）: resize で反対端が勝手に動く。→ renderer 側で pre-clamp（バー反転防止）。service test で `start<=end` を assert。
- **`resolveRelTime()` が cyclic/missing ref で throw**: → worker で try/catch、`ok:false`+理由を surface（worker crash 禁止）、該当要素を inspector で red flag。
- **位置変化イベント無し**（B.5）: 再生 playhead は poll 必須。→ ~15Hz、pause/stop で停止（leak 防止）。playhead は readout なので軽微な lag 許容。
- **bulk JSON 無し**（B.6）: refresh は N+ getter loop。→ cache + SEM_ANIM debounce(30ms) のみで refetch、per-frame では読まない。
- **type getter 無し**（B.2）: `classNameToType` heuristic。fragile な場合 type→色/icon/fields が degrade。→ 1 helper に集約、fallback `'unknown'` lane 色。

**未確定事項（勝手に決め打ちしない、要ユーザー確認）:**
1. **`playState` 数値 enum の並び**: wrapper は `number` を返す。0/1/2 → stop/play/pause の対応を `AnimMgr.qif`/C++ enum 宣言で要確認（briefs の文字列前提は wrapper 型と不一致）。
2. **detail inspector の置き場**: bottom panel は横長低背。inline 3 列目（collapsible drawer）か RightPanel 寄せか。→ Phase 4 着手前に UX 確認。本計画は collapsible drawer をデフォルト案とする。
3. **mutator の返り値設計**: 各 mutator が refreshed `AnimTimeline` を返すか、`{ok}` のみ返して SEM_ANIM refetch に一本化するか。→ 本計画は後者（event 駆動の単一 source）を採用するが、optimistic UI の体感が悪い場合は前者へ。
4. **UXP parity の取捨**: 
   - `startcam`/`camerasel`（開始カメラ選択）: UXP にあるが初期スコープに入れるか。→ 初期は inspector の startcam 表示のみ、編集は後続。
   - **自動 chain**（新規要素を前要素へ `timeRefName` で連結）: UXP 既定。Blender strip 流儀は絶対配置が自然。→ UXP parity で自動 chain を採るが、inspector で "detach to absolute"（`timeRefName=''`）を提供。要 UX 確認。
   - `MolAnim`/`MorphMol` 連携（`morphanim-tool` 由来の morph fraction 0..1）: morph 元 object 生成フローは別機能。→ 初期は既存 `MorphMol` への bind 編集のみ、生成は対象外。
5. **movie render（POV-Ray + ffmpeg、A.6）**: **明確にスコープ外**。Electron 環境では subprocess pipeline（ProcessManager/POV-Ray/ffmpeg）の全面再設計が必要。`fps` フィールドは将来の `setupRender(start,end,fps)` と前方互換だが本計画では未実装。別ワークストリーム/別 ADR。

**スコープ境界の明示**: 本計画は **interactive timeline + live transport + 要素編集** に限定。offline render は除外。

---

## 10. ADR の要否 / mapping 更新方針

**ADR を作る（推奨: `ADR-0029-anim-timeline-strip-model.md`）。** 理由（CLAUDE.md の ADR 起票基準に複数該当）:
- keyframe モデル → time-ranged strip モデルへの**根本的データモデル転換**という大きな設計判断（200 字を超える rationale）。
- 複数の known issue（length 自動上書き / start>end clamp / 位置イベント無し→poll / type getter 無し→class 名導出 / rel-abs duality の UX）を記録すべき。
- 1 つの mapping 行に **複数 phase・複数の独立判断**（UI パラダイム選定、worker service 設計、UXP parity 取捨、render スコープ外し）が並ぶ。

ADR に記載すべき内容:
- **採用パラダイム**（VSE strip body + Timeline header + Dope-Sheet left list の hybrid）と 3 提案（nle-strips/dopesheet-keyframes/hybrid）からの選定理由。
- **C++ データモデル適合性の論証**（strip = AnimObj の 1:1、duration first-class、新 capability 不要）。
- **rel-abs duality の UX 戦略**（abs で描き rel で編集、chain 露出方法）。
- **known issues**（上記 §9 リスク）と緩和策。
- **スコープ外**（offline render）の明記。

**mapping 更新（`docs/migration/mapping/panels.md`）:**
- AnimationPanel の該当行を更新: `Mapping: split`（timeline UI + worker service + detail inspector に分割）、`Status: todo → wip`（Phase 1 着手時）、`ADR: [ADR-0029](../adr/ADR-0029-anim-timeline-strip-model.md)`、`Notes:` は 1–2 文要約 + ADR リンク（"keyframe mock を time-ranged strip timeline へ全面再構築。worker service 新規。詳細 ADR-0029"）。
- phase 単位の細かい進捗が要る場合は inventory ではなく **mapping 側に補助セクション/詳細表**を追加（§ Phase 表）。
- `docs/migration/adr/_index.md` に ADR-0029 行を 1 行追加。
- `docs/migration/mapping/_index.md` の category counts と In Progress リストを status 変更のたびに更新。
- `_template.md` をコピーして ADR-0029 を起票。

---

### この計画の核（一行）

CueMol の `AnimObj` は **時間範囲オブジェクト**なので、Blender **VSE strip** を body・**Timeline** header・**Dope-Sheet** left list に組んだ hybrid timeline を採用し、keyframe mock を全廃。全操作は既存 wrapper（`getAt`/`start`/`end`/`absStart`/`resolveRelTime`/`goTime`/`start`/`append`/`removeAt` — 全て存在確認済み）に backing され、C++ 側へ新規 capability を要求しない。

### 主要ファイル（全て絶対パス）

- 新規 service: `/Users/user1/proj64/cuemol2_work2/tritium/react-gui/src/renderer/worker/server/services/animation.service.ts` + `helpers/animElementType.ts`
- 新規 hook: `/Users/user1/proj64/cuemol2_work2/tritium/react-gui/src/renderer/hooks/useAnimTimeline.ts`, `useAnimTransport.ts`
- ServiceMap: `/Users/user1/proj64/cuemol2_work2/tritium/react-gui/src/renderer/worker/shared/WorkerCalls.ts`（§6.2 行追加）
- 型: `/Users/user1/proj64/cuemol2_work2/tritium/react-gui/src/renderer/types.ts`（`Keyframe`/`AnimationTrack`/`AnimationData` 削除、`AnimElement`/`AnimMgrState`/`AnimTimeline`/`AnimElementType` 追加）
- UI: `/Users/user1/proj64/cuemol2_work2/tritium/react-gui/src/renderer/components/panels/AnimationPanel.tsx`（rewrite）+ 新規 `components/panels/anim/`（AnimTransport, AnimLabelColumn, AnimStripArea, AnimTimeRuler, AnimLane, AnimStrip, AnimPlayhead, AnimOverlapLayer, AnimDetailInspector + per-type field groups）
- CSS/token: `/Users/user1/proj64/cuemol2_work2/tritium/react-gui/src/renderer/styles/_animation-panel.css`（rewrite）, `styles/_variables.css`（`--anim-*` token）
- 配線: `/Users/user1/proj64/cuemol2_work2/tritium/react-gui/src/renderer/components/panels/BottomPanel.tsx`, `App.tsx`, `data/alignmentData.ts`（`SAMPLE_ANIMATION` 削除）
- 確認済み参照: `Scene.getAnimMgr()`（`tritium/core/src/wrappers/Scene.ts:267`）、wrappers `AnimMgr/AnimObj/SimpleSpin/CamMotion/ShowHideAnim/SlideInOutAnim/MolAnim/RealPropAnim/RendXformAnim/NoopAnimObj/TimeValue`（全存在）、`ctx.svc.createObj`（`WorkerService.ts:127`）、`useCueMolEventListener`（hook）、`SEM_ANIM = 0x0100`（`event.ts:13`）
- ADR: `/Users/user1/proj64/cuemol2_work2/docs/migration/adr/ADR-0029-anim-timeline-strip-model.md`（新規）、mapping: `docs/migration/mapping/panels.md`, `docs/migration/mapping/_index.md`, `docs/migration/adr/_index.md`

> 注: `AnimMgr.playState` wrapper は `number` を返す（briefs の文字列前提は誤り）。worker で 0/1/2 → `'stop'|'play'|'pause'` へマップするが、数値の正確な並びは C++ enum 宣言で要確認（§9 未確定 #1）。
