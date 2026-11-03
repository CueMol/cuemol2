# selection 式の簡単化 (構文木の同値変換)

selection の式を、今の式を文字列のまま包んで次の式を作る箇所がある (`(今) or (項)`、`(今) and not (項)`)。
そのままでは操作を重ねるたびに式が伸びるので、C++ の selection の構文木に意味を変えない書き換えを繰り返し、
再コンパイルできる文字列に戻す。別のデータは持たないので、scene 保存・undo / redo・GUI での編集との兼ね合いは変わらない。

実装:
- C++: `src/modules/molstr/SelSimplifier.{hpp,cpp}`、`SelCommand::simplify` / `invertSimplified` / `toggleSidechain` / `rewriteAround` (`SelCommand.qif` で公開)
- TS: `tritium/react-gui/src/renderer/worker/server/services/helpers/simplifySel.ts`、service `simplifySelection`

テスト: `src/tests/modules/molstr/test_sel_simplify.cpp`。

## 1. 書き換え規則

構文木 (`SelNodes.hpp`) を n 項の形に読み、次を変化がなくなるまで繰り返す。どれも選ばれる原子を変えない。

1. 同じ演算子の入れ子を平らにする: `(A or B) or C` -> `A or B or C`
2. 定数のたたみ込み: `A and *` -> `A`、`A or none` -> `A`、`A and none` -> `none`、`A or *` -> `*`、`not not A` -> `A`
3. 重複の除去 (演算の順序は問わない)
4. 補元: `A and not A` -> `none`、`A or not A` -> `*`
5. 吸収: `A or (A and B)` -> `A`、`A and (A or B)` -> `A`
6. 補元を使った吸収: `(A or B) and not B` -> `A and not B`、`(A and not B) or B` -> `A or B` (双対も同じ)
7. 共通部分と補元の併合: `(R and not S) or (R and S)` -> `R` (双対も同じ)
8. 同じ種類の葉の併合 (`or` の下):
   - `resn` / `name` / `chain` / `elem` / `alt` の名前の並び: `resn ALA or resn GLY` -> `resn ALA,GLY`
   - `aid` の範囲: `aid 5 or aid 9 or aid 1:3` -> `aid 1:3,5,9`
   - `resi` の範囲、`A.12.*` 形式 (chain と原子名が同じもの): `A.12.* or A.13.*` -> `A.12,13.*`
9. byres 系を重ねても同じ: `byres byres A` -> `byres A` (`bymainch`、`bysidech` も)

- 名前の並びの併合が同値なのは、並びの各要素が独立に照合されるため (`SelNamesNode::matches` / `isAtomSelected`)。
- 残基番号の範囲は `RangeSet<ResidIndex>` の和として扱い、**隣り合う番号をつながない**。
  `resi 12:13` は insertion code 付きの `12A` も含む (終端が `(13, c+1)`、`ResidIndex` は番号の次に insertion code で比べる) ので、
  `12` と `13` をつなぐと元の式に無い原子を選んでしまう。
- 一般の分配法則 (展開) と、種類の違う葉の包含関係 (`resn ALA` が `protein` に含まれるか) は扱わない。
  `around` / `expand` などの距離を使う演算子、名前付き参照、比較、property は、中身だけ簡単にして 1 つの葉として扱う。
  名前付き selection は後から定義が変わりうるので展開しない。
- console の `show` / `hide` / `style` の繰り返しは、規則 6・7 で伸びなくなる。ただし最短になるとは限らない
  (例: ChX の style の往復の後の `resn GLY and (ligand or resn GLY,ALA)` は、包含を見ないのでこれ以上縮まない)。

## 2. 同一性と書き戻し

- 部分木が同じかどうかは、型・値・子ノードから作る key で比べる (`and` / `or` の子の順序は問わない、数値は誤差の無い `%a`)。
  書き戻した文字列では比べない。小数 7 桁目だけが違う 2 つの `around` を同じものと見なさないため。
- 書き戻しは、selection の文法で読み直して同じ意味になる文字列にする。各ノードの `toString()` も同じ方針に揃えた:

  | ノード | 書き方 |
  |---|---|
  | 数値 (`around` などの距離、`bfac` / `occ`) | 読み直して同じ値になる最短の小数 (`SelSimplifier::formatNumber`)。scanner は指数表記を読まないので使わない。小数点を必ず付ける (整数として読まれると桁あふれするため) |
  | `rprop` の値 | 引用符で囲む (`SelSimplifier::quoteValue`)。scanner は `\"` をそのまま残すので、値に含まれない方の引用符を使う |
  | 名前付き参照 | 名前そのもの (以前は `Ref(name)`) |
  | 空 | `none` (以前は `!*`)。空の名前は `null` (以前は `(empty)`) |

- `SelCommand::simplify` などは、書き戻した文字列を一度コンパイルし直し、失敗したら元の式を返す。
  直し漏れのノードがあっても、有効だった式を壊さない。名前付き参照を含む式は、その参照をコンパイルした scene で読み直す。
- `SelCommand::toString` は、打った文字列 (`m_origcmd`) をそのまま返す今の挙動のまま。

## 3. 簡単にする場所

式を**組み立てた**ところでだけ簡単にする。ユーザーが手で打った式は書き換えない (勝手に整形されると意外に感じるため)。

| 場所 | 対象 |
|---|---|
| `naviCtxAddSelect` (3D view の shift+クリック、context menu の Add select) | `(今) or (新しい項)` |
| `applySelectionHits` の追加モード (矩形選択・投げ縄選択) | 同上 |
| Selection Builder (`h3-kit/selection/SelectionBuilder.tsx` の `simplify` prop) | 既存の式と組み合わせた結果 (add / intersect / sub、単項の演算)。置き換え (`set`) は対象外。Selection パネルと MolSelList の popover が `useSelSimplifier` で service `simplifySelection` につなぐ |
| context menu の Invert / Toggle sidechain / Around (`naviCtxtMenu.ts`、scene tree の `selectObjectMol`) | 下記 |
| ChX dialect の `writeSel`、PyMOL dialect の `updateOwned` | renderer に書き込む前の式 |

context menu の 3 つは、構文木の根の形を見て操作する (以前は UXP 由来の正規表現で文字列を書き換えていて、
`!(A) or !(B)` の Invert が `A) or !(B` を返すなど、式の途中の `!(` / `bysidech` / `around` に反応していた)。

- **Invert** (`invertSimplified`): `not (今)` を作って簡単化する。規則 2 により、2 回でもとの式に戻る。選択が空なら `*`。
- **Toggle sidechain** (`toggleSidechain`): 根が `bysidech X` なら `X`、そうでなければ `bysidech (今)`。
- **Around** (`rewriteAround`): 根が `around` (と、それを包む `byres`) なら中身を取り出して距離を付け直し、そうでなければ `(今) around N`。
