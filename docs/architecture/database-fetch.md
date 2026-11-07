# データベースからの取得 (取得元の表と ChX の `open`)

accession ID と取得元のデータベースから、構造を取得して開く仕組み。取得元の知識 (ID の形・URL・reader・
既定の名前) は core の共有モジュールに置き、今はこれを ChX console の `open` が使う
(`open pdbe:1crn`、`open alphafold:P29474`、`open 1crn fromDatabase pdbj` など)。Get PDB ダイアログ・
core の op・MCP への展開は [`../plans/261107-database-fetch-plan.md`](../plans/261107-database-fetch-plan.md)
(Phase 2、未実装)。

URL は ChimeraX の取得処理に合わせた (`~/ext/ChimeraX/src/bundles/` の `mmcif`・`pdb`・`alphafold`・
`pubchem`)。同じ接頭辞で同じものを取る。

## 1. 取得元の表 (`renderer/worker/shared/dbSources.ts`)

両スレッドから引ける純粋な関数。RCSB の URL は既存の `pdbUrls.ts` (`pickCoordUrl`) を使う。EMDB の地図は
この表に入れず、既存の `pickEmdbMapUrl` / `fetch_emdb` に任せる。

| 取得元 | ID | URL | reader | gzip | 既定の名前 |
|---|---|---|---|---|---|
| `pdb` | 4 文字の PDB ID | `pickCoordUrl` (RCSB) | `mmcif` / `pdb` | なし | ID (小文字) |
| `pdbe` | 同上 | `https://www.ebi.ac.uk/pdbe/entry-files/download/{id}.cif` (`pdb{id}.ent`) | 同上 | なし | 同上 |
| `pdbj` | 同上 | `https://pdbj.org/rest/downloadPDBfile?format=mmcif&id={id}` (`format=pdb`) | 同上 | **あり** | 同上 |
| `redo` | 同上 | `https://pdb-redo.eu/db/{id}/{id}_final.cif` (`.pdb`) | 同上 | なし | 同上 |
| `alphafold` | `P29474`、`Q8N9C0-2`、`AF-Q8N9C0-F1-v6`、`AF-Q8N9C0-2-F1-v6` | `https://alphafold.ebi.ac.uk/files/AF-{uniprot}[-{isoform}]-F{fragment}-model_v{version}.cif` (`.pdb`) | 同上 | なし | `AF-{uniprot}[-{isoform}]-F{fragment}` |
| `pubchem` | CID (数字) | `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/{id}/SDF?record_type=3d` | `sdf` | なし | `pubchem_{cid}` |

- 形式 (`format`) を省くと mmCIF。PubChem は SDF しか無いので、形式を渡すと断る。
- **PDBj は形式によらず gzip で返す** (`application/gzip`。どの窓口も同じ)。そのため `fetch_url` に `gzip` を
  足した (§2)。
- AlphaFold の ID は ChimeraX の `_parse_alphafold_id` と同じに読む。fragment の既定は 1、DB の版の既定は
  ChimeraX の設定と同じ 6 (`ALPHAFOLD_DB_VERSION`)。UniProt の名前 (`NOS3_HUMAN`) は UniProt への問い合わせが
  要るので断る。
- AlphaFold のファイルは curl の既定の User-Agent だと 403 になる (ブラウザの User-Agent なら 200)。アプリの
  取得 (Electron の fetch) では問題ない。
- `urlFetch(url)`: URL のファイル名の拡張子で reader を決める (`.cif`/`.mmcif` -> `mmcif`、`.pdb`/`.ent` ->
  `pdb`、`.sdf`/`.mol` -> `sdf`、`.mol2` -> `mol2`)。末尾の `.gz` は gzip として展開する。query と fragment は
  見ない。名前はファイル名から拡張子を除いたもの。地図の URL は扱わない。
- `emdbAccession(text)`: `1080`、`emd_1080`、`EMD-1080` を `EMD-1080` にする (`fetch_emdb` の `id`)。

## 2. `fetch_url` の `gzip`

