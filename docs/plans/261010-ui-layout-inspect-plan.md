# tritium UI レイアウト自動検証 (Playwright `_electron`) プラン

> 状態: **実装済み**。仕様は [`../architecture/ui-layout-inspect.md`](../architecture/ui-layout-inspect.md)。実装では監査ファイルを `layoutAudit.mjs` とし、kind に `text-spill` / `min-size-override` を追加、画面外の issue の個別撮影を加えた。

## Context

今の tritium/react-gui の UI 開発は「Claude が実装 → `task build_tritium` → `task run_tritium` で起動確認」までが自動で、
その先の「はみ出し・切れ・意図しない形状・サイズ不一致・dark/light 崩れ」はユーザーの目視に頼っている。
jsdom (Vitest) には実レイアウトが無いので、この種の検査は既存テストでは書けない。

目的は **Claude の自己検証**。Claude が Playwright で実アプリ (Electron + native addon) を起動し、対象の pane/dialog を開き、
(1) DOM 計測によるレイアウト監査 JSON と (2) dark/light × 複数ウィンドウサイズのスクリーンショットを取得する。
Claude はそれを読んで直してからユーザーに渡し、ユーザーの目視は最終確認だけにする。
スクリーンショット baseline 差分による回帰スイートは作らない (末尾「スコープ外」)。

