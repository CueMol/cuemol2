# データベースからの取得: 残りの展開

accession ID と取得元のデータベースから構造を取る機能の残り: AlphaFold の pLDDT の色。

前提 (実装済み。仕様は [`../architecture/database-fetch.md`](../architecture/database-fetch.md)):
- 取得元の表 `renderer/worker/shared/dbSources.ts` (PDB / PDBe / PDBj / PDB-REDO / AlphaFold / PubChem の URL・
  reader・gzip・名前、URL の形式判定、EMDB ID の正規化) は core の共有モジュールにある。
- op `fetch_entry` (取得元と ID で取得し、そのまま記録する) と、`fetch_url` の `gzip` がある。native console・
  MCP・agent からも使える。
- ChX の `open` は `fetch_entry` / `fetch_url` / `fetch_emdb` で取得している。AlphaFold の pLDDT の色は ChX の
  paint entry (50 色) で近似している。
- Get PDB ダイアログは Database (PDB / EMDB、AlphaFold DB、PubChem) と座標の取得元 (RCSB / PDBe / PDBj / PDB-REDO)
  を選べ、AlphaFold DB / PubChem の名前と概要を照会して出す。
- EMDB の地図は WWPDB / EBI / PDBj から取れ、op `fetch_map_url` で地図の URL も開ける。

ChimeraX のソースは `~/ext/ChimeraX/src/bundles/`。

---

## 1. AlphaFold の pLDDT の色を core に

`BfacColoring` に既存の `MultiGradient` を持たせる方向に決めた。C++ の変更になるので、別の plan
[261107-bfac-multigradient-plan.md](261107-bfac-multigradient-plan.md) で進める。ChX の `open alphafold:` は
paint の 50 色の近似を続ける (`chx:` の renderer は paint が前提)。

## 2. 確認とテスト

- Get PDB で開いた AlphaFold のモデルの色: §1 を入れたら、Get PDB と `fetch_entry` でも pLDDT で塗るかを決める。
