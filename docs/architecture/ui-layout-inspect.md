# UI レイアウト検査 (`inspect_tritium_ui`)

tritium の UI を実装・修正したときに、Claude (または開発者) が「画面が崩れていないか」を
自分で確かめるための道具。Playwright の Electron ドライバでビルド済みのアプリを起動し、
pane か dialog を 1 つ開いて、window size × theme ごとに次の 2 つを出力する。

- DOM 計測によるレイアウト監査 (`report.json`)
- スクリーンショット。issue がある場合は番号付きの枠を描いた注釈版も出す

**回帰テストではない。** 過去のスクリーンショットや DOM とは比較せず、baseline も保存しない。
CI でも実行しない。毎回、その時点の画面を絶対的な基準 (スタイルガイドのサイズ token、文字の切れ・
はみ出し・重なりの有無) で検査する。

## 使い方

```sh
cd build_scripts && task build_tritium        # out/ を作る (dev ビルド)
task inspect_tritium_ui -- --target dialog:ui.makeMolSurfDialog --open tests/test_data/1CRN.pdb
task inspect_tritium_ui -- --target view:selection
task inspect_tritium_ui -- --target catalog
```

`--open` / `--out` の相対パスは、task を実行したディレクトリ (`USER_WORKING_DIR`) から解決される。

| オプション | 意味 |
|---|---|
| `--target dialog:<CmdId>` | command を dispatch し、最前面の `.bp5-dialog` を監査する |
| `--target view:<viewId>` | サイドバーの view (`explorer` / `view` / `selection` / `crystal` / plugin の view) を表示し、`.side-panel` を監査する |
| `--target catalog` | Component Catalog plugin を有効にして、その view を監査する |
| `--target pane:<selector>` | 既に表示されている任意の要素を監査する |
| `--dispatch` / `--args` / `--view` / `--plugin` / `--root` | target の構成要素を個別に指定する (組み合わせ可) |
| `--open <file>` | 起動時に開くファイル。File Open オプションダイアログは primary ボタンで閉じる |
| `--theme dark,light` / `--size 1400x900,1000x700` | 撮影する組み合わせ (表は既定値) |
| `--ignore <selector>` | 監査から外す subtree |
| `--window` | ウィンドウ全体のスクリーンショットも保存する |
| `--out <dir>` | 出力先。既定は `<tmpdir>/cuemol-ui-inspect/<target>` |

終了コード: 0 = error/warn なし、1 = issue あり、2 = 実行自体の失敗 (`app.log` を見る)。

## 構成

| ファイル | 役割 |
|---|---|
| `tritium/react-gui/e2e/inspect.mjs` | ドライバ。`playwright-core` の `_electron.launch` で `out/` を起動し、`CUEMOL_E2E=1` と `CUEMOL_FRESH_PREFS=1` を渡す。使い捨ての userData を使うので、普段使っている CueMol と並べて動かせる。終了は `tritium/CLAUDE.md` の手順で行う (Don't Save を押し、最後に SIGKILL) |
| `tritium/react-gui/e2e/lib/layoutAudit.mjs` | ページ内で実行される純 DOM 関数。import を持たず自己完結している必要がある (Playwright が関数を文字列化して送るため) |
| `src/renderer/shell/E2eBridge.tsx` | `window.__cuemolE2E`。`__DEV_UI__` かつページの query が `?e2e=1` のときだけ公開する。main (`windows/mainWindow.ts`) は `CUEMOL_E2E=1` のときだけこの query を付ける。中身は既存 API への forwarding だけ: `status` / `dispatch` / `has` / `setTheme` / `setPluginEnabled` / `openView` / `views` |

`openView` は `MainLayout` の `setActiveView` を `useE2eHook('openView', ...)` で登録して使う。
リリースビルド (`__DEV_UI__ = false`) にはブリッジ自体が含まれない。

## 監査の種類

| kind | severity | 判定 |
|---|---|---|
| `clipped-text` | error | 文字を持つ要素が、自分の `overflow: hidden` の box に収まっていない |
| `ellipsis` | info | 上と同じだが `text-overflow: ellipsis` によるもの。意図的な省略として扱う |
| `text-spill` | warn | 文字が、clip しない親 box の外に出ている。例: 高さ固定の header の中で見出しが折り返した |
| `clipped` | error / warn | control や文字が、`overflow: hidden` の祖先で切れている。完全に隠れていれば warn。scroller の外にスクロールして隠れているだけのものは対象外 |
| `out-of-viewport` | error | ウィンドウの外にはみ出している |
| `overlap` | error | 互いに包含関係のない 2 要素 (どちらも通常フロー) の、画面上で見えている部分が重なっている |
| `size-mismatch` | error | `height: var(--field-*|--row-h|--ctrl-h-*|--panel-header-h)` の規則に当たる要素の高さが、どの token 値とも一致しない。規則は実行時に stylesheet から集める |
| `min-size-override` | info | `min-height` の token が後の規則で下げられている。dialog 内の checkbox のように意図的な上書きもあるので、参考情報として出す |
| `collapsed` | warn | control や文字が幅か高さ 0 になっている |
| `h-scroll` | warn | 横スクロールバーが出ている |

意図的なものは、要素に `data-audit-ignore="kind,..."` を付けて除外する (空文字ならすべての kind)。
スクロールで隠れた位置にある issue は、その要素だけをスクロールして見える位置に出し、
`<base>_issue<n>.png` として個別に撮影する。撮影後、scroller の位置は元に戻す。

## 導入時の較正結果

Component Catalog と、About / Mol surface generation の各 dialog、View の sidebar で実行した。
誤検知だったものは判定を修正済み (`display: contents` の親、スクロールで隠れた要素の重なり、
dialog 内の checkbox の `min-height` 上書き)。

Catalog の最小サイドバー幅 (1000x700 で 183px) では、本物の崩れが見つかっている。
1400x900 の 260px でも出るのは「%」の件だけ。

- 見出し `Label hierarchy (FieldSection vs Field)` が 3 行に折り返し、下の行と重なる
- `Stride (slider=false)` の stepper と、inspector mockup のリセットボタンが右端で切れる
- SliderField の単位「%」が、行の右端から約 7px はみ出す (260px 幅でも発生)
