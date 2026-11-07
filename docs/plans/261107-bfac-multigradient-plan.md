# B-factor の多色グラデーション: tritium 側 (op・AlphaFold・Color pane)

`BfacColoring` の多色グラデーション (`multi_grad`) を、op・AlphaFold の色付け・Color pane から使えるようにする。
きっかけは AlphaFold のモデルを pLDDT で ChimeraX と同じ色に塗ること
([261107-database-fetch-plan.md](261107-database-fetch-plan.md) §1)。

方針: **既存の multi-gradient の実装となるべく共通にする**。Color pane の Multi-gradient deck・
`set_multigrad_nodes` op・preset の表を、表面 / 地図の renderer と同じものを使う。B-factor 用に新しく書くのは、
グラデーションを「どこから引くか」と「B-factor の分布 (ヒストグラム)」の 2 点だけにする。

前提 (実装済み。仕様は [`../architecture/bfac-multigradient.md`](../architecture/bfac-multigradient.md)):
- C++ の `BfacColoring` に `multi_grad` (readonly の object property、`MultiGradient`) がある。node が 2 つ以上なら
  原子をそのグラデーションで塗り、無ければ今までの 2 色。**node の値は絶対値** (B-factor そのもの)。
- 2 段の入れ子 (renderer -> `coloring` -> `multi_grad`) の名前は `coloring.multi_grad`、root は renderer。node の
  変更は parent 名 `coloring.multi_grad` のイベントとして renderer に届き (tritium の `propname` もこの名前に
  なる見込み)、undo / redo が効き、qsc の保存と読込で残る。

既存の multi-gradient (tritium):
- Color pane の Multi-gradient deck (`features/coloring/MultiGradSection.tsx`、`useMultiGradState.ts`、
  `useMultiGradHistogram.ts`、`section/gradientStops.ts`)。
- worker の service (`services/coloring/multiGrad.ts`: 状態・ヒストグラム・`setMultiGradNodes` の
  preview / commit / abort)。対象の解決は `colorTargets.ts` の `getMultiGradOrNull(rend)` (`rend.multi_grad`)。
- op `set_multigrad_nodes` (`"value colour; value colour; ..."`)。
- preset (`worker/shared/multiGradPresets.ts`: Rainbow / Resmap / Heatmap。地図の密度の統計から node を作る)。
- 分子表面 (`molsurf` / `dsurface`) は renderer 直下の `multi_grad` (地図・ポテンシャルの色付け用) と、
  `colormode="molecule"` のときに使う `coloring` (ここに `BfacColoring` が入りうる) の**両方**を持つ。

ChimeraX のソースは `~/ext/ChimeraX/src/bundles/`。

---

## 1. 設計

### 1.1 style

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
  style の適用は qsc の読込と同じ経路 (`convToVariant` -> `readFrom2`、`setPropertyImpl` -> `setupParentData`) なので
  読める見込み (architecture §2)。足した style で実際に確かめ、読めなければ worker の preset (§1.2) から node を書く。
- `reapplyStyle()` が default のままの property を戻す件 (表面で qsc 読込が壊れた前例、
  `docs/architecture/surface-scalar-coloring.md`): `multi_grad` が style 由来のとき、読み込んだ node が
  style で上書きされないことを gtest に入れる。

### 1.2 op と Color pane

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
  `shouldRefetchColoring` を、2 段のイベント名 (`coloring.multi_grad`) に対応させる (今はどちらも `multi_grad` で始まる
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
  coloring を pLDDT の `BfacColoring` にする (style か preset。§1.1 の結果による)。記録は既存の op の組み合わせ
  (`set_renderer_coloring` + `set_multigrad_nodes`) で残す。
- **ChX**: `chx:` の renderer は paint を前提にしている (後の `color` が `ensurePaint` で paint に戻す) ので、
  ChX の `open alphafold:` は今の paint の 50 色の近似を続ける。
- **PyMOL dialect** (任意): `spectrum b` の 3 色以上の palette を、断る代わりにグラデーションで塗れるようになる。

## 2. フェーズ

(フェーズ 1 の C++ は実装済み。)

2. **op の対象の拡張と AlphaFold** (1 つの PR):
   - `set_multigrad_nodes` / `setMultiGradNodes` に、どの `multi_grad` か (`gradient: 'renderer' | 'coloring'`) を
     足し、記録にも残す (§1.2 の最小限。UI はまだ触らない)。AlphaFold の色付けをこの op の組み合わせで
     記録するので、AlphaFold より先 (同じ PR) に要る。
   - 空の `nodes` の受け付け (§1.2)。
   - pLDDT の style (または preset)、Get PDB と `fetch_entry` での適用。
   - **完了条件**: AlphaFold を開いたときの記録を再生して、同じ色付けになること (§3)。
3. **Color pane**: 対象の種類 (`targetKind`) を component -> service -> op に通す、再取得のフィルタの 2 段の
   イベント名への対応、Bfac deck への `MultiGradSection` の埋め込み、B-factor のヒストグラム、preset。
   UI は inspect-ui と目視確認。
4. (任意) PyMOL の `spectrum b` の多色 palette。

各フェーズで 1 PR、マージしてから次に進む。

## 3. テスト (必要最小限)

C++ (gtest、追加分):
- style 由来の coloring でも、読み込んだ node が `reapplyStyle()` で消えない (pLDDT の style を足すとき)。

tritium:
- 分子表面で `gradient: 'coloring'` を指定すると `BfacColoring` の `multi_grad` に、省略すると renderer 直下の
  `multi_grad` に書く (取り違えないこと。op の再生でも同じ対象に解決すること)。
- 分子 object を対象 (`targetKind: 'object'`) にしても、状態の取得と書き込みが object の coloring に届く。
- node の編集 -> Undo / Redo で、描画とエディタの表示 node が一緒に戻る (2 段のイベント名の再取得)。
- 多色にした後に node を空に戻した記録が、再生できる (空の `nodes` を受け付ける)。
- AlphaFold を開いたときの記録 (再生で同じ色付けになる)。

## 4. 未確認点

1. 描画の高速な経路 (GPU に色を持たせる renderer) が `ColoringScheme::getAtomColor` を通っていて、
   グラデーションの色がそのまま使えるか (フェーズ 2 で AlphaFold を ribbon などで開いて確かめる)。
2. tritium に届くイベントの `propname` が `coloring.multi_grad` であること (フェーズ 3 の再取得のフィルタの前提)。
