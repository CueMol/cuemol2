# ADR-0057: File-open の object class 判定と map の view ポリシー

- Status: proposed
- Date: 2026-09-01
- Mapping rows: [`overlay.fopen-renderopt`](../mapping/overlay.md), [`dialog.fopen-option`](../mapping/other_dlgs.md), [`dialog.setup-renderer`](../mapping/other_dlgs.md)

## Context

UXP の `fopen-renderopt-page` は、開こうとしている object の **C++ class**
(`cuemol.implIface(obj_type, "MolCoord")` / `implIface(..., "DensityMap")`) で
2 つの UI を出し分けていた:

- **MolCoord**: 原子選択 (Selection チェックボックス + `mol-selection-list`) を有効化し、
  view オプションは `Recenter view` チェックボックス 1 つ
- **MolCoord 以外**: 原子選択を無効化。さらに **DensityMap なら** `recenter-options` deck を
  index 1 に切り替え、radio 2 択にする
  ([`fopen-renderopt-page.xul:58-68`](../../../uxp_gui/cuemol2/base/content/fopen-renderopt-page.xul))

  | radio | 動作 (`renderer.js:181-196`) | 既定 |
  |---|---|---|
  | `Set map center` | `rend.center = view.getViewCenter()` (view は動かさない) | selected |
  | `Move view center` | `obj.fitView(view, false)` (map 全体に view を合わせる) | |

tritium 移植ではこの deck ごと落ち、判定も class ではなく **reader nickname → `FormatKind`**
の表 (`READER_NICK_TO_KIND`) に置き換わっていた。結果、実バグが 3 つ出ていた:

1. **map に原子選択が出る** — density map の reader は `ccp4map` / `mtzmap` / `brix` /
   `mmcifmap` / `qdfmap` / `xplormap` の 6 つあるが、表に載っているのは最初の 2 つだけ。
   残りは `FormatKind = 'unknown'` に落ち、`isMolFormat('unknown')` が `true` を返すので
   Selection + `MolSelList` が表示される
2. **map を開くと view が原点に飛ぶ** — `setupRenderer.recenterIfRequested` が
   `rend.getCenter()` を view center に入れるが、`MapRenderer::getCenter()` は map の
   **表示中心** (`m_center`) で、新規 renderer では既定の `(0,0,0)`。分子を表示中に 2Fo-Fc map を
   開くと構造から原点へ飛び、map も原点まわりの box しか描かない
3. **「view を動かさず map を持ってくる」手段が無い** — UXP の `Set map center` に相当する
   処理が load 経路に存在しない (`redrawMapCenter` service は Density map パネルの
   Redraw ボタン専用)

同時に cryo-EM map mode ([architecture/cryo-em-map-mode](../../architecture/cryo-em-map-mode.md))
で map kind の概念が入ったため、UXP の「常に `Set map center` が既定」は cryo-EM では不適切に
なっていた (EM map の ORIGIN 配置はカメラ位置と無関係なことが多い)。

## Decision

**判定を C++ class 名に戻し、UXP の deck を 3 択の `mapCenterPolicy` として復元する。**

- `worker/shared/objectClasses.ts` を新設し、worker 側に 2 箇所コピーされていた
  `NON_MOL_CLASSES` を一本化する。`isMolObjectClass(className)` /
  `isScalarMapClass(className)` を renderer 側の dialog からも import する
  (`worker/shared/` は既に dialog が `fileOpenTypes` / `mapHeader` を import している境界)。
  `FileOpenOptionDialog` には `getCompatibleRendererNames` 由来の `objType` が既に渡っており、
  `isMolFormat(formatKind)` は `objType` が空のときのフォールバックに降格する
- `RendererOptions` に `mapCenterPolicy: 'auto' | 'setMapCenter' | 'moveViewCenter'` を足す
  (既定 `'auto'`)。`RendererOptionsPane` は volume object のとき既存の
  「Center view on molecule after loading」switch を "View after loading" の
  `SelectField` に差し替える (`FileOpenOptionDialog` と `NewRendererDialog` の両方)
