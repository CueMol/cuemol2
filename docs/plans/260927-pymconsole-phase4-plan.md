# pymconsole Phase 4 (実装済みコマンドの見落としの修正)

Status: **上位 1-5 実装済み** (`feat/pymconsole-phase4`、#645 の上)。6 以降は未着手。
関連: [Phase 3 計画](260926-pymconsole-phase3-plan.md)。

## 背景

`load x.qsc` が無かった (`save x.qsc` はあった) ことをきっかけに、実装済みの全 58 コマンドを
PyMOL 本体 (`~/ext/pymol-open-source/modules/pymol/`) と CueMol の service に照らして見直した。
単発のオプション不足より、多くのコマンドに共通する問題が大きかった。

## 実装したもの (上位 1-5)

1. **選択式の中の object 名** (`1abc and chain A`): 翻訳器が未知の語を CueMol の named selection 参照として
   素通ししており、`SelCompiler::checkNameRef` が `undefined reference` で拒否していた。
   `helpers.ts moleculeSelections` で分子ごとに翻訳し、object 名はその分子で `all`、他で `none` にする。
   式が object を名指ししていればその分子だけが対象。show / hide / as / color / select / indicate /
   count_atoms / label / 計測 / zoom / center / isomesh の carve / save / align が使う。
   `select` は object 名を含むと named selection としては保存しない (CueMol の named selection は
   分子を指定できない)。
2. **load / fetch が作る renderer を console のものにする**: `pym:<rep>` と名付け、直後の `hide lines` /
   `as` / `color` が効くようにした。`zoom=0` で中心を移さない。
3. **丸ごと隠した後の再表示**: 丸ごと hide するとき selection を `none` に空け、後の `show rep, sel` で
   隠した原子が戻らないようにした。`label` と `show labels` で label renderer を再表示、
   `hide labels, sel` はその原子の label を外す。
4. **show / hide の PyMOL 互換**: 引数無し (`hide` = everything、`show` = wire)、`hide everything` /
   `hide all` / `hide (sel)`、表現名の unique prefix (`stick` `cart`) と空白区切りの複数指定、
   `wire` / `licorice`、`show_as`。
5. **PyMOL の引数** (`quiet` / `async` / `file` など) を受け付け、load / png / align / super /
   count_atoms の位置引数の順番を PyMOL と揃えた。`align` / `super` の `transform=0` は RMSD だけ。

あわせて: 空の scene での `delete all` を成功扱い、`color` / `zoom` / `center` が分子の選択を
書き換えたままにする副作用の解消 (color は元に戻す、zoom は `fitView2`、center は中心だけ移す)。

## 未着手 (価値の高い順)

6. `load x.pse` (C++ の `psefile` reader) / `load x.pml` (スクリプト) / URL
7. `fetch type=2fofc|fofc|pdb1`
8. `png` の縦横比 (片方だけ指定) と `ray=1`、`save .png/.pqr/.pov/.stl`
9. `delete` / `enable` / `disable` / `set_name` での named selection と renderer 名
10. `distance` の `cutoff` / `mode=2`、分子をまたぐ計測

ほか: `set` / `get` が renderer / view を対象にできない (設定名 alias 拡充の前提)、`spectrum` の
空白区切り palette と chain ごとの rainbow、`view` の略記。