前提 (調査結果):
- Playwright は未導入。e2e ディレクトリも無い。`tritium/CLAUDE.md` には Playwright `_electron` 用の終了手順の記述だけがある (Don't Save ダイアログの処理)
- renderer は worker 経由で native addon (`@cuemol/core`) と WebGL を使う。素の vite ブラウザでは起動できないので、**Electron 実機 + `out/` ビルド成果物**を対象にする
- `CUEMOL_FRESH_PREFS=1` を付けると userData を使い捨てディレクトリにするので、single instance lock の衝突を避けられ、既存設定にも依存しない
- `data-testid` はほぼ無い。セレクタは `.bp5-dialog`, `.sp-pane`, `.h3-form-*`, `.panel-header` などのクラスを使う
- テーマは `documentElement[data-theme]` と `ThemeContext` の `setTheme` で切り替わる
- サイズ token は `_variables.css` にある (`--field-h`=22, `--field-h-sm`=20, `--field-btn-h`=20, `--row-h`=22, `--panel-header-h`=30 など)
- Catalog plugin (`src/plugins/catalog/`) は h3-kit を一通り並べた pane で、`defaultEnabled: false`。監査ロジックの較正 (誤検知の洗い出し) に最適

## 方針

### 1. 開発ビルド限定の E2E ブリッジ (アプリ側の変更は最小限)

- **有効化の経路**: `src/main/windows/mainWindow.ts` の `loadFile` / `loadURL` に、`process.env.CUEMOL_E2E === '1'` のときだけ `?e2e=1` の query を付ける
  (`loadFile(path, { query })`)。IPC 契約に行を足さずに済む
- **新規 `src/renderer/shell/E2eBridge.tsx`**: `__DEV_UI__ && location.search に e2e=1` のときだけ `window.__cuemolE2E` を公開する。
  `__DEV_UI__` が false のリリースビルドからは tree-shake で消える。provider 群の内側 (CommandRegistry / Theme / Plugin の下) に mount する
  - `dispatch(id, args?)`: `useCommands().dispatchAny` を呼ぶだけで await はしない (dialog の Promise は閉じるまで解決しないため)
  - `setTheme('dark' | 'light')`: `ThemeContext` の `setTheme` を呼ぶ
  - `setPluginEnabled(id, on)`: Catalog などを有効化する。`plugin-host/PluginProvider.tsx` の既存 setter を使う
  - `openView(viewId)`: サイドバーの view を切り替える。`shell/MainLayout.tsx` の `setActiveView` をブリッジに register する
  - `status()`: `{ cueMolReady, layoutLoaded }`。起動待ちの判定に使う
- ブリッジは機能を持たず、既存 API へ forwarding するだけにする。core が plugin の内部を import しない規約 (ESLint `NO_PLUGIN_INTERNALS`) は守る

### 2. レイアウト監査関数 (ページ内で実行する純 DOM 関数)

新規 `tritium/react-gui/e2e/lib/layoutAudit.js`。root 要素を受け取って issue 配列を返す。`page.evaluate` で注入する。

| kind | 判定 |
|---|---|
| `clipped-text` | `.type-*` / label / button 文字列で `scrollWidth > clientWidth + 1` のもの。意図的な ellipsis (`text-overflow: ellipsis`) は severity を下げて別扱いにする |
| `overflow-container` | `overflow: hidden/clip` の要素で、子の bbox がはみ出している (切れている) |
| `out-of-bounds` | 可視要素の bbox が root (dialog/pane) やビューポートの外にはみ出す |
| `overlap` | 同じ form 行 (`.h3-form-field-row` 等) の兄弟 control の bbox が重なる |
| `size-mismatch` | `.h3-form-input input` などの実高さが token (`getComputedStyle(documentElement)` から読む `--field-h` 等) と合わない。セレクタと token の対応表は `_form-kit.css` の height 宣言から作る |
| `collapsed` | 可視のはずの control/label が幅か高さ 0 |
| `unexpected-scroll` | dialog 本体や pane に、想定外の横スクロールが出ている |

- 各 issue には `{ kind, severity, selectorPath, rect, text?, expected?, actual? }` を入れる
- 誤検知の抑制には要素側の `data-audit-ignore="kind,..."` 属性 (意図的なはみ出し用) と、スクリプト側の ignore セレクタ一覧を使う

### 3. Driver CLI (`tritium/react-gui/e2e/inspect.mjs`)

依存は `playwright-core` (devDependency) のみ。Electron を直接起動するのでブラウザのダウンロードは要らない。

```
node e2e/inspect.mjs --target <spec> [--theme dark,light] [--size 1400x900,900x600] [--open <file.pdb>] --out <dir>
  spec: dialog:<CmdId>      例 dialog:ui.aboutDialog
        view:<viewId>       サイドバー view (例 view:catalog)
        pane:<css selector> 表示中の任意要素
        catalog             Catalog plugin を有効化して catalog1-3 を一括監査
```

処理の流れ:
1. `_electron.launch({ executablePath: <react-gui の electron>, args: ['out/main/index.js', ...openFiles], env: { CUEMOL_E2E: '1', CUEMOL_FRESH_PREFS: '1', LIBCUEMOL2_ROOT, BUNDLE_APPS } })`。
   main の stdout を `<out>/app.log` に保存する
2. `status()` と起動ログのマーカー (`shader program created OK`) を待つ。タイムアウトしたら log の末尾を出して失敗にする
3. size ごとに `electronApp.evaluate` で `BrowserWindow.setContentSize` を呼び、theme ごとに `setTheme` を呼ぶ。そのうえで target を開き、root 要素 (`.bp5-dialog` / pane) の出現を待つ
4. `layoutAudit(root)` を実行し、root の element screenshot を取る。ファイル名は `<target>_<theme>_<size>.png`
5. `<out>/report.json` (issue 一覧と画像パス) を書き、要約を stdout に出す。issue があれば exit code 1
6. 終了は `tritium/CLAUDE.md` の手順どおり: `app.close()` を await せずに走らせ、`.bp5-dialog` の `Don't Save` をクリックし、最後に SIGKILL を送る

### 4. Taskfile と Claude ワークフローへの組み込み

- `build_scripts/Taskfile.yml` に `inspect_tritium_ui` を追加する (`TARGET=... OUT=...`。env は `run_tritium` と同じ)。前提は `task build_tritium` 済みであること
- 新規 repo skill `.claude/skills/inspect-ui/SKILL.md` を作る。「UI を実装・修正したら build 後に inspect を走らせ、report.json と PNG (Read tool で画像を見る) を確認し、直してからユーザーに目視を依頼する」という手順と、target の選び方を書く
- root `CLAUDE.md` の「検証チェーン」の 2 と 3 の間に「2.5 `task inspect_tritium_ui TARGET=<変更した pane/dialog>` で自己検証」を 1 行で足す。詳細は skill と architecture doc に置き、CLAUDE.md には分散させない
- `docs/migration/ui-style-guide.md` の移植チェックリストにある「dark/light 目視」の項に、inspect の併用を 1 行追記する

### 5. 較正 (実装後すぐに行う)

- `catalog` と、既存 dialog の代表数件 (About, Make MolSurf, FileOpen option など) で inspect を回す。誤検知を ignore / 判定ロジックの修正で潰し、本物の崩れはユーザーに一覧で報告する (修正するかは別途相談)
- Catalog 全 pane で issue 0 を「監査ロジックが妥当」の基準にする

## 変更・追加ファイル

- 変更: `tritium/react-gui/src/main/windows/mainWindow.ts` (e2e query)、`src/renderer/shell/MainLayout.tsx` (openView の register)、ブリッジを mount する provider 階層 (`App.tsx` 付近)、`tritium/react-gui/package.json` (`playwright-core`)、`build_scripts/Taskfile.yml`、root `CLAUDE.md`、`docs/migration/ui-style-guide.md`
- 新規: `src/renderer/shell/E2eBridge.tsx`、`tritium/react-gui/e2e/inspect.mjs`、`e2e/lib/layoutAudit.js`、`.claude/skills/inspect-ui/SKILL.md`、
  `docs/plans/261010-ui-layout-inspect-plan.md` (このプランを `_index.md` の現役表に追加し、実装後に状態を更新する)、実装後の `docs/architecture/ui-layout-inspect.md` (`_index.md` に 1 項目)
- `e2e/` は Vitest の include (`src/**`) の外なので、既存テストに影響しない。eslint/tsconfig の対象にするかは実装時に確認する

## テスト (最小)

- Vitest 1 件: `E2eBridge` は `e2e=1` が無ければ `window.__cuemolE2E` を公開しない (リリース・通常起動に漏れないことを pin する)
- 監査ロジック自体はツールなので、テストスイートには入れない。導入時の較正 (§5) と、検証手順 4 で一時的に崩す確認だけで妥当性を見る

## 検証 (end-to-end)

1. `cd build_scripts && task build_tritium`
2. `task inspect_tritium_ui TARGET=catalog OUT=<scratch>`: 起動から終了まで手を触れずに完走し、PNG 6 枚 (3 pane × 2 theme) と report.json が出ること。プロセスが残らないこと (`pgrep -fl "tritium/node_modules/.pnpm/electron"`)
3. `TARGET=dialog:ui.aboutDialog` で dialog 経路が動くこと
4. わざと label を長くするなどの崩しを一時的に入れ、issue として検出されて exit 1 になること (確認後に戻す)
5. 普通に `task run_tritium` で起動したとき (e2e 無し) に `window.__cuemolE2E` が undefined であること
6. `npx tsc -p tsconfig.web.json --noEmit` / `tsconfig.node.json`、`npm test`、`task lint_tritium_style`

## スコープ外 (明示)

- 回帰テストとしての UI E2E はやらない。具体的には、pin したスクリーンショットや DOM との比較、CI での自動実行、テストスイート化 (`@playwright/test`) のいずれも作らない
- inspect は実装中にその場で使う確認ツールである。毎回、その時点の画面を「絶対基準」(token のサイズ、はみ出しや重なりの有無) で検査する。過去の表示とは比べない。baseline も保存しない
