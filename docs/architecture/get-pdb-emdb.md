# Get PDB の cryo-EM (EMDB) 対応 (日本語)

Get PDB ダイアログ (built-in plugin `tritium/react-gui/src/plugins/getpdb/`) は結晶構造前提で、
map は 2Fo-Fc / Fo-Fc (RCSB validation の cif.gz / PDBe の MTZ) しか取れなかった。cryo-EM entry
(例 8ZWB -> EMD-60522) の EMDB map を取れるようにし、入力された accession のメタデータを引いて
ダイアログの中身を entry の種類に合わせる。UXP に無かった機能なので migration ADR ではなくここに置く。
UXP から移植したストリーミング取得そのものは [ADR-0008](../migration/adr/ADR-0008-get-pdb-streaming.md)。

C++ の変更は無い。EMDB map は既存の `ccp4map` reader (gzip stream を buffer して読む) と
[Cryo-EM map mode](cryo-em-map-mode.md) の EM モード (`map_type`、`CryoEM*` style、`use_abslevel` /
`level`) にそのまま載る。

## 入力と accession

`worker/shared/pdbUrls.ts` の `parseAccession` が入力を 2 種類に分ける。

| 入力 | 結果 | 取得できるもの |
|---|---|---|
| `1mbn` (数字 + 英数 3 字) | `{ kind: 'pdb', id: '1mbn' }` (小文字) | 座標 + entry に応じた map |
| `EMD-11638` / `emd_11638` / `emd11638` | `{ kind: 'emdb', id: 'EMD-11638', num: '11638' }` | その map だけ |

EMDB 側は `EMD` prefix を必須にする。数字 4 桁 (`1234`) は PDB ID として正しい形なので、prefix 無しの
数字列を EMDB と解釈すると曖昧になる。入力履歴 (`pdbIdHistory.ts`) も同じ関数で正規化・検証する。

## メタデータの lookup

`useEntryLookup` (plugin 側) が、入力が accession として通ったら 400 ms 待って worker service を呼ぶ。
古い入力への応答は `useStaleGuard` で捨てる。service は `worker/server/services/file/entryInfo.ts`、
レスポンスの解釈は純関数として `worker/shared/pdbEntryInfo.ts` に置く。

| service | 呼ぶ API | 使う値 |
|---|---|---|
| `fetchEntryInfo({ pdbIds })` | `POST https://data.rcsb.org/graphql` (`entries`) | title、`exptl.method`、`resolution_combined`、`emdb_ids`、`pdb_format_compatible` |
| `fetchEmdbMapInfo({ emdbId })` | `GET https://www.ebi.ac.uk/emdb/api/entry/map/<id>` と `.../entry/admin/<id>` | 推奨 contour level、gz サイズ、grid 寸法、title |

どの API も `Access-Control-Allow-Origin: *` を返すので worker の `fetch` で直接呼べる。
`fetchEntryInfo` が ID の配列を受けるのは、検索結果の一覧を 1 リクエストで埋められるようにするため
([キーワード検索](get-pdb-keyword-search.md))。

### 規則 (Mol* と同じ)

- **map の種類**: `emdb_ids` があれば `em`。無ければ method に `X-RAY` / `NEUTRON` を含めば `xtal`、
  `ELECTRON MICROSCOPY` なら `em`、それ以外 (NMR など) は `other`。EMDB の有無を method より先に見るのは
  Mol* `getStreamingMethod` と同じ理由で、electron crystallography の entry (6AXZ など) は構造因子から
  作る map より EMDB の map の方が役に立つ
- **推奨 level**: EMDB の `contour_list.contour` のうち `primary` のもの、無ければ先頭、それも無ければ
  無し (Mol* `getContourLevelPdbe`)
- RCSB が知らない ID は `rcsb_id` 以外が全部 null の要素として返るので、`exptl` が無い要素は捨てて
  「見つからない」扱いにする

## ダイアログ

`GetPdbDialog.tsx`。form-kit (`FieldSection` / `Field` / `CheckboxField` / `RadioField` / `ComboBoxField`) で組む。
ID 欄の下に lookup の結果 (title と「手法 | 分解能 | EMD ID」) を出し、以下のセクションを出し分ける。

