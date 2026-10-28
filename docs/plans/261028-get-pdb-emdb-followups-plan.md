# Get PDB の EMDB 対応の残り (計画)

Get PDB の cryo-EM 対応 ([get-pdb-emdb](../architecture/get-pdb-emdb.md)) とキーワード検索
([get-pdb-keyword-search](../architecture/get-pdb-keyword-search.md)) は実装済み。EMDB 対応で後回しにした
項目を置く。着手の順番は未定。

- console / AI agent の `fetch_emdb` op (`worker/server/catalog/ops/mapOps.ts` の `fetch_map` 相当)。入れたら
  `streamLoadDensityMap` の em 経路で op を記録する
- 巨大 map の subsample 提案: EMDB の grid 寸法から既存の `suggestSubsample` を使い、ダイアログで警告と選択肢を出す
- half map / additional map の取得
- Get PDB で座標と EMDB map を一緒に取ったとき、map renderer の boundary を最初からモデルに設定する
  (推奨 level が高すぎる map で level を下げてもノイズやミセルが出ない)
- 情報行に EMDB の検証値 (`https://www.ebi.ac.uk/emdb/api/analysis/<n>` の half map FSC、Q-score) を出し、
  主張分解能と実際の質のずれを見えるようにする
- モデルの無い EMDB 単独 entry のキーワード検索 (EMDB search API `https://www.ebi.ac.uk/emdb/api/search/<query>`。
  応答が大きい (1 件で数十 KB) ので `fl` で列を絞れるか要確認)
- Volume Server (`maps.rcsb.org/em/<id>/cell?detail=`) による部分ダウンロード。BinaryCIF の volume reader が要る

初期 contour level は EMDB の推奨値のままとする (2026-10 決定。推奨値が高すぎる map への対処は boundary で行う)。
