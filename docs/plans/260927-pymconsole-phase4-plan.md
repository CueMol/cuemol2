# pymconsole Phase 4 (実装済みコマンドの見落としの修正)

Status: **実装済み**。上位 1-5 は #647、6-10 とその他は #648。見送った 3 件のうち 2 件は #649。
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

## 実装したもの (6 以降)

6. `load x.pse` (C++ の `psefile` scene reader で開く) / `load x.pml` (スクリプトとして実行) / URL
   (`streamLoadFromUrl`、reader は拡張子から)。`1crn.pdb.gz` の object 名は `1crn`。
7. `fetch type=2fofc|fofc` (Get PDB と同じ `streamLoadDensityMap`、URL は `worker/shared/pdbUrls.ts`
   `pickMapUrl` に移した) と `type=pdb1..` (生物学的集合体)。構造因子の無い entry の 404 は理由付きで返す。
8. `png` は幅か高さの片方だけなら view の縦横比を保つ、`ray=1` は umbreon。`save` は `.png` / `.pqr` /
   `.pov` / `.stl` も書く。
9. `delete` / `enable` / `disable` / `set_name` が renderer 名と named selection も扱う (`namedSelections.ts`)。
   `delete all` は named selection も消す。
10. `distance` の `cutoff` / `mode=0,2,3` は `analyzeInteractions` で原子の組ごとの label (分子をまたいでも可)。
    mode 1 / 5-8 は拒否。

ほか: `set` / `get` / `unset` の対象に renderer 名と `view`、色の property は PyMOL の色名と `[r,g,b]`。
`spectrum` の空白区切り palette、`view` の action の略記。

## 見送ったもの

- `spectrum` の chain ごとの rainbow: **対象外**。PyMOL でも `spectrum` の式ではなく `util.chainbow`
  の機能。CueMol 側は `RainbowColoring` の `mode=chain` で描けるので、`util.chainbow` を扱うなら使える。
- chain 付きの `fetch 1abcA`: **実装済み (#649)**。読込後に指定 chain 以外を `deleteMolAtoms` で消す
  (PyMOL `importing.py` と同じく object 名は `1abcA`、chain が無ければ `no such chain`)。
- `get_names enabled_only`: **実装済み (#649)**。object は scene tree の `visible` で絞る。named
  selection は表示状態を持たないので絞らない。