`fetch_url` op に `gzip` (省略可の boolean) を足し、`streamLoadFromUrl` で reader の `compress` を `gzip` に
する (地図の `streamLoadDensityMap` と同じやり方)。記録される `fetch_url` にも `gzip` が入るので、qax を再生
しても展開して読む。

## 3. ChX の `open` (`plugins/chimerax-console/worker/openTarget.ts`)

名前が何を指すかは ChimeraX の `open_command/cmd.py` (`fetches_vs_files` / `fetch_info`) と同じ順に決める:

1. `fromDatabase db` があれば、その取得元から取る。**同じ名前のファイルがあっても取る** (取得元を明示した
   コマンドの結果が作業ディレクトリで変わらないように。ChimeraX も `database_name` があるときは
   `exists_locally` を見ない)。
2. 同じ名前のファイルがあれば、ファイル。
3. `http://` / `https://` で始まれば URL (`urlFetch`)。
4. `db:id` (接頭辞は 2 文字以上。`C:\...` は 1 文字なのでパスのまま)。接頭辞の大文字小文字は区別しない。
5. 4 文字の PDB ID なら `pdb`。
6. それ以外はファイル (無ければ読み込みのエラー)。

取得:
- `pdb` は `fetch_pdb` (記録に URL でなく entry が残る)。
- `emdb` / `emdb_us` は WWPDB、`emdb_europe` は EBI で `fetch_emdb`。
- それ以外の取得元と URL は、表の URL・reader・gzip で `fetch_url`。

`format` は `pdb` / `mmcif` (`cif` も) を PDB 系と AlphaFold で使う。それ以外の形式名をこれらに渡すと断る。
URL と EMDB では使わない (warn)。ファイルを開くときは今までどおり無視して warn。

開いた後は、ファイルを開いたときと同じく、分子は ribbon (`chx:cartoon`) で読んで ChimeraX の auto style を
当て、`Opened <name> as #N` と言う (`fileCommands.ts` の `adopt`)。

**AlphaFold の pLDDT の色**: ChimeraX は AlphaFold のモデルを開くと、B-factor の列 (pLDDT) で
`alphafold` colormap に沿って塗る (`alphafold/fetch.py` の `_color_by_confidence`、colormap は
`core/colors.py`: 0 赤、50 オレンジ、70 黄、90 cornflowerblue、100 青の連続な補間)。ChX は auto style の
後に、これを pLDDT 2 刻みの 50 色の paint entry (`bfac > 98` ... `bfac > 0`、最後に `*` を赤) で近似して、
atom と cartoon の renderer に入れる (`colorSchemes.ts` の `plddtEntries`、`colorCommands.ts` の
`colorByPlddt`)。分子全体を塗るので、先に表を消してから入れる。

**断る取得元** (理由を言う):

| 接頭辞 | 理由 |
|---|---|
| `emdb_japan` / `emdb_china` | `fetch_emdb` がその mirror を持たない |
| `emdb_fits` | fit したモデルを開く処理が無い |
| `cod` / `pcod` | 低分子結晶の CIF を読む reader が無い |
| `pdbihm` / `pdbdev` | integrative model を扱えない |
| `smiles` | ChimeraX も 3D 化を NCI Cactus の Web サービスに任せている。外部サービス頼みなので入れない |
| `alphafold_pae`、`alpha_missense`、`mavedb`、`uniprot_variants`、`cellpack`、`ftp`、`help` | CueMol に対応する機能が無い |

表に無い接頭辞は「unknown database」と、使える取得元の一覧を出す。

## 4. テスト

- `renderer/worker/shared/dbSources.test.ts`: 取得元ごとの URL・reader・gzip・名前 (PDBj の gzip、AlphaFold の
  ID の分解、PubChem の SDF、URL の `.gz`)、断る ID。
- `plugins/chimerax-console/worker/openTarget.test.ts`: `fromDatabase` は同じ名前のファイルより優先、
  `db:id` と `fromDatabase` が同じ取得になること、`C:\...` はファイル、断る取得元。