| lookup | Coordinates | Map セクション |
|---|---|---|
| PDB entry, `xtal` | 表示 | Density maps (2Fo-Fc / Fo-Fc、RCSB cif.gz / EBI MTZ) |
| PDB entry, `em` | 表示 | Cryo-EM maps (EMD ID ごとに checkbox、既定は全部 on。サイズ・grid・推奨 level を併記。取得元 wwPDB / EBI) |
| PDB entry, `other` | 表示 | 無し |
| EMDB ID を直接入力 | 無し | Cryo-EM maps (その map だけ) |
| 照会中 | 表示 (PDB ID のとき) | 無し |
| 見つからない | 無し | 無し (Download 不可) |
| 照会の失敗 (offline 等) | 表示 (PDB ID のとき) | 従来どおり Density maps (EMDB ID なら Cryo-EM maps) |

- **lookup に失敗してもダウンロードは止めない**。ダイアログは従来と同じ選択肢に戻るだけ
- `pdb_format_compatible = N` (大きな構造) では PDB 形式の選択肢を出さず mmCIF に固定する
- EMDB map の on/off は「外した ID の集合」で持つ。entry が変わっても状態を作り直す必要が無い
- 結果 (`GetPdbDialogResult`) の `emMaps` に、ダイアログが読んだ推奨 level を入れて渡す。worker 側で
  EMDB を引き直さない

## 読込 (`streamLoadDensityMap` の `mapType: 'em'`)

`useGetPdbCommand.ts` が座標 -> 結晶 map -> EMDB map の順に逐次ダウンロードする (従来の chain に
EMDB map を足しただけ)。EMDB map は file-open option ダイアログを通さない (結晶 map と同じ)。

- URL: `https://files.wwpdb.org/pub/emdb/structures/EMD-<n>/map/emd_<n>.map.gz` (既定)、
  EBI mirror は `https://ftp.ebi.ac.uk/pub/databases/emdb/structures/...` (`pickEmdbMapUrl`)
- reader は `ccp4map`、設定は `compress = 'gzip'` だけ (`gridsize` / MTZ column は構造因子の reader 用)
- 読込後、renderer を作る**前**に `obj.map_type = 'em'` を書く。renderer の既定 style は map kind から
  決まるので、header label による自動判定に頼らず EMDB 由来であることを確定させる
- renderer は isosurface 1 つ (`CryoEMIsoSurf`)。推奨 level があれば `level` (絶対値) に書く。C++ が native
  の `siglevel` (EM では top %) に逆変換して modified にするので、reset すれば style の既定 (top 1%) に戻る
- 最後に `fitView` (EM map は ORIGIN 配置なので、view を map に合わせる)
- object 名は `emd_<n>`。op の記録はしない (EMDB 用の op が無い。「op が作らない URL は記録しない」既存規則)

## 既知の問題・限界

- **推奨 level は map によっては高すぎる**。7A4P / EMD-11640 では推奨 0.01 が約 6.8σ で、主鎖 CA の半分と
  BCR の 9 割以上が等値面の外になる。このマップは EMDB 自身の検証値でも質が低い (half map FSC 7.8 Å、
  主張 4.2 Å。Q-score 0.28)。分解能の高い 8ZWB / EMD-60522 (1.83 Å) では同じ推奨 level で CA の 95% が入る
- 大きな map (512^3 で gz 500 MB 級) は全部 buffer してから読むので時間とメモリを使う。subsample の
  提案は未対応
- 推奨 level を下げると、溶媒ノイズの細かい粒と、膜タンパク質ではミセルらしき大きな塊が出る。
  モデル近傍だけを見るには map renderer の boundary (`bndry_molname` / `bndry_rng`) を使う

## テスト

- `worker/shared/pdbUrls.test.ts` — accession の正規化 (`EMD` prefix 必須)、EMDB map URL
- `worker/shared/pdbEntryInfo.test.ts` — map 種類の判定順 (EMDB 優先)、存在しない ID の除外、推奨 level の fallback
- `__test__/streamLoadDensityMapService.test.ts` — em: gzip のみ設定、renderer 作成前に `map_type = 'em'`、level の受け渡し
- `__test__/setupEmMapRenderer.test.ts` — isosurface 1 つ、`CryoEMIsoSurf`、level は `level` に書く (`siglevel` ではない)
- `plugins/getpdb/renderer/GetPdbDialog.test.tsx` — EM entry で Cryo-EM maps が出て、PDB 形式が無い entry は mmCIF に固定され、結果の `emMaps` に推奨 level が入る
