# 分子の既定の色分け (Okabe-Ito パレット)

読み込んだ分子に最初に付く色分け (MolCoord の `coloring` に入る PaintColoring) の仕様。
UXP の `createDefPaintColoring` は helix / sheet / nucleic / coil を固定の 4 色
(SteelBlue / khaki / yellow / FloralWhite) で塗っていた。tritium はこれを、色覚の多様性に
配慮したパレットから分子ごとに 1 色を割り当てる方式に変えた。

実装: `tritium/react-gui/src/renderer/worker/server/services/helpers/defPaintColoring.ts`
(`createDefPaintColoring`)。呼び出し元は 2 つ:

- 分子を新しく読み込んだとき (`molPostProc`)
- coloring パネル / renderer メニューの Paint coloring -> Default (`applyColoring.ts` の `paint-type-paint`)

## 色の決め方

- パレットは `data/default_style.xml` の named color `palette_1` .. `palette_7`。値は
  Okabe-Ito (Color Universal Design) の 8 色から黒を除いた 7 色:
  orange `#E69F00`、sky blue `#56B4E9`、bluish green `#009E73`、yellow `#F0E442`、
  blue `#0072B2`、vermillion `#D55E00`、reddish purple `#CC79A7`。
- scene の中で n 番目の分子 (MolCoord と `*Mol` の object を uid 順、つまり読み込み順に
  数える) が `palette_n` を主色にする。8 番目以降は先頭に戻る。同じ分子に Default を
  付け直しても同じ色になる。
- 各構造の色は主色に NamedColor の修飾子を付けたもの (`DEFAULT_PAINT_ENTRIES`):

  | sel | 色 | 意味 |
  |---|---|---|
  | `sheet` | `palette_n{mod_h:15;mod_s:-0.15}` | 色相 +15 度、彩度を少し下げる |
  | `helix` | `palette_n{mod_h:350}` | 色相 -10 度 |
  | `nucleic` | `palette_n` | 主色そのまま |
  | `*` (coil など) | `palette_n{mod_s:-0.6;mod_b:0.1}` | 白っぽくする |

  helix と sheet は形が違うので、近い色でも見分けられる。coil は白背景でも陰影で見える。

修飾子の注意: 色相のずらしは正の値で書く (-10 度は `350`)。C++ の `decodeModSet` は色相を
`fmod` で 0-1 に戻すので、負の値は負のまま残り、`HSBtoRGB` が正しい色を返さない。
彩度と明度は 0-1 に丸められるので、はみ出しても構わない。

## scene への色の複製

paint は `palette_n` を名前で参照する。名前の解決先を全体 (global) の定義だけにすると、
この名前を持たない古い CueMol / UXP 版で qsc を開いたとき解決できず、半透明の灰色になる。
そこで paint を作る前に `ensureScenePalette` が、scene に無い `palette_*` を、全体の定義の
値 (hex) で scene の書き込み可能な style set (`ensureWritableSceneSet`。無ければ
`default` を作る) に `setColor` で定義する。

- scene に同じ名前の定義がすでにあれば上書きしない。ユーザーが scene 内で変えた色や、
  開いた qsc の色はそのまま残る。
- 外部ファイルを参照しない style set は `Scene::stylesWriteTo` が qsc に埋め込む。qsc には
  パレットの定義 (`<styles id="default"><color id="palette_1" value="#E69F00"/>...`) と、
  それを参照する paint (`<paint sel="helix" color="palette_1{mod_h:350}"/>`) の両方が入る。
- 名前は scene の定義が全体より優先して解決される。全体の値を後から変えても、保存済みの
  図の色は変わらない。scene のパレットを書き換えれば (`define_color palette_1, ...`)、
  その scene の分子がまとめて塗り変わる。

修飾子付きの名前は保存と読み込みで保たれる (`NamedColor::toString` が
`名前{修飾子}` を書き出す)。保存 -> 開き直し -> 再保存で paint と color の行が変わらず、
開き直す前後の描画が一致することを確認している。

## 既知の制約

- MolCoord (Object) には style を当てる仕組みが無い (`applyStyles` は Renderer のみ)。
  そのため paint の組み立て自体は TS に残り、色の値だけを style から読む。
- 修飾子の値 (色相・彩度・明度のずらし量) は TS の `DEFAULT_PAINT_ENTRIES` にあり、
  style からは変えられない。
- パレットを別のセットに入れ替える GUI は無い。構想は
  [`../plans/261027-palette-set-switch-plan.md`](../plans/261027-palette-set-switch-plan.md)。
