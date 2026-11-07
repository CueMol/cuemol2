# B-factor の色付けを多色のグラデーションに (`BfacColoring` + `MultiGradient`)

`BfacColoring` (B-factor / occupancy で色を付ける) に、既存の多色グラデーション `qsys::MultiGradient` を持たせる。
きっかけは AlphaFold のモデルを pLDDT (B-factor の列) で ChimeraX と同じ色に塗ること
([261107-database-fetch-plan.md](261107-database-fetch-plan.md) §1) だが、作るものは「B-factor を任意の多色の
グラデーションで塗る」一般の機能にし、pLDDT はその preset の 1 つにする。

方針: **既存の multi-gradient の実装となるべく共通にする**。C++ はグラデーションのクラス・保存形式・undo の
仕組みを `MultiGradient` のまま使い、tritium は Color pane の Multi-gradient deck・`set_multigrad_nodes` op・
preset の表を、表面 / 地図の renderer と同じものを使う。B-factor 用に新しく書くのは、グラデーションを
「どこから引くか」と「B-factor の分布 (ヒストグラム)」の 2 点だけにする。

---

## 1. 現状

**`BfacColoring`** (`src/modules/molstr/BfacColoring.{hpp,cpp,qif}`、`ColoringScheme` の派生):
- `mode` (`bfac` / `occ` / `center`)、`auto` (`none` / `mol` / `rend`: 範囲を分子全体か renderer の選択から自動で
  決める)、`lowcol` / `highcol`、`lowpar` / `highpar`。
- 色は `lowpar` 以下で `lowcol`、`highpar` 以上で `highcol`、間は 2 色の線形補間 (`gfx::GradientColor`)。
- 使っている所: GUI の Color pane の「Bfac/Occ coloring」(`paint-type-bfac`)、PyMOL dialect の `spectrum b/q`
  (2 色の palette だけ。3 色以上は断っている)。

**`MultiGradient`** (`src/qsys/MultiGradient.{hpp,cpp,qif}`):
- 値と色の組 (node) を値の順に持ち、`getColor(rho)` で区間ごとに線形補間する (範囲の外は端の色)。
- 保存は `writeTo2` / `readFrom2` (`<gradnode par="値"><col>色</col></gradnode>` の形。`par` か `col` の無い node は
  読み飛ばす)、JSON の入出力
  (`getNodesJSON` / `setNodesJSON`)。prop-changed の発火と undo の記録は `copyFrom()` を通す。
- 使っている所: 地図の renderer (`MapRenderer`)、分子表面 (`MolSurfRenderer`、`DirectSurfRendererBase` の
  `ScalarColorSupport`)。どれも renderer の readonly な object property `multi_grad` として持ち、
  `setupParentData("multi_grad")` で入れ子の変更を renderer の `propChanged()` に届けている。
- 分子表面 (`molsurf` / `dsurface`) は renderer 直下の `multi_grad` (地図・ポテンシャルの色付け用) と、
  `colormode="molecule"` のときに使う `coloring` (ここに `BfacColoring` が入りうる) の**両方**を持つ。

**tritium 側**:
- Color pane の Multi-gradient deck (`features/coloring/MultiGradSection.tsx`、`useMultiGradState.ts`、
  `useMultiGradHistogram.ts`、`section/gradientStops.ts`)。
- worker の service (`services/coloring/multiGrad.ts`: 状態・ヒストグラム・`setMultiGradNodes` の
  preview / commit / abort)。対象の解決は `colorTargets.ts` の `getMultiGradOrNull(rend)` (`rend.multi_grad`)。
- op `set_multigrad_nodes` (`"value colour; value colour; ..."`)。
- preset (`worker/shared/multiGradPresets.ts`: Rainbow / Resmap / Heatmap。地図の密度の統計から node を作る)。

## 2. 設計

### 2.1 C++: `BfacColoring` に `multi_grad`

