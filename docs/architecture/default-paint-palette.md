# 分子の既定の色分け (パレットのテーマ)

読み込んだ分子に最初に付く色分け (MolCoord の `coloring` に入る PaintColoring) の仕様。
UXP の `createDefPaintColoring` は helix / sheet / nucleic / coil を固定の 4 色
(SteelBlue / khaki / yellow / FloralWhite) で塗っていた。tritium はこれを、パレットの
テーマから分子ごとに 1 色を割り当てる方式に変えた。既定のテーマは色覚の多様性に配慮した
Okabe-Ito。

実装: `tritium/react-gui/src/renderer/worker/server/services/helpers/defPaintColoring.ts`
(`createDefPaintColoring`)。呼び出し元は 2 つ:

- 分子を新しく読み込んだとき (`molPostProc`)
- coloring パネル / renderer メニューの Paint coloring -> Default (`applyColoring.ts` の `paint-type-paint`)

## テーマ

`data/default_style.xml` に、テーマごとに `<テーマ名>_<番号>` の named color で定義する。
色数はテーマごとに違ってよい。

| テーマ名 | 出典 | 色数 |
|---|---|---|
| `okabe_ito` (既定) | Okabe-Ito (Color Universal Design)、黒を除く | 7 |
| `tol_bright` / `tol_vibrant` | Paul Tol bright / vibrant | 7 |
| `tol_muted` / `tol_light` | Paul Tol muted / light | 9 |
| `brewer_set2` / `brewer_dark2` | ColorBrewer Set2 / Dark2 | 8 |
| `tableau10` | Tableau 10 | 10 |

どのテーマで塗るかは style の文字列データ `<palette id="default_paint" value="okabe_ito"/>`
で決まる (`getStrData('palette', 'default_paint', sceneUid)`)。scene の style set の定義が
あればそれ、無ければ全体の定義を使う。切り替えの GUI やコマンドは無く、手で書き換える:

- 全体の既定を変える: ユーザーの style ファイルに同じタグを書く。
- その scene だけ変える: scene の style set に同じタグを置く (qsc の `<styles>` 内)。

テーマ名に当たる色が 1 つも無いときは `okabe_ito` を使う。

テーマはこれから読み込む分子の塗り方だけを決める。テーマを変えても、塗り済みの分子は
そのまま。1 つの scene に複数のテーマの色が混ざってよい (色名がテーマごとに違う)。

## 色の決め方

- scene の中で n 番目の分子 (MolCoord と `*Mol` の object を uid 順、つまり読み込み順に
  数える) が、テーマの n 番目の色を主色にする。色数を超えたら先頭に戻る。同じ分子に
  Default を付け直しても同じ色になる。
- 各構造の色は主色に NamedColor の修飾子を付けたもの (`DEFAULT_PAINT_ENTRIES`):

  | sel | 色 (主色が `okabe_ito_2` の例) | 意味 |
  |---|---|---|
  | `sheet` | `okabe_ito_2` | 主色そのまま |
  | `helix` | `okabe_ito_2` | 主色そのまま |
  | `nucleic` | `okabe_ito_2{mod_h:15}` | 色相を +15 度ずらす |
  | `*` (coil など) | `okabe_ito_2{mod_s:-0.6;mod_b:0.1}` | 白っぽくする |

  helix と sheet は形が違うので同じ色にする。核酸は色相でずらす: 3D 表示では陰影
  (lighting / AO) がすでに明暗を変えているので、彩度や明度の差は「同じ色の陰」と区別
  されにくく、別の色として認識させるには色相の差が要る。5 度では見分けられず、15 度で
  分子の色の系統を保ったまま違いが分かる。coil は白背景でも陰影で見える。

修飾子の注意: 彩度と明度の修飾子は足し算で、結果は 0-1 に丸められる。同じ値でも主色の
彩度・明度によって効き方が違う (`mod_s:-0.6` は彩度 1.0 の orange を 0.4 の淡い色に、
彩度 0.63 の sky blue をほぼ灰白色にする)。色相の修飾子 (`mod_h`) は正の値で書く
(-10 度は `350`)。C++ の `decodeModSet` は色相を `fmod` で戻すので、負の値は負のまま残り、
正しい色にならない。

## scene への色の複製

paint は主色を名前で参照する。名前の解決先を全体 (global) の定義だけにすると、この名前を
持たない古い CueMol / UXP 版で qsc を開いたとき解決できず、半透明の灰色になる。そこで
paint を作る前に `ensureSceneColor` が、使う色の名前を、全体の定義の値 (hex) で scene の
書き込み可能な style set (`ensureWritableSceneSet`。無ければ `default` を作る) に
`setColor` で定義する。

- コピーするのはその分子が使う色だけ。scene に同じ名前の定義がすでにあれば上書きしない。
  ユーザーが scene 内で変えた色や、開いた qsc の色はそのまま残る。
- 外部ファイルを参照しない style set は `Scene::stylesWriteTo` が qsc に埋め込む。qsc には
  色の定義 (`<styles id="default"><color id="okabe_ito_1" value="#E69F00"/>...`) と、
  それを参照する paint (`<paint sel="nucleic" color="okabe_ito_1{mod_h:15}"/>`) の両方が入る。
- 名前は scene の定義が全体より優先して解決される。全体の値を後から変えても、保存済みの
  図の色は変わらない。scene の定義を書き換えれば (`define_color okabe_ito_1, ...`)、その色を
  使う分子がまとめて塗り変わる。

修飾子付きの名前は保存と読み込みで保たれる (`NamedColor::toString` が
`名前{修飾子}` を書き出す)。保存 -> 開き直し -> 再保存で paint と color の行が変わらず、
開き直す前後の描画が一致することを確認している。

## 既知の制約

- MolCoord (Object) には style を当てる仕組みが無い (`applyStyles` は Renderer のみ)。
  そのため paint の組み立て自体は TS に残り、色の値とテーマ名だけを style から読む。
- 修飾子の値 (色相・彩度・明度のずらし量) は TS の `DEFAULT_PAINT_ENTRIES` にあり、
  テーマによらず共通。淡いテーマ (`tol_light`、`brewer_set2`) では coil や核酸との差が
  小さくなる。
- テーマに灰色を含むもの (`tol_bright` / `tol_vibrant` の 7 番目など) は、その番目の分子が
  灰色になる。
- テーマを GUI から選ぶ機能は無い。構想は
  [`../plans/261027-palette-set-switch-plan.md`](../plans/261027-palette-set-switch-plan.md)。
