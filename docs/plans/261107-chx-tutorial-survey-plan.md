# ChX console: ChimeraX の tutorial に基づく調査と、後で検討するもの

ChimeraX の公式 tutorial で実際に打たれているコマンドを集め、ChX console に流して、何が通り、何が足りないかを
調べた記録。足りないもののうち、既存のコマンドの書き方の対応 (提案 A) は実装済み (仕様は
[console-chimerax-dialect](../architecture/console-chimerax-dialect.md))。ここに残すのはそれ以外 (新しいコマンド、
CueMol 側の機能追加が要るもの、断るもの、共通の対策) で、別途検討する。

関連: [261103-chimerax-console-plan.md](261103-chimerax-console-plan.md) (lighting・windowsize・clip など、CueMol 側の
機能追加が先に要るものを既に挙げている)。

---

## 1. 調べ方 (2026-11-07)

- **資料**: 公式の tutorial 一覧 (https://www.rbvi.ucsf.edu/chimerax/tutorials.html) から、コマンド操作が中心の
  16 本 (構造の基本、結合部位、AlphaFold、cryo-EM、重ね合わせ、表面と色、図・動画、配列)。DICOM・VR・Chimera (旧版)
  のページは除いた。ChimeraX のソースにある `docs/user/tutorials/binding-sites.html` も加えた。
- **コマンドの取り出し**: tutorial の HTML の `href="cxcmd:..."` のリンクを順に取る (ChimeraX の docs はコマンドを
  このリンクで埋め込む)。リンクの無いページは表の中の文字から取った。
- **検証**: tutorial ごとに新しい scene を作り、コマンドを順に `tritium_cli --dialect chimerax` で流して、出力から
  「動いた / 知らないコマンド / エラー / 一部を無視 / 断った」に分けた。手元のファイルが前提の行 (`~/...`、
  `cd browse` など) は除いた。
- 結果 (845 行、PR #733 の修正後): 動いた 410、知らないコマンド 257、エラー 112、一部を無視・断った 44、除外 22。
  提案 A の実装後: 動いた 453、知らないコマンド 250、エラー 54、一部を無視・断った 66、除外 22。
  エラーには、前の行の失敗に引きずられたもの (`open 7kkj 7kkl` が通らず次の `matchmaker` が失敗) を含む。
- 再現するには、上の一覧から同じ tutorial を取り、同じ形で流す。集めたコマンドと再生の script は作業用の場所に
  あり、リポジトリには入れていない。

### よく使われるのに ChX に無いコマンド (使われた tutorial の本数 / 行数)

`volume` 10 / 49 (`vol` を含む)、`lighting` 9 / 22、`hbonds` 7 / 11、`morph` 7 / 9、`fitmap` (`fit`) 8 / 9、
`preset` 6 / 17、`mlp` 6 / 9、`clip` 5 / 11、`alphafold` 5 / 8 (`fetch` は対応済み)、`movie` 4 / 8、
`coulombic` 4 / 8、`ui` 4 / 9、`mousemode` 4 / 8、`sequence` (`seq`) 6 / 8、`coordset` 3 / 5、`size` 3 / 3 (`stickRadius` は対応済み)、
`log` 3 / 3、`2dlabels` / `key` 3 / 6、`sym` 2、`measure` 2、`swapaa` 2、`windowsize` 2、`camera` 2、`interfaces` 2、
`mseries` 2、`blast` 2、ほか 1 本だけのもの多数。

## 2. 新しいコマンドのうち、CueMol の既存の機能で作れるもの

| コマンド | 使用 | 使う CueMol の機能 | 注意点 |
|---|---|---|---|
| **`volume`** (`level`、`style mesh/surface`、`step`、`transparency`、`zone`、`region`、`hide/show`、`color`) | 10 本 / 49 行 (最多) | 地図の contour の op (`set_map_contour` ほか)、地図の renderer の property | 地図の演算 (`gaussian`、`subtract`、`morph`、`box`、`scale`、`cover`) は対象外として断る |
| **`lighting`** (`soft`、`simple`、`full`、`default`、`flat`) | 9 本 | 画面空間の AO の on / off | ChimeraX の `soft` は AO 主体なので見た目は近い。影 (`full`、`multiShadow`) は CueMol に無いので warn。光源の向きや強さは 261103 の plan の範囲 |
| **`hbonds`** (`reveal`、`restrict`、`~hbonds`) | 7 本 | `analyze_interactions` (水素結合と塩橋の解析と表示) | 判定の基準は ChimeraX と違いうる |
| `coulombic` | 4 本 | `calc_elepot` と表面の静電ポテンシャルの色付け | 数秒〜数分かかる。ChimeraX の Coulomb 計算と方法が違う (APBS / pdb2pqr) |
| `morph #1,2` | 7 本 | MorphMol (`add_morph_frame`) | 再生の仕組みが違う (ChimeraX は `coordset`、CueMol は Animation panel) |
| `preset` (`original`、`cartoon`、`sticks`、`publication` など) | 6 本 | 表示・色・lighting・輪郭線の組み合わせ | ChimeraX の preset の中身を移す必要がある |
| `sym` (`assembly`)、`unitcell`、`camera ortho` | 2 本ずつ | 対称操作のコピー、単位胞、投影法 | 優先度は低い |

## 3. CueMol 側の機能追加が必要なもの

| コマンド | 使用 | 足りないもの |
|---|---|---|
| `clip near/far/position/off` | 5 本 | CueMol の slab は中心に対称な 1 つだけ (261103 の plan にも記載) |
| `mlp` (疎水性で表面を塗る) | 6 本 | 親油性ポテンシャル (MLP) の計算 |
| `fitmap` / `fit` | 8 本 | 地図とモデルの当てはめ |
| `movie record/encode` と `wait` | 4 本 | コマンドの実行を録画する仕組み (CueMol の動画は Animation から作る) |
| `2dlabels` / `key` | 3 本 | 画面上の 2D の文字と色の凡例 |
| `coordset` / `mseries` | 3 本 | 複数モデル (NMR、morph) を順に表示する仕組み |
| `open ... from rcsb_bio` (生物学的会合体)、`from pdb_nmr` | 2 本 | 会合体の取得の経路 (PyM console の `fetch` の assembly は `fetch_url` で取っているので、流用を検討) |

## 4. 断る対象 (実用性が低いか、CueMol の設計と合わない)

- **GUI・セッションの操作**: `ui`、`mousemode`、`ks`、`log`、`windowsize`、`tile`、`cd`、`camera 360tb`、
  `scene save`、`.cxs` の保存。console から操作する意味が薄く、CueMol では GUI で行う。
- **配列・外部データベースの解析**: `color byattr seq_conservation`、`sequence associate`、`blast`、
  `alphafold match` / `pae`、`mutationscores`、`alpha_missense`。ChimeraX の配列ビューアや外部サービスが前提。
- **model を動かす・組み替える**: `turn/move ... model`、`view matrix models`、`mcopy`、`split`、`combine`、
  `changechains`。CueMol の object は自分の位置を持たない (今も理由を言って断っている)。
- **構造の編集・モデリング**: `swapaa`、`addh`、`dockprep`、`resfit`、`molmap`、`clashes`、`contacts` (後の 2 つは
  `analyze_interactions` で一部できるかもしれないので、`hbonds` を作るときに再検討)。
- **既に方針として断っているもの**: `name frozen`、sub-model (`#1.1`)、`#!`、`cofr <spec>`。

## 5. 共通の対策: dialect から op への省略可の引数

PR #733 で直した `view` の不具合は、「dialect が op の引数を 1 つ渡し忘れると `null` ではなく `undefined` で op に
届き、`!== null` の判定で「指定あり」と読まれる」ことが原因だった (`set_view` に `rotation` が足されたときに
ChX の `view` だけが渡していなかった)。op に引数が足されるたびに、ChX と PyM console の両方で同じ種類の不具合が
起こりうる。

- 対策: dialect から op を呼ぶ共通の入口 (`plugins/console/worker/runtime/opContext.ts` の `runOp`) で、渡されて
  いない省略可の引数を `null` で補う (MCP や native console は引数を検証して埋めているので、dialect だけの問題)。
- 試した結果: 既存のテスト 27 件が、op に渡る引数を完全一致で確かめているため期待値が変わる (補った `null` が
  入る)。記録される引数にも `null` が入る。期待値の修正は機械的だが、記録の形が変わることの影響 (qax の見た目、
  再生) を確かめてから入れる。
