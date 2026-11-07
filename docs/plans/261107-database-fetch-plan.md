# データベースからの取得: core への展開 (Phase 2)

accession ID と取得元のデータベースから構造を取る機能を、ChX console の外 (op catalog・Get PDB ダイアログ・
native console・MCP・agent) に広げる。

前提 (実装済み。仕様は [`../architecture/database-fetch.md`](../architecture/database-fetch.md)):
- 取得元の表 `renderer/worker/shared/dbSources.ts` (PDB / PDBe / PDBj / PDB-REDO / AlphaFold / PubChem の URL・
  reader・gzip・名前、URL の形式判定、EMDB ID の正規化) は core の共有モジュールにある。ここでは表をそのまま
  使い、ChX から移す作業は無い。
- `fetch_url` は `gzip` を取る。
- ChX の `open` は、この表と既存の op (`fetch_pdb` / `fetch_url` / `fetch_emdb`) で取得している。AlphaFold の
  pLDDT の色は ChX の paint entry (50 色) で近似している。

ChimeraX のソースは `~/ext/ChimeraX/src/bundles/`。

---

## 1. op `fetch_entry` (仮称)

- 引数: `{ source, id, format?, name?, rendererType?, selection?, ... }`。表 (`structureFetch`) を引いて取得する。
- qax には URL ではなく「どのデータベースの何か」が残る (今の ChX は `fetch_url` の URL が残る)。
- `fetch_pdb` は `source: 'pdb'` の別名として残すか、`fetch_pdb` に `source` を足すかを決める (MCP / agent の
  互換を見て判断)。
- ChX は `fetch_url` から `fetch_entry` に切り替える (呼ぶ op の差し替えだけ)。
- `expose` を決めれば、native console・MCP・agent からも使える。

## 2. Get PDB ダイアログ

取得元の選択肢に PDBj・PDB-REDO・AlphaFold・PubChem を足す。選択肢を足すだけでは動かない。今のダイアログは
PDB / EMDB を前提に、照会・表示の判定・取得の 3 か所が RCSB に固定されている:
- 照会: `useEntryLookup` は EMDB 以外の ID を RCSB に照会する (取得元を受け取らない)。
- 表示の判定: 座標の選択肢は `accession.kind === 'pdb'` のときだけ出る (`GetPdbDialog.tsx` の `showCoord`)。
  Download できるかもこれで決まる。
- 取得: `useGetPdbCommand` は座標を `pickCoordUrl` で RCSB の URL にする。

そこで次の変更をする:
- 選択中の取得元を、照会・表示の判定・取得の 3 か所すべてに渡す。取得は表 (`structureFetch`) から引く。
- 入力欄の ID の判定 (`parseAccession`) を表から引く形に広げる (UniProt accession と PDB ID は形で区別できる。
  PubChem の CID は数字だけなので、取得元を明示させる)。
- AlphaFold / PubChem では RCSB の照会結果を Download の条件にしない。ID の形が正しければ取得できるように
  する (取得元ごとの情報の照会 API は作らない。取得に失敗したらそのエラーを出す)。
- AlphaFold / PubChem では、結晶の地図 (2Fo-Fc / Fo-Fc) と EMDB の地図の選択肢を出さない。PDB として扱って
  ごまかすと、RCSB の照会結果や結晶の地図の fallback が別の取得元の ID に使われてしまう。
- 取得元を切り替えたら、前の取得元の照会結果を無効にする (`useStaleGuard` で、遅れて返った前の結果を捨てる)。

## 3. AlphaFold の pLDDT の色を core に

core の coloring の preset (または style) にする。ChimeraX の `alphafold` colormap は連続な補間なので、
paint の 50 色の近似ではなく、B-factor を引数に取る gradient の coloring (CueMol の MultiGrad など) が使えるか
調べる。ChX の `colorByPlddt` はそれに置き換える。ただし ChX の `chx:` renderer は paint を前提にしているので
(後の `color` が `ensurePaint` で paint に戻す)、ChX 側の扱いは置き換えるときに決める。

## 4. EMDB の mirror

PDBj (`https://ftp.pdbj.org/pub/emdb/structures/EMD-%s`) と China (`https://ftp.emdb-china.org/structures/EMD-%s`) を
`pickEmdbMapUrl` に足す (ChimeraX `map/emdb_fetch.py`)。ChX の `emdb_japan` / `emdb_china` の拒否を外す。

## 5. URL からの地図

`fetch_url` を地図 (`streamLoadDensityMap`) にも広げるか、地図用の op を足す。`urlFetch` の拡張子の表に
`.map` / `.mrc` / `.ccp4` を足す。

## 6. PDB-REDO の地図

`fetch_map` の取得元に PDB-REDO の MTZ を足すかを検討する (ChimeraX の `redo` は `format MTZ` で地図も取れる)。

## 7. 確認とテスト

- 各取得元を Get PDB ダイアログから取得できること、取得元の切り替えで前の照会結果が残らないこと。
- PDB-REDO: Phase 1 の実装時 (2026-11-07) は pdb-redo.eu 自体が 503 で、実際の取得を確かめられていない。
  存在しない ID で HTML が返る場合の扱いもあわせて確かめる (ChimeraX は先頭行で判定している)。
- テスト: `fetch_entry` の記録 (qax に source と id が残り、再生で同じものを取る)、ダイアログの取得元の受け渡し。
