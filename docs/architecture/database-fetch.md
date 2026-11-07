# データベースからの取得 (取得元の表と ChX の `open`)

accession ID と取得元のデータベースから、構造を取得して開く仕組み。取得元の知識 (ID の形・URL・reader・
既定の名前) は core の共有モジュールに置き、op `fetch_entry` (native console・MCP・agent)、Get PDB ダイアログ、
ChX console の `open` (`open pdbe:1crn`、`open alphafold:P29474`、`open 1crn fromDatabase pdbj` など) が使う。
AlphaFold のモデルは開くと pLDDT で塗る ([bfac-multigradient](bfac-multigradient.md) §4)。

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
  見ない。名前はファイル名から拡張子を除いたもの。
- `mapUrlFetch(url)`: 地図 (CCP4 / MRC) の URL。拡張子が `.map` / `.mrc` / `.ccp4` (末尾の `.gz` は展開) なら
  reader `ccp4map` と名前を返し、そうでなければ null (呼ぶ側は `urlFetch` を試す)。
- `emdbAccession(text)`: `1080`、`emd_1080`、`EMD-1080` を `EMD-1080` にする (`fetch_emdb` の `id`)。
- `dbEntryInfoUrl` / `parseDbEntryInfo`: AlphaFold DB と PubChem の entry の情報 (Get PDB が表示する名前と概要)。
  - AlphaFold DB: `https://alphafold.ebi.ac.uk/api/prediction/{uniprot}[-{isoform}]`。fragment ごとの配列から
    ID の fragment (既定 F1) のものを選び、`uniprotDescription` を名前、遺伝子名・生物種・残基数・平均 pLDDT を概要にする。
    無い accession は 404。
  - PubChem: `.../compound/cid/{cid}/property/Title,IUPACName,MolecularFormula,MolecularWeight/JSON`。`Title` を名前、
    分子式・分子量・IUPAC 名を概要にする。無い CID は 400。
  - worker の service `fetchDbEntryInfo` (`services/file/entryInfo.ts`、RCSB / EMDB の照会と同じ場所) が取得し、
    400 / 404 は `not-found` にする。

## 2. op `fetch_entry` と `fetch_url` の `gzip`

**`fetch_entry`** (`catalog/ops/fileOps.ts`、group `files`。expose は console と、agent / MCP の `files` toolset。`fetch_pdb` は core のまま。core の一覧は短く保つ方針 (`catalog/toolsets.ts`) なので、他のデータベースは toolset を有効にしたときに出す。`files` の説明にデータベースからの取得を書いてある):
`source` (表の取得元)、`id`、`format` (省略可。`mmcif` / `pdb`)、`name` と renderer の引数 (`fetch_pdb` と同じ)。
表 (`structureFetch`) を引いて URL・reader・gzip を決め、`fetch_pdb` と同じ取得処理 (`fetchInto` ->
`streamLoadFromUrl`) で開く。

- **記録**: `streamLoadFromUrl` に `entry` (`source`・`id`・`format`・既定の名前) を渡すと、URL ではなくその entry
  として `fetch_entry` を記録する (`recordFetch`)。名前は既定の名前と違うときだけ残す (再生で同じ名前になる)。
  `entry` が無いときは今までどおり、RCSB の標準の URL は `fetch_pdb`、それ以外は `fetch_url`。
- `fetch_pdb` は互換のためそのまま残す (`fetch_entry source=pdb` と同じものを取るが、reader の option を取る)。
- EMDB の地図は `fetch_emdb` のまま (`fetch_entry` の取得元には入れない)。

**EMDB の mirror**: `pickEmdbMapUrl` (`worker/shared/pdbUrls.ts`) の取得先は `WWPDB` (files.wwpdb.org、既定)・
`EBI`・`PDBJ` (`EMDB_SERVERS`)。PDBj の URL は ChimeraX の `ftp.pdbj.org` ではなく、そのリダイレクト先の
`files.pdbj.org` を直接書く。China の mirror (`ftp.emdb-china.org`) は、足そうとしたとき (2026-11-07) に
応答が無かったので入れていない。`fetch_emdb` の `source`、Get PDB の Cryo-EM maps の Source、記録の照合
(`streamLoad.ts` の `fetchEmdbSpec`) が同じ一覧を使う。