- `property object<MultiGradient$> multi_grad => redirect(getMultiGrad, xxx) (readonly);` を足す
  (表面 / 地図と同じ名前・同じ宣言にして、tritium の解決と op をそのまま使えるようにする)。
- **node が 2 つ以上あるときはグラデーションで塗り、無い (既定) ときは今の 2 色の動作のまま**。既存の
  scene・style・PyMOL の `spectrum` の結果は変わらない。
- copy コンストラクタ (`cloneable`) でグラデーションを深くコピーする (style から作った coloring どうしで
  node を共有しないように)。
- **役割の境界** (将来「スカラー値 -> 色」を抽象化して差し替えられるように。抽象化そのものはこの plan ではしない):
  - `BfacColoring` は「原子から値 (B-factor / occupancy / 距離) を取る」までを持ち、値から色への変換は
    `MultiGradient::getColor(value)` に任せる。B-factor や pLDDT に固有の知識は `MultiGradient` に足さない。
  - 「node が空なら今の 2 色に戻す」判断は `BfacColoring` の側に置く。`MultiGradient` の空のときの挙動
    (`getColor` が黒を返す) は変えない。
  - 色の計算の経路に、親の renderer の参照や変更の通知・undo を持ち込まない (それらは編集の経路だけ)。
- 入れ子の変更の通知: `BfacColoring` 自身が renderer の `coloring` property の入れ子なので、
  renderer -> `coloring` -> `multi_grad` の 2 段になる。表面の renderer は 1 段 (`multi_grad` が renderer
  直下)。2 段で renderer の再描画 (色の作り直し) と undo が働くかを、着手時に最初に確かめる (§5 の未確認点 1)。
- **2 段のイベント名を決める**: `MultiGradient::copyFrom()` は自分の property path をイベント名にし、
  `RendererEvent` はそれを `propname` に載せる。2 段だと `coloring.multi_grad...` のような名前になる見込み。
  名前を決めたら、tritium の再取得のフィルタ (§2.4) もその名前に合わせる。

### 2.2 node の値の意味 (要決定。§5 の未確認点 2)

- **案 a: 絶対値** (B-factor そのもの)。表面 / 地図の multi-gradient と同じ。Multi-gradient deck の
  ヒストグラムと数値の編集がそのまま使える。pLDDT の preset は `0 red; 50 orange; 70 yellow;
  90 cornflowerblue; 100 blue` と ChimeraX の colormap をそのまま書ける。グラデーションを使うときは
  `auto` (範囲の自動決定) と `lowpar` / `highpar` は使わない。
- **案 b: 範囲内の割合** (0..1 を `lowpar..highpar` か `auto` の範囲に当てる)。今の `auto` を活かせ、
  分子ごとに B-factor の範囲が違っても同じ preset で塗れる。ただし deck の数値の意味が表面 / 地図と変わる。

推奨は **案 a**。共通化の方針に合い、pLDDT (値の意味が 0..100 で決まっている) にも素直。結晶構造の
B-factor を範囲に合わせて塗りたいときは、preset を作るときに分子の B-factor の統計から node を作れば
よい (地図の preset が密度の統計から node を作るのと同じ。§2.4)。

### 2.3 保存と style

- qsc: `multi_grad` は object property なので、表面と同じく `writeTo2` / `readFrom2` で入れ子の要素として
  保存される見込み。保存 -> 読込で node が戻ることを gtest で確かめる。
- style: `data/default_style.xml` に pLDDT の style を足す (例 `AlphaFoldPlddtColoring`):
  ```xml
  <style id="AlphaFoldPlddtColoring" type="renderer" desc="AlphaFold pLDDT">
    <coloring type="BfacColoring" mode="bfac" auto="none">
      <multi_grad>
        <gradnode par="0"><col>red</col></gradnode> ... <gradnode par="100"><col>blue</col></gradnode>
      </multi_grad>
    </coloring>
  </style>
  ```
  (`par` / `col` は `MultiGradient::writeTo2` が書く形そのもの。`value` / `color` で書くと node が読み飛ばされ、
  入れ子の読み込み自体は動いていても空になるので、検証の例は必ずこの形にする。)
  style の XML から入れ子の object property が読めるか (`readFrom2` が style 適用の経路でも呼ばれるか) を
  確かめる (§5 の未確認点 3)。読めなければ、style ではなく worker の preset (§2.4) から node を書く。
