# B-factor の多色グラデーション (`BfacColoring` の `multi_grad`)

`BfacColoring` (B-factor / occupancy / 中心からの距離で色を付ける) が、既存の多色グラデーション
`qsys::MultiGradient` を持つ。node が 2 つ以上あれば原子をそのグラデーションで塗り、無ければ今までの 2 色の
ramp (`lowcol` / `highcol`) で塗る。きっかけは AlphaFold のモデルを pLDDT で ChimeraX と同じ色に塗ること。
tritium では op (`set_multigrad_nodes`)・Color pane の Multi-gradient deck・preset を、地図 / 表面の
multi-gradient と共通に使う。

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

## 3. op と worker service (`set_multigrad_nodes`、`services/coloring/multiGrad.ts`)

**どのグラデーションか**を呼ぶ側が言う。分子表面 (`molsurf` / `dsurface`) は renderer 直下の `multi_grad`
(地図・ポテンシャル用) と、`colormode="molecule"` で使う `coloring` (`BfacColoring` でありうる) の両方を持つ
ので、「直下に無ければ coloring の」という存在確認の順では、B-factor の編集を地図のグラデーションに書いてしまう。

- `resolveMultiGrad(scene, { rendId, targetKind, gradient })` (`colorTargets.ts`): `targetKind` (`renderer` /
  `object`。塗り分けなど他の deck と同じ `resolveColoringTarget`) と `gradient` (`renderer`: 自分の
  `multi_grad`、既定 / `coloring`: coloring の `multi_grad`)。`coloring` を指定して coloring が `BfacColoring`
  でなければエラー (別のものに黙って書かない)。object に `renderer` を指定してもエラー。
- `getMultiGradState` / `getMultiGradHistogram` / `setMultiGradNodes` の 3 つがこれを通る。
- `set_multigrad_nodes`: `rendId` (`nodeId` と `nodeType`。省略時は renderer)、`nodes`、`gradient` (省略時は
  `renderer`)。記録は既定の値を残さない (以前の記録 `rendId=..., nodes=...` はそのまま再生できる)。native
  console は名前で指定した対象の種類から `nodeType` を補う。
- **空の `nodes`** は「node を全部消す」(`BfacColoring` なら 2 色に戻る)。Multi-gradient deck の Delete all は
  空を書き、その記録は空文字列になる。以前は再生時に `no nodes given` で拒否していたので、受け付けるようにした
  (`parseMultiGradNodes('')` は空の配列)。
- **原子の値の統計とヒストグラム**: `gradient: 'coloring'` のとき、地図の密度の代わりに分子の原子の値
  (`MolCoord.getPropArray("bfac" / "occ")` を 1 回で読む) から、地図と同じ形の統計 (min / max / mean / sigma)・
  中央 95% の範囲・ヒストグラムを返す。距離のモード (`center`) は原子ごとの配列が無いので統計を出さない。

## 4. AlphaFold の pLDDT (style と取得)

- style `AlphaFoldPlddtColoring` (`data/cuemol3_style.xml`。CueMol3 だけ): `BfacColoring`、`mode="bfac"`、
  `auto="none"`、node は ChimeraX の `alphafold` colormap (`<gradnode par="0" col="#FF0000"/>` ... 0 赤、50
  オレンジ、70 黄、90 cornflowerblue、100 青)。style の適用は qsc の読込と同じ経路 (§2) で node が読まれる
  (アプリで確認: style 適用後に node 5 つ)。`coloringStyleNames` に入れたので `set_renderer_coloring` の style
  モードでも当てられる。
- **取得**: `streamLoadFromUrl` に `entry.source === 'alphafold'` が渡ると (op `fetch_entry` と、Get PDB の
  AlphaFold DB)、取得と同じ undo の中で、作った object の coloring を持つ renderer 全部に style を当てる
  (`applyColoringStyleToObject`)。別の op としては記録しない: `fetch_entry` の意味に含まれ、記録された
  `fetch_entry` を再生すれば同じく塗られる (別に記録すると再生で二重に当たる)。
- 色付けの style の当て直し (`applyStyleColoring`) は、renderer の style の並びから色付けの style
  (`*Paint` と `*Coloring`) をまとめて外してから足す。以前は `*Paint` だけを外していたので、pLDDT の style の
  後に Paint の style を当てても pLDDT の style が並びに残っていた。

## 5. Color pane (`features/coloring/BfacColoringDeck.tsx`)

- B-factor の deck に「Multi-colour gradient」の switch。オンにすると今の 2 色の ramp の両端
  (`lowpar` の `lowcol`、`highpar` の `highcol`。auto のときは原子の値の min / max) から node を 2 つ書き、
  見た目を変えずにグラデーションに移る。オフは node を空にする (2 色に戻る)。
- オンの間は `MultiGradSection` を `gradient="coloring"` (と選んでいる対象の `targetKind`) で出し、使われない
  2 色の欄とパラメータの欄は隠す。地図を選ぶ欄は出さない。preset に「AlphaFold pLDDT」(値が固定なので統計が
  要らない) が加わる。
- `MultiGradSection` / `useMultiGradState` / `useMultiGradHistogram` / `useGradientViewDomain` は `targetKind` と
  `gradient` を受け、state・ヒストグラム・書き込みのすべての呼び出しに渡す (既定は今までどおり renderer の
  自分のグラデーション)。
- 再取得のフィルタ (`shouldRefetchMultiGrad`、`shouldRefetchColoring`) は `coloring.` で始まる名前も通す。2 段の
  入れ子の変更は `coloring.multi_grad` で届くので、Undo / Redo や op の後もエディタが node を読み直す。

PyMOL dialect の `spectrum b` / `q` は、3 色以上の palette をこの多色のグラデーションで塗る
([console-pymol-dialect](console-pymol-dialect.md) の `spectrum`)。

## 6. テスト

C++ (`src/tests/modules/molstr/test_bfac_coloring.cpp`):

- node が無ければ今の 2 色、あれば node の間の補間と端の色 (ChimeraX の pLDDT の colormap で 60 と範囲外)。
- renderer の coloring にしたとき、`multi_grad` の名前が `coloring.multi_grad`・root が renderer で、node の変更が
  その parent 名のイベントとして renderer に届き、undo / redo できる。`parentDataChanged()` を空にすると落ちる
  ことを確かめてある。
- qsc の保存 -> 読込 (`readFrom2` + `reapplyStyle`) で node が残り、copy した coloring は node を共有しない。
- style のファイルと同じ属性の形 (`<gradnode par="0" col="#FF0000"/>`) の node が読める。

tritium:
- `__test__/multiGradService.test.ts`: 両方のグラデーションを持つ renderer で `gradient` の指定どおりの方に書き、
  もう一方に書かない。object を対象にしても届く。`BfacColoring` でない coloring は拒否する。空の node が記録の
  文字列と往復する。`coloring.multi_grad` のイベントで再取得する。
- `__test__/streamLoadFromUrlService.test.ts`: AlphaFold の entry だけが取得の中で pLDDT の style を当てる。
- `plugins/pymol-console/worker/commands/colorCommands.test.ts`: `spectrum b, rainbow` / `q, blue_white_red` が多色の
  plan になり、色が最小から最大に等間隔に並ぶ。