**op `fetch_map_url`** (`catalog/ops/mapOps.ts`、toolset `map`、console): `url`・`name`・`gzip` (省略時は
`.gz` で判定)。地図の URL を `streamLoadDensityMap` の `mapType: 'auto'` で開く。

- `auto` は、読み込んだ後に CueMol が判定した地図の種類 (`isEmDensityMap`: `map_type_resolved`) で描く。
  cryo-EM なら isosurface (EMDB の地図と同じ。推奨 level は無いので style の既定)、結晶なら 2Fo-Fc と同じ
  contour。構造因子の reader の設定 (`gridsize`、MTZ の列) はしない。
- 記録は `fetch_map_url` (URL・名前・gzip)。それ以外の `mapType` は今までどおり `fetch_map` / `fetch_emdb`。

**`fetch_url` の `gzip`** (省略可の boolean): `streamLoadFromUrl` で reader の `compress` を `gzip` にする。展開は
libcuemol2 側で行う (`ObjReader::read` が入力を `qlib::GzipInStream` で包む。地図の `streamLoadDensityMap` や
ローカルの `.gz` を開くときと同じ)。ダウンロードしたバイト列は圧縮されたまま C++ に渡す。記録される
`fetch_url` にも `gzip` が入るので、qax を再生しても展開して読む。

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
- 取得元 (`pdb` を含む) は `fetch_entry`。ID の形は `open` でも先に検査して、何かを走らせる前に断る。
- `emdb` / `emdb_us` は WWPDB、`emdb_europe` は EBI、`emdb_japan` は PDBJ で `fetch_emdb`。
- `eds` (`open 1a0m from eds`、`eds:1a0m`) は、ChimeraX の `map/eds_fetch.py` と同じ PDBe の 2Fo-Fc の地図
  `https://www.ebi.ac.uk/pdbe/coordinates/files/<id>.ccp4` を `fetch_map_url` で開く (`dbSources.ts` の
  `edsMapFetch`)。`fetch_map` は使わない: 取得元を省くと RCSB の validation report の係数から地図を作り、
  `EBI_MTZ` でも PDBe の係数から作り直す別の経路で、ChimeraX が開くファイルと同じにならない。
- URL は、地図 (`mapUrlFetch`) なら `fetch_map_url`、それ以外は `urlFetch` の reader・gzip で `fetch_url`。

`format` は `pdb` / `mmcif` (`cif` も) を PDB 系と AlphaFold で使う。それ以外の形式名をこれらに渡すと断る。
URL と EMDB では使わない (warn)。ファイルを開くときは今までどおり無視して warn。

開いた後は、ファイルを開いたときと同じく、分子は ribbon (`chx:cartoon`) で読んで ChimeraX の auto style を
当て、`Opened <name> as #N` と言う (`fileCommands.ts` の `adopt`)。

**AlphaFold の pLDDT の色**: ChimeraX は AlphaFold のモデルを開くと、B-factor の列 (pLDDT) で
`alphafold` colormap に沿って塗る (`alphafold/fetch.py` の `_color_by_confidence`、colormap は
`core/colors.py`: 0 赤、50 オレンジ、70 黄、90 cornflowerblue、100 青の連続な補間)。ChX は auto style の
後に、これを pLDDT 2 刻みの 50 色の paint entry (`bfac > 98` ... `bfac > 0`、最後に `*` を赤) で近似して、
atom と cartoon の renderer に入れる (`colorSchemes.ts` の `plddtEntries`、`colorCommands.ts` の
`colorByPlddt`)。分子全体を塗るので、先に表を消してから入れる。`fetch_entry` の取得処理は先に
`AlphaFoldPlddtColoring` (B-factor の多色グラデーション) を当てるが、ChX の `chx:` renderer は paint が前提
(後の `color` が paint に戻す) なので、ChX はその上から paint の近似で塗り直す。

**断る取得元** (理由を言う):

| 接頭辞 | 理由 |
|---|---|
| `emdb_china` | その mirror に応答が無かった (`emdb`・`emdb_europe`・`emdb_japan` を案内する) |
| `emdb_fits` | fit したモデルを開く処理が無い |
| `cod` / `pcod` | 低分子結晶の CIF を読む reader が無い |
| `pdbihm` / `pdbdev` | integrative model を扱えない |
| `smiles` | ChimeraX も 3D 化を NCI Cactus の Web サービスに任せている。外部サービス頼みなので入れない |
| `alphafold_pae`、`alpha_missense`、`mavedb`、`uniprot_variants`、`cellpack`、`ftp`、`help` | CueMol に対応する機能が無い |

