# Get PDB のキーワード検索と EMDB 関連の残り (計画)

Get PDB は PDB ID / EMDB ID を知らないと何も取れない。ID を知らなくても entry を探して取得できるように
する。EMDB 対応 (実装済み: [get-pdb-emdb](../architecture/get-pdb-emdb.md)) の UI を確認したうえで方式を
決める、という段取りで保留にしている。合わせて EMDB 対応で後回しにした項目も置く。

## キーワード検索 (方式未決定)

### 調査済みの材料

- **RCSB Search API** (`POST https://search.rcsb.org/rcsbsearch/v2/query`): `service: full_text`、
  `return_type: entry`、`paginate` / `sort` 可。手法 (`exptl.method`) や分解能
  (`rcsb_entry_info.resolution_combined`) の attribute 条件を `group` (`and`) で組み合わせられる。
  CORS `*` を確認済み
- 検索結果の行の表示 (title / 手法 / 分解能 / EMD ID) は、実装済みの `fetchEntryInfo` (GraphQL、ID 配列を
  1 リクエストで照会) をそのまま使える
- **Mol* 本体にキーワード検索は無い** (検索は RCSB サイト側の役割)。参考になるのは手法判定と推奨 level の
  規則で、これは EMDB 対応で取り込み済み
- モデルの無い EMDB 単独 entry を探すには EMDB search API (`https://www.ebi.ac.uk/emdb/api/search/<query>`)
  が別に要る。応答が大きい (1 件で数十 KB) ので `fl` で列を絞れるか要確認

### UI の候補

どの案も「選択中の entry 1 件」から下 (情報行と取得オプション) は EMDB 対応で作った部品を共通で使う。
違うのは entry を確定するまでの部分だけ。

| 案 | 内容 | 長所 / 短所 |
|---|---|---|
| (a) 1 入力欄・自動判定 | ID 形式なら今と同じ。それ以外は Enter で検索し、入力欄の下に手法フィルタ + 結果リスト (`h3-kit/list`) + More を出す。行を選ぶと entry が確定 | 入口が 1 つ。リストの有無でダイアログの高さが変わる。4 文字の単語が ID 形式に当たったときの逃げ道 (「キーワードで検索」リンク) が要る |
| (b) モード切替 | 上部の `SegmentField` で Accession / Search を切り替える | 解釈が曖昧にならない。1 クリック増える |
| (c) 2 ペイン | 左に入力 + 結果リスト、右に entry 詳細 + 取得オプション | 高さが安定し ID / 検索を同一に扱える。ダイアログが常に大きい |

決めること: 案、手法フィルタの粒度 (All / X-ray / EM で足りるか)、ページングの件数。

## EMDB 対応の残り

- console / AI agent の `fetch_emdb` op (`worker/server/catalog/ops/mapOps.ts` の `fetch_map` 相当)。入れたら
  `streamLoadDensityMap` の em 経路で op を記録する
- 巨大 map の subsample 提案: EMDB の grid 寸法から既存の `suggestSubsample` を使い、ダイアログで警告と選択肢を出す
- half map / additional map の取得
- Get PDB で座標と EMDB map を一緒に取ったとき、map renderer の boundary を最初からモデルに設定する
  (推奨 level が高すぎる map で level を下げてもノイズが出ない)
- 推奨 level が高すぎる map への対処 (例: 推奨値と既定の top 1% のうち低い方を初期値にする)
- 情報行に EMDB の検証値 (`https://www.ebi.ac.uk/emdb/api/analysis/<n>` の half map FSC、Q-score) を出し、
  主張分解能と実際の質のずれを見えるようにする
- Volume Server (`maps.rcsb.org/em/<id>/cell?detail=`) による部分ダウンロード。BinaryCIF の volume reader が要る
