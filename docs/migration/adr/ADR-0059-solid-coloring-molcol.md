# ADR-0059: Solid coloring は分子経路を通す ($molcol を Paint と一致させる)

- Status: accepted
- Date: 2026-09-10
- Mapping rows: [`panel.coloring.shell`](../mapping/panels.md#panelcoloringshell),
  [`panel.coloring.deck.solid`](../mapping/panels.md#panelcoloringdecksolid)

## Context

Coloring panel で surface renderer を **Solid coloring** にして色に `$molcol`
(色ピッカーの「Mol」) を指定しても、分子の色にならず半透明の灰色になる、という報告
(v2.3.13.523)。あわせて、**dsurface / dsurf2 では Solid coloring を選んでも CPKColoring
のまま**になる、という報告も受けた。要件は「PaintColoring に (`*`, `$molcol`) を入れた
場合と、SolidColoring で `$molcol` を指定した場合の挙動を同じにする」(UXP ではそうなって
いた)。

原因は 1 つで、tritium の `paint-type-solid` が UXP と違う 2 点にある。

**(1) `colormode` を "solid" に落としていた。** surface renderer の `colormode` は
どの着色経路を通るかを選ぶ。`solid` mode の `MolSurfRenderer::display`
(`src/modules/surface/MolSurfRenderer.cpp:195`) は原子を一切見ずに
`mesh.color(getDefaultColor())` と書くだけなので、ColoringScheme は無視され、
`$molcol` (C++ `gfx::MolColorRef`) は「分子に訊け」という参照でしかないため
`MolColorRef::getCode()` の fallback `0x7F7F7F7F` (灰色・α 0.5、`src/gfx/MolColorRef.hpp:66`)
で描画される。一方 `molecule` mode は `ColSchmHolder::getColor(pAtom)`
(`src/modules/molstr/ColoringScheme.cpp:66-`) を通り、

- SolidColoring: `getAtomColor` が常に false → `defaultcolor` に fallback
- PaintColoring: (`*`, `$molcol`) 行が hit → `$molcol`

のどちらも同じ `MolRenderer::evalMolColor(pRval, pMol->getColor(pAtom, false))` に合流する。
つまり **molecule mode なら両者は定義上同一** で、solid mode でだけ食い違っていた。

**(2) `resetProp("coloring")` で style 既定値に戻していた。** reset が復元するのは
*style が言う* coloring であって SolidColoring ではない。stock style は
`DefaultCPKColoring` (`<coloring type="CPKColoring">`) か `*Paint` preset の PaintColoring
なので、dsurface / dsurf2 (新規 renderer の既定 style が `DefaultCPKColoring`、
`worker/server/services/helpers/getDefaultStyleName.ts` の `default:` 分岐) では
「Solid coloring」を選ぶと CPK deck に戻っていた。これが 2 つ目の報告の正体。

UXP `Qm2Main.setRendColoring` (`uxp_gui/cuemol2/base/content/cuemol2.js:1047-1143`) は
molsurf を全 paint-type で `colormode="molecule"` に強制し、Solid では新規
`SolidColoring` を代入していた。tritium が `solid` に落とすようになったのは 889cb236 で
Inspector の "Coloring mode" 行を廃した際、panel から真の solid mode に到達させる経路を
Solid coloring に兼ねさせたため。

## Decision

`paint-type-solid` を UXP に揃え、**新規 `SolidColoring` を生成して代入し、
`forceMoleculeColormode` を通す** (既存の `applyObjColoring` をそのまま再利用。
CPK / Bfac / Rainbow / Paint と完全に同じ形になる)。`resetProp` と、
solid/molecule を選び分けていた `readColormodeValues` 分岐は削除。

加えて `setRendererDefaultColor` に 1 つの gate を足す: 書き込む色が
`MolColorRef` (= `$molcol`) で、かつ renderer が `colormode === "solid"` のときだけ
`forceMoleculeColormode` を先に呼ぶ。これは Solid coloring 経由で molecule mode に
入っていない renderer (新規作成直後・qsc 読込直後・Reset to default style 直後) から
Solid deck で直接 Mol を選んだ場合を塞ぐもので、**UXP からの deviation**。判定は
`isMolColorRef` / `readColormodeOrEmpty` (`coloring/colorTargets.ts`)。

適用範囲は type_name 判定ではなく `colormode` enumdef の capability probe に任せる
(23f1d43f の方針を踏襲)。結果として molsurf / isosurf / dsurface / dsurf2 が一律で
molecule 経路に入り、`colormode` を持たない renderer (cartoon 等) では
`forceMoleculeColormode` が no-op になる。

真の "solid" colormode (原子を見ない一色塗り) への経路は **Reset to default style**
(molsurf / isosurf の既定が `solid`)、isosurf は加えて DensityMapPane の「Solid color」。

## Consequences

- **要件が定義上成立する**: molecule mode では SolidColoring + `$molcol` と
  PaintColoring (`*`, `$molcol`) が `ColSchmHolder::getColor` の同じ合流点を通るので、
  同じ色になる。MolCoord object 側の coloring を変えれば両者とも追従する。
- **dsurf 系の Solid coloring が Solid になる** (CPKColoring に戻らない)。`*Paint` style
  (Woody 等) が付いた molsurf / cartoon 等でも同様。
- **Solid coloring は panel から真の solid mode へ行く手段ではなくなった**。
  molsurf の場合、Solid coloring 後は molecule mode なので `target` (Coloring mol) が
  効き、参照分子が未設定なら scene 先頭の MolCoord が自動選択される。真の solid mode が
  必要なら Reset to default style。この差は UI 上ほぼ見えない (どちらも一色塗りに見える)
  が、`$molcol` と Coloring mol セレクタの有無で区別できる。
- **参照分子の無い scene** (molsurf を単独で読み込んだ等) では molecule mode に入っても
  `target` が空のままになり、C++ が rebuild ごとに
  `MolSurfRend> object "-1" is not found.` を log する。描画は `defaultcolor` で行われる
  ので破綻はしないが、`$molcol` は灰色のままになる。UXP も同じ状態になる。
- undo ラベルが `Reset coloring` から `Change coloring` に変わった (他の paint-type と同じ)。
- C++ (`src/`) は無変更。UXP GUI 側の挙動にも影響しない。

## Notes

- 実装: `tritium/react-gui/src/renderer/worker/server/services/coloring/applyColoring.ts`
  (`paint-type-solid` case / `setRendererDefaultColor` / `forceMoleculeColormode` の docstring)、
  `coloring/colorTargets.ts` (`readColormodeOrEmpty` / `isMolColorRef` を追加)。
- UXP 参照: `uxp_gui/cuemol2/base/content/cuemol2.js:1047-1143`
  (`Qm2Main.setRendColoring`: `bChgColMode` → `colormode="molecule"`、
  `case "paint-type-solid": coloring = cuemol.createObj("SolidColoring")`)。
- C++ 参照: `src/modules/molstr/ColoringScheme.cpp:66-` (`ColSchmHolder::getColor`)、
  `src/modules/surface/MolSurfRenderer.cpp:195` (solid mode の flat 描画) /
  `:255-261` (molecule mode の `getColorMol`)、
  `src/modules/surface/DirectSurfRendererBase.cpp:165-177` (dsurf の
  `resolveVertexColor` → `ColSchmHolder::getColor`)、`src/gfx/MolColorRef.hpp:66`
  (灰色 fallback)、`src/gfx/ColCompiler.cpp:100` (`$molcol` → `MolColorRef`)。
- テスト: `__test__/rendererColoringService.test.ts` — 「fresh SolidColoring を代入し
  resetProp を呼ばない」「molsurf / isosurf / dsurface で molecule + SolidColoring」
  「`$molcol` は solid mode の molsurf を molecule に切替、通常色は切り替えない」。
  makeColor の mock は `$molcol` に対して `getClassName() === "MolColorRef"` を返す
  (C++ `ColCompiler` と同じ)。
- 関連: [ADR-0048](ADR-0048-multigrad-editor.md) (multigrad colormode)、
  23f1d43f (colormode の enumdef probe 化)、889cb236 (この挙動を入れた commit)。
