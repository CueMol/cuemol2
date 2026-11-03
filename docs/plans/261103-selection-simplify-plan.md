# selection 式の簡単化 (構文木の同値変換) プラン

## Context

console の ChX dialect (`docs/architecture/console-chimerax-dialect.md`) と PyMOL dialect は、
表示状態を renderer の selection の式そのものとして持ち、`show` / `hide` / `style` のたびに
今の式を文字列のまま包んで次の式を作る (`(今の式) or (S)`、`(今の式) and not (S)`)。
式を評価し直したり簡単にしたりしないので、コマンドを重ねるたびに式が伸びる。ChX の `style` は
他の renderer の式を丸ごと写すので特に伸びる
(例: `(resn GLY) and (((((ligand) or (resn ALA)) and not (resn ALA)) or ...`)。

表示の結果は正しいが、GUI で selection を見ると読めず、評価の時間も少しずつ増える。

状態を別に持たずに式を短く保つため、C++ の selection の構文木に、意味を変えない書き換えを
繰り返して簡単にする処理を足す。別のデータを持たないので、scene 保存・undo / redo・
GUI での編集との兼ね合いは今のままになる。

## 1. 構文木 (`src/modules/molstr/SelNodes.hpp`)

コンパイルした selection は `SelSuperNode` の木で、どのノードも `clone()` と `toString()` を持つ。

| ノード | 中身 |
|---|---|
| `SelBinNode` | `and` / `or` |
| `SelOpNode` | `not`、`around` / `byres` / `expand` / `neighbor` / `extend` など |
| `SelAllNode` | `*` / `none` |
| `SelTermNode` | `resn` / `name` / `chain` / `elem` など |
| `SelRangesNode` / `SelResidNode` | `resi` の番号と範囲 |
| `SelRefNode` | 名前付き selection の参照 |
| `SelCompNode` / `SelPropNode` / `SelScriptNode` | 比較、property、script |

## 2. 書き換え規則 (どれも同値)

変化がなくなるまで繰り返す。

1. 同じ演算子の入れ子を平らにする: `(A or B) or C` -> `A or B or C`
2. 定数のたたみ込み: `A and *` -> `A`、`A or none` -> `A`、`A and none` -> `none`、`A or *` -> `*`、`not not A` -> `A`
3. 重複の除去: 同じ部分木 (`toString()` が等しいもの) を 1 つにする
4. 補元: `A and not A` -> `none`、`A or not A` -> `*`
5. 吸収: `A or (A and B)` -> `A`、`A and (A or B)` -> `A`
6. 同じ種類の葉の併合 (`or` の下):
   - `resn ALA or resn GLY` -> `resn ALA,GLY` (`name`、`chain`、`elem` も同じ)
   - `resi 1:10 or resi 5:20` -> `resi 1:20` (`RangeSet` で和をとる。insertion code 付きは別扱い)

扱わないもの:

- 種類の違う葉の包含関係 (`resn ALA` が `protein` に含まれるか) は、原子を評価しないと分からないので残す。
- `around` / `byres` / `expand` などの演算子、名前付き参照 (`SelRefNode`)、比較、script は、
  中身だけ簡単にして、ノード自体は 1 つの葉として扱う。名前付き selection は後から定義が変わりうるので展開しない。
- 葉の併合は、照合の仕方が同じもの (wildcard や大小の扱いが同じ) だけに限る。

## 3. 実装

- C++: `molstr` に簡単化の処理 (例: `SelSimplifier.{hpp,cpp}`) を足す。入力の木は変えず、簡単にした木を新しく作る。
- `SelCommand` に「簡単にした式を返す」メソッドを足し、`.qif` で公開する (`SelCommand.qif`)。
  libcuemol2 と tritium core の再ビルド、wrapper の再生成が要る。
- TS: ChX dialect (`plugins/chimerax-console/worker/display.ts`) の `writeSel` で、書き込む前に式を簡単にする
  (読み取り専用の補助なので、`eslint.config.mjs` の ChX の許可リストに helper を 1 つ足す)。
  PyMOL dialect (`plugins/pymol-console/worker/commands/repCommands.ts`) の `updateOwned` にも同じ処理を使える。

## 4. テスト

- gtest (`src/tests/modules/molstr/`):
  - 書き換え規則ごとに 1 件 (入力の式と、簡単にした後の `toString()`)。
  - 同値性: いくつかの式について、テスト用の分子上で、簡単にする前と後で選ばれる原子が同じであること。
- tritium: ChX の `show` / `style` を重ねても、`chx:` renderer の selection が入れ子にならず、
  打った spec の種類数程度の長さに収まること (1 件)。