- `reapplyStyle()` が default のままの property を戻す件 (表面で qsc 読込が壊れた前例、
  `docs/architecture/surface-scalar-coloring.md`): `multi_grad` が style 由来のとき、読み込んだ node が
  style で上書きされないことを gtest に入れる。

### 2.4 tritium: 既存の multi-gradient の UI と op を共通に使う

- **対象の解決 (どの `multi_grad` か)**: 「renderer 直下に無ければ coloring の」という存在確認の順では決めない。
  分子表面は両方を持つので、`colormode="molecule"` で `BfacColoring` が描いていても、地図・ポテンシャル用の
  `multi_grad` に書き込んでしまう (見た目は変わらず、後で地図の色付けに戻すとそちらが変わっている)。
  そこで、**どちらのグラデーションかを明示する引数**を service と op に足す (例: `gradient: 'renderer' | 'coloring'`)。
  - Bfac deck からは `coloring`、地図・ポテンシャルの Multi-gradient deck からは `renderer`。
  - `set_multigrad_nodes` にも同じ引数を足し、記録にも残す。省略時は今と同じ `renderer` (既存の記録と互換)。
  - `coloring` を指定して coloring が `BfacColoring` でなければ、エラーにする (別のものに黙って書かない)。
- **対象の種類 (renderer か分子 object か)**: Color pane は分子 object 自身の coloring (`BfacColoring` を含む) も
  編集できるが、multi-gradient の service (`getMultiGradState` / `getMultiGradHistogram` / `setMultiGradNodes`) と
  `MultiGradSection` は renderer の ID しか受け取らない (`scene.getRenderer(args.rendId)`)。そのまま埋め込むと、
  object の ID を renderer として探して失敗する。そこで component -> service -> 記録される op まで `targetKind`
  (`renderer` / `object`) を通し、塗り分けなど他の deck と同じ `resolveColoringTarget` で解決する。
- **Color pane**: 「Bfac/Occ coloring」の deck に、Multi-gradient deck の `MultiGradSection` を埋め込む
  (node が無いときは今の 2 色の欄、あるときはグラデーションの欄。切り替えの UI を決める)。
- **再取得のフィルタ**: Undo / Redo や op で node が変わったとき、エディタが新しい node を読み直すように、
  `useMultiGradState` の `shouldRefetchMultiGrad` と、Bfac deck の切り替えを持つ `useRendererColoringState` の
  `shouldRefetchColoring` を、§2.1 で決めた 2 段のイベント名に対応させる (今はどちらも `multi_grad` で始まる
  名前しか通さない)。読み直さないと、古い node を再編集して上書きしてしまう。
- **node を空に戻す操作の記録**: 今回の設計では node が空 = 今の 2 色に戻す、という有効な状態になる。
  ところが Multi-gradient deck の「Delete all」は `nodes: []` を書き、記録される `set_multigrad_nodes` の
  `nodes` は空文字列になり、再生すると `parseMultiGradNodes` が `no nodes given` で拒否する (既存の不整合)。
  空の `nodes` を「全部消す」として op でも受け付け、適用と再生の契約を揃える。
- **ヒストグラム**: 地図の密度の代わりに、分子の B-factor (`mode` が `occ` なら occupancy) の分布を返す
  provider を `getMultiGradHistogram` に足す。
- **preset**: `multiGradPresets.ts` に `plddt` (値が固定。統計を使わない) を足す。既存の Rainbow などは
  B-factor の統計 (min / max / mean / sigma) からも作れるようにする (統計の型は地図と同じ `MapStats`)。
