# CueMol3 専用のスタイルファイル (`cuemol3_style.xml`)

CueMol3 (tritium) と CueMol2 (UXP) は同じ libcuemol2 と同じ `data/default_style.xml` を使う。
CueMol3 で変えた既定の見た目や、CueMol3 だけが使うスタイル定義が CueMol2 に漏れないように、
CueMol3 だけが読むスタイルファイルを `default_style.xml` の上に重ねる。

## ファイルと読み込み順

| ファイル | 読むアプリ | 中身 |
|---|---|---|
| `data/sysconfig.xml` | CueMol2 | `style_file` = `default_style.xml` |
| `data/sysconfig_cuemol3.xml` | CueMol3 | `style_file` = `default_style.xml`, `cuemol3_style.xml` (この順) |
| `data/default_style.xml` (`<styles id="system">`) | 両方 | 共通のスタイル。CueMol2 の見た目はこのファイルで決まる |
| `data/cuemol3_style.xml` (`<styles id="cuemol3">`) | CueMol3 | CueMol3 だけの上書きと追加 |

- `qsys.cpp` の `loadStyleFile` は `style_file` を書いた順に読む。
- 読んだスタイルセットはリストの先頭に積まれる (`StyleFile::loadFile` の `push_front`)。
- CueMol3 の実行時の並びは「ユーザースタイル (`user`) -> `cuemol3` -> `system`」になる。

## sysconfig の指定元

両アプリとも libcuemol2 のインストール先 (`share/`) にある 2 つの sysconfig から選ぶ。

| | CueMol3 | CueMol2 |
|---|---|---|
| 開発版 | `tritium/core/CMakeLists.txt` の `DEFAULT_SYSCONFIG_PATH` (`share/sysconfig_cuemol3.xml`)。アドオンに埋め込む | ビルド時に `share/sysconfig.xml` と `share/data/*` をコピー (`uxp_gui/cuemol2/components/jsmods/moz.build`) |
| パッケージ版 | main の `getSysConfigPath()` (`main/handlers/appPath.ts`) が `Resources/cuemol2/share/sysconfig_cuemol3.xml` を返す | 同上 |

- `tritium/packaging/collect-cuemol2-runtime.sh` は `share/` をまるごと同梱し、`sysconfig_cuemol3.xml` と `cuemol3_style.xml` の存在を検査する。
- CueMol2 にも `cuemol3_style.xml` がコピーされるが、`sysconfig.xml` が参照しないので読まれない。

## 上書きはプロパティ単位

- renderer のスタイルはプロパティごとに解決する (`StyleSheet::resolveStyleSheet` -> `StyleMgr::getStyleNode2`)。
- 解決ではスタイルセットを先頭から順に見て、同名のスタイルがあっても、そのプロパティを定義していなければ次のセットへ進む (`StyleMgr::getStyleNodeImpl`)。
- そのため `cuemol3_style.xml` には変える属性だけを書けばよい。例: `DefaultRibbon` の `<helix tuber="6.5" width="0.18"/>`。書いていない `helix.type` などは `default_style.xml` の値になる。
- 同じ ID のスタイルセットを 2 度読むとエラーになる (`StyleFile::loadFile`)。このため上書き側の ID は `system` 以外 (`cuemol3`) にする。

## スタイル一覧の重複

- `StyleMgr::getStyleNamesJSON` は全セットのスタイルを並べるので、上書きしたスタイルは 2 回出る。
- tritium の `fetchStyleEntries` (`worker/server/services/helpers/styleEntries.ts`) は、同名のうち最後の 1 件 (全体を定義している最下層のセット) だけを残す。
- これにより、renderer の Style メニューなどでは `desc` と並び順が `default_style.xml` のとおりになる。

## `cuemol3_style.xml` に置くもの

- **DefaultRibbon の上書き**: helix / sheet の幅 0.18・tuber 6.5、coil の幅 0.2。CueMol2 は 0.2 / 6.0 / 7.0 のまま。
- **DefaultNucl の上書き**: base_size / base_thick 0.3、骨格の断面は roundsquare で幅 0.4。
- **`DefaultPymRendPreset`**: console / MCP / agent がダイアログなしで分子を読んだときに使う、PyMOL 風のプリセット ([op-catalog.md](op-catalog.md))。CueMol2 の新規レンダラーダイアログはプリセットを全部並べるので、こちらに置いて CueMol2 の一覧から外している。
- **既定の塗りのパレット**: `<palette id="default_paint">` と、`<テーマ>_<n>` の色 ([default-paint-palette.md](default-paint-palette.md))。

CueMol2 と共通にしたいスタイルは `default_style.xml` に置く。CueMol3 で既定の見た目を変えるときは、`default_style.xml` を直接変えずに `cuemol3_style.xml` に上書きを書く。

## qsc の互換

- **色**: CueMol3 で保存した qsc は、塗りに使ったパレット色の定義を scene の style set に持つ (`defPaintColoring.ts` の `ensureSceneColor`)。CueMol2 で開いてもパレットの定義なしで解決できる。
- **プリセット**: プリセット名は qsc に残らない。残るのはグループと、子 renderer の `sel` と `style` (`DefaultRibbon` など、どれも `default_style.xml` にある) である。
- **既定の見た目**: qsc はスタイルを名前で参照する。このため同じ qsc が CueMol3 では細い ribbon で、CueMol2 では従来の太さで描かれる。
