# Get PDB のキーワード検索 (日本語)

Get PDB ダイアログ (built-in plugin `tritium/react-gui/src/plugins/getpdb/`) は、PDB ID / EMDB ID を
知らないと何も取れなかった。ID 欄にキーワードも入れられるようにし、RCSB の全文検索の結果から entry を
選んで取得できるようにする。UXP に無かった機能なので migration ADR ではなくここに置く。entry が決まった
後の照会・取得オプション・読込は [Get PDB の cryo-EM (EMDB) 対応](get-pdb-emdb.md) と共通。

Mol* 本体にはキーワード検索が無い (検索は RCSB サイト側の役割) ので、RCSB Search API を直接使う。

## UI: 1 つの入力欄で ID とキーワードを自動判定

モード切替や 2 ペインにはせず、入力欄は 1 つのまま、入力が ID かどうかで動きを変える。
ダイアログの状態は「選ばれている entry (1 件)」が中心で、その下の情報行と取得オプションは
ID 経路でも検索経路でも同じ部品を使う。違うのは entry が決まるまでの部分だけ。

| 入力 | 動き |
|---|---|
| ID 形式 (`parseAccession` が通る) | 従来どおり。結果リストは出さず、照会してそのまま entry の情報と取得オプションを出す |
| それ以外 (未検索) | 「Press Enter to search...」と Search ボタン。Enter / Search で検索 |
| 検索済み | 入力欄の下に Search results (件数、Method、Sort、結果リスト、More)。行を選ぶと、その entry の情報と取得オプションがリストの**下**に出る |
| ID 形式だが entry が無い | 「Search as keywords」ボタン。4 文字の単語が偶然 ID の形をしていた場合の逃げ道 |

- **結果リストを開いている条件**: 検索結果があり、かつ入力が ID 形式でない (または検索した文字列そのもの)。
  ID を打ち直すとリストは閉じ、ID 経路に戻る。リストが開いている間、entry は入力文字列ではなく選んだ行
  (`selectedId`) で決まり、それを `useEntryLookup` に渡す
- **選んだ entry の情報はリストの下に出す**。上に出すと、title の行数 (1〜3 行) で行を選ぶたびにリストが動く
- **Enter**: まだ検索していないキーワードなら検索、それ以外 (ID、または検索済みで entry を選んだ後) は Download
- **↑ / ↓**: 入力欄に focus があるまま結果の行を選ぶ
- **1 件ヒットでも自動選択しない**。どの entry を取るかはユーザーが見て選ぶ
- 結果リストは list-kit の枠付き `Listbox` (6 行分の高さでスクロール)。1 行 = ID (等幅) / title (`TruncatedText`
  で省略、hover で全文) / 手法と分解能

## 検索

worker service `searchPdbEntries` (`worker/server/services/file/entryInfo.ts`)。要求の組み立てと応答の
解釈は純関数として `worker/shared/pdbEntryInfo.ts` に置く (`rcsbSearchRequest` / `parseRcsbSearch`)。

1. `POST https://search.rcsb.org/rcsbsearch/v2/query` (`service: full_text`、`return_type: entry`、`paginate`)
2. ヒットした ID を `fetchEntryInfo` と同じ GraphQL 1 回で照会し、行の title / 手法 / 分解能を埋める。
   GraphQL の返す順は検索順と一致しないので、**検索の順位に並べ直す**

| 指定 | 要求 |
|---|---|
| Method: All | 全文検索の条件だけ |
| Method: X-ray / Electron microscopy | `exptl.method` の `exact_match` (`X-RAY DIFFRACTION` / `ELECTRON MICROSCOPY`) を `and` で追加 |
| Sort: Relevance | sort 指定なし (API の既定 = 関連度順) |
| Sort: Best resolution | `rcsb_entry_info.resolution_combined` 昇順 |
| Sort: Newest | `rcsb_accession_info.initial_release_date` 降順 |

- **並べ替えはサーバー側**で行う。手元で 1 ページ分だけ並べ替えると、More で足したページとの境目で順序が崩れる
- ヒットが無いと RCSB は **204 (本文なし)** を返すので、0 件の成功として扱う
- Method / Sort を変えると、その場で同じ語を検索し直す (選択は外れる)
- 全文検索は緩く当たるので、Best resolution では語と関係の薄い高分解能 entry が上位に混ざることがある (API の挙動)

## ページング (More)

`usePdbSearch` (plugin 側) が 25 件ずつ取得し、More のたびに次の 25 件を末尾に**追加**する。見出しの右に
「表示中 / 全件」(`25 / 1088 entries`、全部取り終えたら `1088 entries`) を出す。ページ切替や件数の上限は
設けない: スクロール位置が保たれ、件数が多すぎるときは語を足して絞るのが自然なため。古い検索の応答は
`useStaleGuard` で捨てる。

## 入力履歴

`pdbIdHistory.ts` (localStorage、LRU、20 件)。ダウンロードした ID と検索した語を **1 つの一覧**に入れる。

- ID は正規形 (`parseAccession`: PDB ID は小文字、EMDB は `EMD-<num>`) で保存。検索語は入力どおり、連続する
  空白だけ 1 つにまとめる (大文字小文字は区別する)。空文字と 200 文字超は保存しない
- 検索語は**検索を実行した時点**で記録する (Enter / Search / Search as keywords / Method・Sort の変更)。ID は
  従来どおりダウンロード時に command が記録する
- 履歴から**検索語を選ぶとすぐ検索**する (`ComboBoxField` の `onPick`)。ID を選んだときは欄に入るだけで、
  入力したときと同じく照会が走る
- 保存キー (`cuemol.getPdbDialog.history`) は以前と同じ。以前の版が保存した ID はそのまま読める

## 付随する変更

- list-kit: `.h3-list-row` に `flex-shrink: 0`。枠付き (高さ上限のある) `Listbox` に行が溢れると、flex column の
  既定の縮みで行が 22px から 17px に潰れていた。行の少ない既存の使い方では表に出ていなかった
- `inspect_tritium_ui` に `--press <key>` (fill の後にキーを押す)。検索後の状態を検査するため
  ([ui-layout-inspect](ui-layout-inspect.md))

## テスト

- `worker/shared/pdbEntryInfo.test.ts` — 検索要求の形 (Method の exact match 条件、Sort の sort 句、Relevance は sort 無し) と応答の解釈
- `__test__/searchPdbEntriesService.test.ts` — 204 は 0 件の成功、行は検索の順位どおり
- `plugins/getpdb/renderer/pdbIdHistory.test.ts` — 検索語を ID と同じ一覧に保存、空・長すぎる入力の除外
- `plugins/getpdb/renderer/GetPdbDialog.test.tsx` — 未検索のキーワードで Enter が検索になる、選んだ行がダウンロードする entry になる