- **AlphaFold を開いたとき**: Get PDB と `fetch_entry` で AlphaFold のモデルを開いたら、作った renderer の
  coloring を pLDDT の `BfacColoring` にする (style か preset。§2.3 の結果による)。記録は既存の op の組み合わせ
  (`set_renderer_coloring` + `set_multigrad_nodes`) で残す。
- **ChX**: `chx:` の renderer は paint を前提にしている (後の `color` が `ensurePaint` で paint に戻す) ので、
  ChX の `open alphafold:` は今の paint の 50 色の近似を続ける。
- **PyMOL dialect** (任意): `spectrum b` の 3 色以上の palette を、断る代わりにグラデーションで塗れるようになる。

## 3. フェーズ

1. **C++ (`BfacColoring` + gtest)**: §2.1 と、§5 の未確認点 1・3 の確認。`task build_libcuemol2` と
   `task run_gtest`。
2. **op の対象の拡張と AlphaFold** (1 つの PR):
   - `set_multigrad_nodes` / `setMultiGradNodes` に、どの `multi_grad` か (`gradient: 'renderer' | 'coloring'`) を
     足し、記録にも残す (§2.4 の最小限。UI はまだ触らない)。AlphaFold の色付けをこの op の組み合わせで
     記録するので、AlphaFold より先 (同じ PR) に要る。
   - 空の `nodes` の受け付け (§2.4)。
   - pLDDT の style (または preset)、Get PDB と `fetch_entry` での適用。
   - **完了条件**: AlphaFold を開いたときの記録を再生して、同じ色付けになること (§4)。
3. **Color pane**: 対象の種類 (`targetKind`) を component -> service -> op に通す、再取得のフィルタの 2 段の
   イベント名への対応、Bfac deck への `MultiGradSection` の埋め込み、B-factor のヒストグラム、preset。
   UI は inspect-ui と目視確認。
4. (任意) PyMOL の `spectrum b` の多色 palette。

各フェーズで 1 PR、マージしてから次に進む。

## 4. テスト (必要最小限)

C++ (gtest):
- 色: node が無ければ今の 2 色と同じ色、あれば区間の補間 (pLDDT の node で 0・60・95 の色)。
- 保存 -> 読込で node が戻る。style 由来の coloring でも、読み込んだ node が `reapplyStyle()` で消えない。
- clone した coloring の node を変えても、元の node は変わらない。

tritium:
- 分子表面で `gradient: 'coloring'` を指定すると `BfacColoring` の `multi_grad` に、省略すると renderer 直下の
  `multi_grad` に書く (取り違えないこと。op の再生でも同じ対象に解決すること)。
- 分子 object を対象 (`targetKind: 'object'`) にしても、状態の取得と書き込みが object の coloring に届く。
- node の編集 -> Undo / Redo で、描画とエディタの表示 node が一緒に戻る (2 段のイベント名の再取得)。
- 多色にした後に node を空に戻した記録が、再生できる (空の `nodes` を受け付ける)。
- AlphaFold を開いたときの記録 (再生で同じ色付けになる)。

## 5. 着手時に最初に確かめること (未確認点)

1. renderer -> `coloring` -> `multi_grad` の 2 段の入れ子で、node の変更が renderer の色の作り直しと undo に
   届くか (表面は 1 段)。届かなければ、`BfacColoring` 側で変更を `coloring` の変更として通知し直す。
   どちらの場合も、tritium に届くイベント名 (`propname`) を確定させ、§2.4 の再取得のフィルタに反映する。
2. node の値の意味 (§2.2): 案 a (絶対値) で進めてよいか。
3. style の XML から `multi_grad` の node が読めるか (`par` / `col` の形で確かめる)。
4. 描画の高速な経路 (GPU に色を持たせる renderer) が `ColoringScheme::getAtomColor` を通っていて、
   グラデーションの色がそのまま使えるか。