表に無い接頭辞は「unknown database」と、使える取得元の一覧を出す。

## 4. Get PDB ダイアログ (`plugins/getpdb`)

Entry 欄の先頭に **Database** の切り替え (`SegmentField`: PDB / EMDB、AlphaFold DB、PubChem) を置く。ID 欄の
見出しと placeholder は Database で変わる。

- **PDB / EMDB**: 今までどおり (RCSB / EMDB の照会、キーワード検索、地図の欄。[get-pdb-emdb](get-pdb-emdb.md))。
  Coordinates 欄は **Server** (RCSB / PDBe / PDBj / PDB-REDO) と **Format** (mmCIF / PDB) の 2 つ。PDBe などは
  同じ PDB の entry を配るので、RCSB の照会結果 (手法・地図の有無・PDB 形式の可否) はそのまま使う。
- **AlphaFold DB / PubChem**: RCSB の照会と検索はせず、地図の欄も出さない (PDB として扱うと、RCSB の照会結果や
  結晶の地図の fallback が別の取得元の ID に使われるため)。
  - ID の形を `structureFetch` で検査し、違えば理由を赤字で出して Download を押せなくする。
  - 形が正しければ `fetchDbEntryInfo` で照会し (`useDbEntryLookup`、PDB の照会と同じ待ち時間と古い結果の破棄)、
    名前と概要を 2 行で出す。見つからなければ Download を押せなくする。照会の失敗 (offline など) では押せる。
  - AlphaFold DB は Model 欄に Format (mmCIF / PDB)。PubChem は SDF だけなので Compound 欄に説明だけ。
- Database を切り替えると、前の Database の照会は止まり、結果も捨てる (`useEntryLookup` の `active` を落とす)。

取得 (`useGetPdbCommand.ts`):
- 座標は `structureFetch(source, id, format)` の URL・reader・gzip・名前で `streamLoadFromUrl` に渡す。
- 記録: RCSB は今までどおり `fetch_pdb` (読込のダイアログで選んだ reader の設定付き)。それ以外は `entry` を渡して
  `fetch_entry` (reader の設定は記録しない。`fetch_entry` は reader の設定を取らない)。
- **PubChem** は file-open option ダイアログを出さず、reader の既定値、ballstick の renderer、表示の中心を合わせる
  (`centerView`) で開く (`compoundOpenOptions`)。化合物 1 つなので、選ばせる必要が無い。
- 結果 (`GetPdbDialogResult`) は `entryId` (PDB / EMDB の accession、または AlphaFold / PubChem の ID) と
  `coord: { source, format }`。地図の取得は PDB / EMDB のときだけ。

AlphaFold のモデルは、Get PDB からでも `fetch_entry` からでも pLDDT の style で塗られる
([bfac-multigradient](bfac-multigradient.md) §4)。

## 5. テスト

- `renderer/__test__/streamLoadFromUrlService.test.ts`: `entry` を渡した取得は URL でなく `fetch_entry` として
  記録され (既定の名前は残さない)、gzip の取得は reader の `compress` を `gzip` にする。

- `renderer/worker/shared/dbSources.test.ts`: 取得元ごとの URL・reader・gzip・名前 (PDBj の gzip、AlphaFold の
  ID の分解、PubChem の SDF、URL の `.gz`)、断る ID。
- `plugins/chimerax-console/worker/openTarget.test.ts`: `fromDatabase` は同じ名前のファイルより優先、
  `db:id` と `fromDatabase` が同じ取得になること、`C:\...` はファイル、断る取得元、`eds` が PDBe の CCP4 の
  URL を地図として開くこと。
- `renderer/worker/shared/dbSources.test.ts` (`parseDbEntryInfo`): AlphaFold DB と PubChem の応答から名前と概要を読む。
- `plugins/getpdb/renderer/GetPdbDialog.test.tsx`: AlphaFold DB の ID は形が正しければ照会結果を出して取得でき、
  PDB の照会結果が残っていても地図の欄を出さない。
