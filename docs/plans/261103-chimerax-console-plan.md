# ChimeraX 互換 console (ChX console) の残りの計画

ChX console (console plugin の ChimeraX dialect) の基盤と基本コマンドの仕様は
`docs/architecture/console-chimerax-dialect.md` にある。dialect の一覧と `DialectSyntax` は
`docs/architecture/op-catalog.md` §5。ここには、まだ実装していないコマンドと、その実装に要る CueMol 側の機能を残す。
ChimeraX のソースは `~/ext/ChimeraX/src/bundles/`。

## 1. 後続のコマンド拡充

コマンドを 1 つ足すときに触るのは次の 3 つだけ:

- `commands/<領域>.ts` の追加
- `registry.ts` への 1 行
- 必要ならテスト 1 件

op が足りなければ、先に catalog へ op を足す (`docs/architecture/console-chimerax-dialect.md` §1)。その op は MCP / agent / native console でも使える。

候補と、調査で分かったことを下に残す。

**CueMol の既存機能で実装できるもの**

| 候補 | ChimeraX の意味 | CueMol での実装 |
|---|---|---|
| `view matrix camera` (12 数値) | 3x4 行優先で、列 0-2 が camera の軸、列 3 が位置。camera は -z を向く。既定は透視投影で水平 FOV 30° | `center = t + d·v`、`rotation = quat(Rᵀ)`、`zoom = 2·d·tan(15°)/aspect` |
| `zoom pixelSize p` | cofr (表示中の bbox 中心) での Å/px が p になるよう、camera を視線方向に動かす | center を固定して `distance` と `zoom` を比例で変える |
| `save x.png` | 既定サイズは view のサイズ。`supersample` は jitter AA | `export_image` op。CueMol は常に supersample するので、`supersample` は受け付けて無視する |
| `graphics silhouettes` | view 全体の輪郭線 | `chx:` renderer の `egtype=silhouette`。impostor で効くかは要確認 |
| `color` の `bychain` / `bymodel` / `random` / `fromatoms` など、`rainbow`、色の `rgb()` / `hsl()` | | paint entry、`RainbowColoring` |
| `cartoon suppressBackboneDisplay`、backbone を隠す規則 | cartoon 表示中の残基では N / C / O を隠す。CA は側鎖が表示されていれば残す (molc.cpp:1450) | stick の sel から差し引く |
| `open` 直後の auto style (small polymer) | model 色 (#1 は tan) と元素色、ligand とその 3.6 Å 以内の残基を stick、金属は sphere | |
| `turn` / `move` / `cofr` / `select` / `surface` / `transparency` / `label` / `set bgColor` / `info` / `distance` / `align` / `matchmaker` / `name` / `alias` | | |
| atom spec の zone / 属性 test / submodel | | |
| 複数 object の範囲に fit する公開 op (`fit_view`) | | `targets: { objId, selection? }[]` の構造化した引数の種類を catalog に足し、MCP の schema・native console の引数変換・selection の検査・qax の記録 (objId を再解決できる形) を揃える |
| 非表示の原子の style の保持 (`console-chimerax-dialect.md` §5 の制約) | `hide` しても style を覚えていて、`show` で元の style に戻る | style ごとの原子集合を、scene の名前付き selection に保存する (`define_selection` op) |

**CueMol 側の機能追加が先に要るもの**

| 候補 | CueMol の現状 | 必要な実装 |
|---|---|---|
| `lighting` (preset、光源の強度、`shadows`、`multiShadow` AO、depth cue) | 光源は shader に hard-code されている。影は無く、AO は画面空間の GTAO だけ。fog は常に on で、開始位置を動かせない | 光源の uniform 化と property 化、shadow map、多方向 shadow による AO、fog の property 化 |
| `windowsize w h` | canvas の大きさは DOM の layout だけで決まり、View の `width/height` は読み取り専用 | 3D 領域を指定の px にする renderer -> main の IPC |
| `clip near/far/position` | `center` を中心とした対称な `slab` が 1 つあるだけ | View に near / far の offset を独立して持たせる (C++ `GUIView::computeSlabPlanes`) |
