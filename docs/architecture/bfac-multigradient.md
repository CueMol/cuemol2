# B-factor の多色グラデーション (`BfacColoring` の `multi_grad`)

`BfacColoring` (B-factor / occupancy / 中心からの距離で色を付ける) が、既存の多色グラデーション
`qsys::MultiGradient` を持つ。node が 2 つ以上あれば原子をそのグラデーションで塗り、無ければ今までの 2 色の
ramp (`lowcol` / `highcol`) で塗る。きっかけは AlphaFold のモデルを pLDDT で ChimeraX と同じ色に塗ること。
tritium 側 (op・Color pane・AlphaFold への適用) の残りは
[`../plans/261107-bfac-multigradient-plan.md`](../plans/261107-bfac-multigradient-plan.md)。

## 1. `BfacColoring` (`src/modules/molstr/BfacColoring.{hpp,cpp,qif}`)

- `property object<MultiGradient$> multi_grad => redirect(getMultiGrad, xxx) (readonly);`。名前と宣言は、地図の
  renderer・分子表面の renderer が持つ `multi_grad` と同じ。
- **node の値は絶対値** (B-factor そのもの。`mode` が `occ` なら occupancy、`center` なら距離)。地図・表面の
  multi-gradient と同じ意味。グラデーションで塗るときは `auto` と `lowpar` / `highpar` は使わない
  (これらは 2 色の ramp のもの)。範囲の外は端の node の色 (`MultiGradient::getColor` のまま)。
- **node が 2 つ未満なら 2 色の ramp** (`isMultiGrad()`)。既定は node 無しなので、既存の scene・style・PyMOL の
  `spectrum b` の色は変わらない。
- 役割の境界 (将来「スカラー値 -> 色」を抽象化して差し替えられるように):
  - `BfacColoring` は「原子から値を取る」まで (`getParam`)。値から色への変換は `MultiGradient::getColor(value)` に
    任せ、B-factor や pLDDT の知識は `MultiGradient` に入れない。
  - 「node が空なら 2 色」の判断は `BfacColoring` の側。`MultiGradient` の空のときの挙動 (黒) は変えていない。
  - 色の計算の経路に、親の renderer の参照・変更の通知・undo を持ち込まない (それらは node を編集する経路
    (`copyFrom`) だけ)。
- copy コンストラクタ (`cloneable`) は node を深くコピーする。style から作った coloring どうしや、clone した
  coloring どうしで node を共有しない。

## 2. 2 段の入れ子の通知 (`qlib::LScrObjBase::setupParentData`)

`multi_grad` は renderer -> `coloring` -> `multi_grad` の 2 段の入れ子になる。地図・表面は 1 段 (renderer 直下)。

入れ子の object property は、親が `setupParentData(propname)` で「root の uid」と「root からの名前」を渡すことで、
変更 (`nodePropChgImpl`) を root に届け、undo の記録 (`PropEditInfoBase` が名前を `NestedPropHandler` で辿る) が
対象を見つける。これまでは:
- 名前を区切り無しで連結していた (`m_thisname + propname`)。1 段なら親の名前が空なので問題が無かった。
- 孫には伝えていなかった (`// TO DO: travarse into the child properties`)。

`BfacColoring` は自分の `multi_grad` を自分のコンストラクタで設定するが、そのときはまだ renderer の property
ではないので、root の uid が無効のまま残り、node を変えても renderer に届かず undo も効かなかった
(gtest で確認: 名前は `multi_grad`、root の uid は 0)。そこで:

- **名前は `.` 区切り**: 親の名前が空でなければ `親.propname`。`NestedPropHandler` (undo) と
  `StyleSheet::resolve3` が既に `.` 区切りのパスとして読んでいる。root (renderer など) の名前は空なので、既存の
  1 段の名前 (`multi_grad`、`section`、`helix` など) は変わらない。
- **`parentDataChanged()`** (protected virtual、既定は何もしない): `setupParentData` が子に root と名前を渡した
  直後に、子のこれを呼ぶ。`BfacColoring` はここで自分の `multi_grad` に `setupParentData` し直す。孫を持つ
  クラスだけが自分で伝える形で、全 property を辿る一般の traversal はしない。

結果、`multi_grad` の名前は `coloring.multi_grad`、root は renderer になる。node を変えると renderer に
parent 名 `coloring.multi_grad` のイベントが届き、`MolRenderer::propChanged` (`coloring.` で始まる parent 名で
表示のキャッシュを捨てる、既存) が色を作り直す。undo / redo も 1 段の場合と同じく効く。

style と qsc: どちらも `coloring` を XML の節点から作り (`LDom2Node::convToVariant` -> `readFrom2`。
`MultiGradient::readFrom2` が `<gradnode par="値"><col>色</col></gradnode>` を読む)、`setPropertyImpl` ->
`setPropHelper` -> `setupParentData("coloring")` で設定するので、`parentDataChanged()` を通る。

## 3. テスト (`src/tests/modules/molstr/test_bfac_coloring.cpp`)

- node が無ければ今の 2 色、あれば node の間の補間と端の色 (ChimeraX の pLDDT の colormap で 60 と範囲外)。
- renderer の coloring にしたとき、`multi_grad` の名前が `coloring.multi_grad`・root が renderer で、node の変更が
  その parent 名のイベントとして renderer に届き、undo / redo できる。`parentDataChanged()` を空にすると落ちる
  ことを確かめてある。
- qsc の保存 -> 読込 (`readFrom2` + `reapplyStyle`) で node が残り、copy した coloring は node を共有しない。