- `setupRenderer.recenterIfRequested` は volume object を skip する。view をどうするかは
  `services/map/emDefaults.ts` の `applyMapCenterPolicy(scene, obj, rend, policy)` が
  `loadObject` から load 後に決める:
  - `auto` → `isEmDensityMap(obj) ? 'moveViewCenter' : 'setMapCenter'`
  - `moveViewCenter` → `fitViewsToMap` (既存)
  - `setMapCenter` → `rend.center = <先頭 view>.getViewCenter()`
- `applyEmMapDefaults` (絶対 level) と view ポリシーの結合を解く。EM の初期 level は
  view をどうするかと無関係なので、従来の `&& renderer.centerView` gate は落とす

## Consequences

**得られるもの**

- brix / mmcifmap / qdfmap / xplormap の map でも原子選択が出なくなる。判定が C++ class に
  戻ったので、今後 reader が増えても表の更新漏れで壊れない
- 結晶 map を開いても view が動かず、map が現在の view 中心に出る (UXP と同じ)
- cryo-EM map は明示操作なしで map 全体が見える (UXP に無かった改善)
- どちらの挙動も明示的に選べる (owner 要望)

**コスト・制約**

- `RendererOptions` に必須フィールドが 1 つ増える。DTO なので optional にせず、
  既存の worker サービステスト 5 本のフィクスチャに 1 行ずつ足した
- **`setMapCenter` は scene の先頭 view の center を使う** (UXP は "current view")。
  load 経路には view id が渡らず、`redrawMapCenter` のように呼び出し側から受け取る形にも
  できない。single-view 前提の tritium では観測上同じだが、複数 view の scene では
  UXP と一致しない可能性がある逸脱として記録しておく
- `'auto'` の解決は **load 後** にしか行えない。ヘッダ probe (`probeMapHeader`) は
  `ispg` / `origin` / `nversion` を返すが `MapKindDetect` の label 判定は再現できないので、
  ダイアログ上で先読みして 2 択に畳む案は採らなかった

**未対応 (別作業)**

- `READER_NICK_TO_KIND` に brix / mmcifmap / qdfmap / xplormap が無いので、これらでは
  "Map type" / "Subsample" の format pane が出ない。Map type は reader 非依存だが
  Subsample は `ccp4map` 専用なので、format pane の粒度を変える話になる
- scene tree で **map renderer 行** を Focus すると同じ `rend.getCenter()` 経由で
  (0,0,0) に飛ぶ (`services/sceneTree/sceneOps.ts:118-125`)。object 行なら `fitView` で正しい

## Notes

- 実装: `worker/shared/objectClasses.ts` (新)、`worker/shared/fileOpenTypes.ts`
  (`MapCenterPolicy`)、`worker/server/services/map/emDefaults.ts`
  (`applyMapCenterPolicy` / `setMapCenterToView`)、`worker/server/services/file/loadObject.ts`、
  `worker/server/services/rend/setupRenderer.ts`、
  `dialogs/fopen-opt-dlgs/panes/RendererOptionsPane.tsx`、
  `dialogs/fopen-opt-dlgs/FileOpenOptionDialog.tsx`、`dialogs/NewRendererDialog.tsx`
- UXP 参照: `uxp_gui/cuemol2/base/content/fopen-renderopt-page.xul:58-68` (deck)、
  同 `.js:44-77` (`implIface` 出し分け) / `:283-289` (`center` / `redraw` の受け渡し)、
  `uxp_gui/cuemol2/base/content/renderer.js:181-196` (適用)
- UI: UXP は radiogroup だが、ラベルが長く `RadioField` だと折返しが汚いこと、同じ pane の
  他の選択行 (Renderer type / Map type / Subsample) が全て `SelectField` であることから
  dropdown を採った (ui-style-guide の「`SelectField` = 一覧を畳みたいとき」)
- テスト: `__test__/emMapDefaults.test.ts` (policy の 3 分岐 + 非 DensityMap の no-op)、
  `__test__/setupRendererService.test.ts` (volume object を recenter しない)、
  `__test__/fileOpenOptionDialog.test.tsx` (brix で Selection 非表示 / policy の受け渡し)
- 関連: [architecture/cryo-em-map-mode](../../architecture/cryo-em-map-mode.md)、
  [ADR-0046](ADR-0046-preset-renderer.md) (`RendererOptionsPane` の共有)
