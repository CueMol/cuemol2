# データベースからの取得: 残りの展開

accession ID と取得元のデータベースから構造を取る機能の残り。

前提 (実装済み。仕様は [`../architecture/database-fetch.md`](../architecture/database-fetch.md)):
- 取得元の表 `renderer/worker/shared/dbSources.ts` (PDB / PDBe / PDBj / PDB-REDO / AlphaFold / PubChem の URL・
  reader・gzip・名前、URL の形式判定、EMDB ID の正規化) は core の共有モジュールにある。
- op `fetch_entry` (取得元と ID で取得し、そのまま記録する) と、`fetch_url` の `gzip` がある。native console・
  MCP・agent からも使える。
- ChX の `open` は `fetch_entry` / `fetch_url` / `fetch_emdb` で取得している。AlphaFold の pLDDT の色は ChX の
  paint entry (50 色) で近似している。
- Get PDB ダイアログは Database (PDB / EMDB、AlphaFold DB、PubChem) と座標の取得元 (RCSB / PDBe / PDBj / PDB-REDO)
  を選べ、AlphaFold DB / PubChem の名前と概要を照会して出す。

ChimeraX のソースは `~/ext/ChimeraX/src/bundles/`。

---

## 1. AlphaFold の pLDDT の色を core に

core の coloring の preset (または style) にする。ChimeraX の `alphafold` colormap は連続な補間なので、
paint の 50 色の近似ではなく、B-factor を引数に取る gradient の coloring (CueMol の MultiGrad など) が使えるか
調べる。ChX の `colorByPlddt` はそれに置き換える。ただし ChX の `chx:` renderer は paint を前提にしているので
(後の `color` が `ensurePaint` で paint に戻す)、ChX 側の扱いは置き換えるときに決める。

## 2. EMDB の mirror

PDBj (`https://ftp.pdbj.org/pub/emdb/structures/EMD-%s`) と China (`https://ftp.emdb-china.org/structures/EMD-%s`) を
`pickEmdbMapUrl` に足す (ChimeraX `map/emdb_fetch.py`)。ChX の `emdb_japan` / `emdb_china` の拒否を外す。

## 3. URL からの地図

`fetch_url` を地図 (`streamLoadDensityMap`) にも広げるか、地図用の op を足す。`urlFetch` の拡張子の表に
`.map` / `.mrc` / `.ccp4` を足す。

## 4. PDB-REDO の地図

`fetch_map` の取得元に PDB-REDO の MTZ を足すかを検討する (ChimeraX の `redo` は `format MTZ` で地図も取れる)。

## 5. 確認とテスト

- PDB-REDO: 実装時 (2026-11-07) は pdb-redo.eu 自体が 503 で、ChX の `open`・`fetch_entry`・Get PDB のどれからも
  実際の取得を確かめられていない。存在しない ID で HTML が返る場合の扱いもあわせて確かめる (ChimeraX は先頭行で
  判定している)。
- Get PDB で開いた AlphaFold のモデルの色: §1 を入れたら、Get PDB と `fetch_entry` でも pLDDT で塗るかを決める。
