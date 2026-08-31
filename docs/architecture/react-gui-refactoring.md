# react-gui 大規模リファクタリング (2026-08)

`tritium/react-gui` の構造を、機能追加を止めずに作り替えた記録。何をしたか
より **なぜそう切ったか / 何を採らなかったか** を残す。個々の import 規則は
[react-gui-layering.md](react-gui-layering.md)、UI 規約は
[../migration/ui-style-guide.md](../migration/ui-style-guide.md) にある。

## 動機

UXP からの移行 (140/140 完了) を 5 か月で駆け抜けた結果、コードは「移行時の
暫定配置」のまま 916 ファイル・非テスト 91,521 行まで育っていた。機能は揃って
いたが、次の 4 つが同時に起きていた。

**ハブファイルに変更が集中する。** git churn の上位が `App.tsx` (631 行、96
commit)、`WorkerCalls.ts` (812 行、85)、`ipcTypes.ts` (896 行、75)、
`ipcHandlers.ts` (443 行、39) と、**全機能が触る 4 ファイル**だった。無関係な
2 つの作業が必ず同じ行の近くで衝突する。

**同じ処理が複数の入口ごとに書かれている。** 背景色の変更にハンドラが 2 つ
あり、片方は native メニューの radio を更新し、片方はしなかった (B1)。
「どちらが正しいか」ではなく「どちらを踏んだか」で挙動が変わる状態。

**宣言的なデータが手書き JSX で複製されている。** Inspector の 20 個の
`*RendererSection.tsx` は 4,289 行あり、その大半は 139 行分の表を書き下した
もの。`const get = ...` が 39 回コピーされていた。

**境界が守られていない。** renderer の UI が worker service を実行時 import
し (B14)、worker が `components/` を実行時 import していた (B15)。ESLint は
無く、path alias も無く、`../../../` が 68 箇所あった。

## 進め方

**挙動不変を既定とし、挙動を変えるものは分けて出す。** 構造変更 PR は既存
テストが「import パスだけ変わって通る」ことを合格条件にした。バグ修正は
regression test を先に書いて独立 PR にした (Phase 0.5 で 30 件)。

**検証は 実装 -> ユーザー目視 -> test/lint の順。** テストを先に書くと、目視で
仕様が動いたときに手戻りする。実際、ウィンドウ表示の修正では最初の診断が
正しくても修正としては不十分で、**目視で「まだ直っていない」と分かった**
(後述)。

**「前はこうではなかった」は測って切り分ける。** 旧 commit を checkout して
同じ instrumentation でビルド・起動し、ログを比較する。5 分で済み、推測より
確実。

## Phase と結果

| Phase | 内容 | 主な数値 |
|---|---|---|
| 0 | path alias / ESLint / テスト配置 / CI 配線 | 相対 import 223 -> 0、ESLint 導入 (0 error / 128 warning) |
| 0.5 | 潜在バグ 30 件 + 目視で見つけた 3 件 | 高重大度 15 件を含む |
| 1 | 契約と境界 (`Result<T>` / `calls/` 分割 / DTO 移動) | `WorkerCalls.ts` 812 行 -> 20 slice、`ipcTypes.ts` 896 行 -> 13 slice、境界違反 42 -> 0 |
| 2 | 状態アーキテクチャ (provider 化 / ディスパッチ統合 / ポーリング除去) | `App.tsx` 631 -> 27 行、`SidePanel` props 35 -> 1 |
| 3 | component 分割と feature 配置 | `components/` 消滅、32 ダイアログが `DialogShell` に統一 |
| 4 | Inspector の schema 化 | 20 個の `*RendererSection.tsx` (4,289 行) が消滅 |
| 5 | worker service / transport / main の整理 | `ipcHandlers.ts` 443 -> 46 行、`windowManager.ts` 420 行 -> 5 モジュール |
| 6 | この文書 | |

非テスト行は 91,521 -> 96,807 (+5.8%)、テストは 323 ファイル -> 373
ファイル。**行は減っていない。** Inspector の schema 化で約 2,900 行減った分
は、分割で増えた分と新しいテストが埋めている。得たのは行数ではなく、
「1 ファイルが 1 つのことを述べる」状態と、境界を機械的に守る仕組み。

## 設計判断

### feature ディレクトリ (`components/` を解体した)

`panes/` と `panels/` の区別は破綻していた (sidebar section・content tab・
widget が混在)。`features/<domain>/` に component・専用 hook・CSS・テストを
同居させ、`shell/` (App chrome)、`h3-kit/` (デザインシステム)、`dialogs/`
(type-based のまま) を分けた。

**移動は 1 PR で行った。** 分割すると `features/` と `components/` の 2 つの
規約が同時に存在する期間ができ、その間は新規コードの置き場が決まらない。
計画では feature ごとに ~14 PR だったが、これは撤回した。

移動方法は「相対 specifier をファイルの**旧位置**で解決 -> 移動表を通す ->
alias で再出力」。tsc が証明できなかったのは 3 件だけで、いずれも別の検査が
捕まえた: CSS module の import (ビルド)、`vi.mock` のパス (vitest)、
barrel の削除 (呼び出し側の型エラー)。

### hook の置き場は「所有者」で決める (`lib/` を作らなかった)

計画では汎用 hook を `lib/` に集める予定だったが撤回した。`lib` は「feature
でも h3-kit でも worker でもない残り」という**否定でしか定義できない名前**
で、解体しようとしている `hooks/`・`utils/` と同じ catch-all になる。

実測すると hook 71 本のうち **48 本が consumer 1 本** = 共有コードではなく
単一 component の実装だった。そこで規則を「hook はそれを所有するものと同居、
所有者がいないものだけ `hooks/react` (React にしか依存しない) か
`hooks/cuemol` (worker への React binding)」にした。`hooks/react` は ESLint
が CueMol / IPC / `@shared` / feature の import を error にしており、名前が
嘘にならない。

### 状態は context を 3 つに割る (state ライブラリを入れなかった)

`WorkspaceProvider` は tabs を持つが、読み手は 3 つに分かれる: dispatch のみ
(再レンダーしない)、tab strip (タブの並び)、active scene/view (scene 切替時
だけ)。この粒度で hot path は足りたので、state ライブラリは導入していない。
4 つ目の read slice が要るようになったら再検討する。

**`activeSceneId` と `activeMolViewId` を同じ record から同じ render で導出**
することが要点だった。旧実装は別々の出所から来ていて 1 render ずれ、タブ
切替直後の fetch が旧 scene に当たっていた (B10)。

### ディスパッチは `CommandRegistry` 1 本に寄せた

native menu / React MenuBar / toolbar / keyboard / scene-tree ctxmenu の
5 入口が、それぞれ独自の handler table を持っていた (`CommandMap` 48 /
`MENU_ACTION_MAP` 52 / `SceneCtxAction` 44 / navi ctxmenu)。全部
`dispatch(CmdId.X, args)` に着地させ、573 行の switch と 50 フィールドの
context bag を削除した。

**`SceneCtxAction` は menu の wire 型として残した。** dispatch table である
ことをやめただけ。main がテンプレートを組んで選択結果を返す経路は変わらない。

**`useNaviContextMenu` は据え置いた。** 22 の action は右クリックの
`HitTestResult` を唯一の引数とする hit-scoped な one-shot で、第 2 の入口を
持ちえない。CmdId 化しても呼び出し元 1 つの行が 22 増えるだけになる。

### Inspector は schema (rows as data)

20 個の section component を、`PropRowDef[]` の表と 1 つの engine
(`SchemaSection`) に置き換えた。行 component (`NumRow` / `SelRow` / ...) は
再実装せず、engine は schema から既存の行へ prop を配るだけにした。

**predicate は関数だが named combinator のみ** (`eq` / `oneOf` / `isOff` /
`and` / `or` ...)。schema は TS module として bundle されるので直列化の利点が
無く、data DSL にすると evaluator を 2 つ目作ることになる。

**移行前に parity snapshot を作った。** renderer type ごとの `entries` を
**実データから採取**した (tritium/core の jest から native addon を起動し、
1CRN に全 15 renderer を作って `getPropsJSON()` を読む)。section ソースから
key を走査する案は破棄した: `${prefix}.width` のように prefix を計算する
箇所を拾えず、**そこが最も共通化したい部分**だったため。

### worker service はフォルダ、seam は call graph で決める

`.service.ts` が ~250 行超、private helper ~5 個超、または既に sibling の
非 service module を持つならフォルダにする。形は `coloring/` に揃え、
**`.service.ts` 接尾辞を持つのは barrel だけ**。

seam を **subject ではなく call graph** で決めるのが要点。`renderjob/` では
計画どおり movie の frame 機械と encode を分けると循環した: フレームを描くと
「次のフレーム」か「encode」に進み、encode が終わると「最後のフレームが到達
したはずの finish」に着地する。**1 つの状態機械**なので 1 ファイルに残し、
代わりに `encodeSpec.ts` (encode は要るか / ffmpeg はどこか / どの option か
= *答えのある質問*) を下層に切り出した。

`helpers/` に残すのは cross-domain のものだけ、という規則も実際の判断材料に
なった。`parseGenericProps` は 3 ドメインが読むので残し、`resolvePropTarget`
は 1 つしか読まないので `props/` に入れた。

### transport は「返事を待たない呼び出し」を分けた

pointer event ごとに postMessage が 2 往復していた (要求 + 誰も待たない
reply)。`NO_REPLY_SEQ` を導入して input と resize を片道にし、event は
**購読者を引いてから parse** する形にした (購読者のいない slot は
`JSON.parse` しない)。`perf.ts` の A/B フラグは実挙動を gate していたので
dead ではなく、pin テストを書いてから畳んだ。

## 採らなかった案

| 案 | 採らなかった理由 |
|---|---|
| state ライブラリ (zustand 等) の導入 | context 3 分割で hot path の粒度が足りた。依存を 1 つ増やす対価に見合わない |
| `lib/` に汎用 hook を集める | 否定でしか定義できない名前で、catch-all になる (上記) |
| `__test__/` のミラー構成を維持 | 323 本が 1 階層フラットで、141 本は worker・51 本は main のテストだった。colocate にした |
| `components/` を type-based のまま維持 | `panes/` と `panels/` の区別が既に破綻していた |
| worker event の microtask batching | sync な `_methods` の reply が microtask flush より先に post され、event と reply の順序が逆転する |
| clipboard の 5 つの名前生成を `helpers/uniqName` に統合 | 接尾辞が違う (`_1` と `(1)`)。名前は scene tree に出るので、統合は refactor の顔をした挙動変更になる |
| `apbsTypes.ts` を `apbs/` に取り込む | settings pane・dialog・context が読む boundary DTO。`worker/server/` は UI から import できない |
| macOS clipboard peek のキャッシュ (B70) | Electron に prefix 読みが無く、小さな header format の併置も `writeBuffer` が clipboard を置換するため不可。focus 無効化キャッシュは Paste の enable が stale になる。頻度も hot path ではない |

## 分かったこと

**巨大 component / hook の分割は、隠れた closure 依存を検出する。** 5 本の
分割で計 12 件の `exhaustive-deps` 漏れが出た (`ColorPane` 3 / `ScenePane` 1
/ `useRenderSettings` 3 / `AnimElementInspector` 5)。closure 捕捉されていた値
が引数になると ESLint が見えるようになる。すべて抑制ではなく依存に追加して
解消し、warning ベースラインは 128 -> 68 に下がった。

**行数は減るとは限らない。** `DragNumericField` は 851 -> 1,127 行に増えた。
共有 state を明示的に渡す必要が出るため。得るのは「1 ファイル 350 行以下 +
各ファイルが自分の不変条件を述べる」であって行数削減ではない。

**ESLint flat config は rule option を merge せず上書きする。** 後から広い
ブロックを足すと、先に書いた狭いルールが**無言で消える**。新ルールは必ず
わざと違反を書いて error が出ることを確認する。実際 1 度踏んだ。

**jsdom は `getBoundingClientRect().width` が 0。** 幅に依存する挙動は
38 個のテストがあっても regression を捕まえられない。幅をスタブするか、
目視確認の項目に明示的に入れる。

**「レシピの後半だけ」が書かれていることがある。** 両ウィンドウとも
`ready-to-show` ハンドラを持ちながら `show: false` が無く、ハンドラは何も
していなかった。ただし `show: false` を足しても直らない: `ready-to-show` は
**空の root 要素の初回 paint** で発火する (計測: 構築 +47ms が first paint、
中身が届くのが +176ms)。さらに `maximize()` は隠しウィンドウを表示する。
表示のタイミングは renderer 側の申告 (`IPC.WINDOW_REVEAL`) にした。

**UXP parity は正しさの保証ではない。** coloring の potential 出口欠落は
UXP にも同じバグがあり、移植で継承していた。C++ の実際の enum を確認する。

## 計測 (2026-08-31)

ベースラインは Phase 0 で取り損ねたが、**リファクタ開始前の commit
(`c80fb39a`) を checkout して同じ instrumentation を当て、両方ビルドして
比べれば後から取れる** (ウィンドウ表示の調査で使ったのと同じ手口)。
GUI 操作を人手に頼らず済むよう、drag は main から
`webContents.executeJavaScript` で canvas に `MouseEvent` を dispatch して
駆動した (両ツリーとも canvas に素の DOM listener を張っているので同じ
driver が使える)。各ツリー 3 回、全て同値。

### mouse drag (mousemove 120 回)

| | before (`c80fb39a`) | after |
|---|---|---|
| 送信 (postMessage) | 122 | 122 |
| **入力イベントへの返信** | **122** | **0** |

**pointer event 1 件あたりのメッセージが 2 (要求 + 返信) から 1 (要求のみ) に
なった。** Phase 5-B の `NO_REPLY_SEQ` が設計どおり効いていることの確認。
`mouseDown` / `mouseMove` / `mouseUp` の返信は 1 件も来ない。

### splitter drag (React commit) -- 追加計測

React の `Profiler` は **production ビルドでは no-op** なので、計測時だけ
`node_modules/react-dom/index.js` を profiling ビルドに差し替えた
(`electron.vite.config.ts` の alias では駄目 -- ベースラインには alias ブロック
自体が無く、置換が無言で空振りする)。sash は `[class*="sash"]` の中から
container を除き、縦・高さ 100px 超のものを選ぶ。**駆動は +100px -> -100px の
往復**にして、run 後にレイアウトが開始位置へ戻るようにする。

| (往復 200 step) | before (`c80fb39a`) | after |
|---|---|---|
| commit 数 | 2 / 2 | **0 / 0 / 0** |
| render 時間 | 4.6 / 6.0 ms | **0 ms** |
| 起動時 | 24 commits / 48-52 ms | 26 commits / 37-46 ms |

現ツリーで commit がゼロなのは、splitter のサイズを購読する React state が
無いため (Phase 2-3 で ref + debounce 保存に変更)。ベースラインは `setLayout`
が走って 2 commit / 約 5 ms。

**計測手順で 4 回間違えた。すべて「ゼロが出たとき、それが結果なのか計測失敗
なのか」を確かめる話だった**ので、手順として残す:

1. **sash を掴めていなかった** (`[class*="sash"]` が container にマッチ)。
   pane 幅の前後を測って発覚 -- 幅が動いていない状態の commit 0 は無意味。
2. **Profiler が無効だった** (production ビルド)。**起動時の commit 数**という
   「必ず非ゼロになるはずの値」を見て発覚。
3. **ベースラインだけ Profiler が無効だった**。instrumentation スクリプトの
   `.replace` に `assert` を付けておらず、ベースラインに存在しないコードへの
   置換が無言で失敗していた。**生成系の置換には必ず `assert` を付ける**。
4. **開始位置が run ごとに違った**。片道 +100px の drag が
   `app-state.json` に永続化され、229 -> 1229 px まで累積していた。
   before/after で splitter の位置が違えば再レンダーする木の大きさも違う。
   往復にして解決 (レイアウトを壊さない副次効果もある)。

### T2-1(a): 実装しない (実測による判断)

`EventSlots` のカウンタを露出して測ると **`skipped: 0`** -- 到着したイベントは
すべて observer が見つかる。slot 登録は renderer / worker 両側で対称なので
normal operation に「dead slot」が存在せず、**このフィルタは何も skip しない**。
計画の前提が誤りだった。

代わりに実在する無駄が測れた: drag 中に C++ が発火する view イベントは 117 件
だが renderer には **234 件**届く。`SEM_VIEW` の購読が 2 つあり、C++ の
`ScrEventManager` は**登録フィルタごとに配送する**ため:

| 購読元 | category | evtMask |
|---|---|---|
| `useViewXform` | `''` | `SEM_ANY` |
| `useActiveViewState` | `viewPropChanged` | `SEM_PROPCHG` |

後者は前者に完全に含まれるが、マスクが異なるので単純な dedupe では統合できない
(包含関係の判定か、propname のサーバ側フィルタ = 契約変更が要る)。実測値を
記録し、対処は別途判断とする。

### 比較できなかったもの

同じ drag で `viewPropChanged` イベントの受信数が **before 0 / after 234**
と大きく違ったが、**これはツリーの差ではなく購読の差**なので比較として
成立しない。C++ の `ScrEventManager` は登録されたフィルタに一致する
イベントだけを配送するので、受信数は「その瞬間どの pane が mount されていて
何を購読しているか」で決まる。2 つのビルドで pane の状態を揃える手段が
無かった (揃えるには GUI 操作が要る)。

したがって **drag 中の総メッセージ数については何も主張できない**。計画の
Phase 5 ゲート「mouse drag 中の postMessage 数が半減」は、送信のみを見れば
122 -> 122 で**変わっておらず**、往復回数で見れば 2 -> 1 で半減している。
どちらの意味で書かれたゲートなのかが曖昧だったので、ここに実測を残す。

### 計測して分かった実装漏れ

worker 側にカウンタを入れて測ると `cb=240 posted=240` で、**C++ からの
コールバック 240 回に対して post も 240 回**。Phase 5-B の T2-1(a)
「`WorkerService` が `_liveSlots` を持ち、購読者のいない slot への post を
skip する」は**実装されていない** (`registerWorkerEventListener` に
`isLive` 引数が無い)。5-B で実際に入ったのは (b) の lazy parse と
`NO_REPLY_SEQ` だけだった。

### 測っていないもの

タブ切替と splitter drag の React commit 数は、どちらのツリーにも
`<React.Profiler>` が入っておらず (Phase 2-5 の `RenderProfiler` は結局
実装しなかった)、駆動にも DOM 操作が要るため未計測。animation 再生の
IPC 数も、アニメーションを持つ scene を headless で用意する必要があり未計測。
これらは代わりに性質を test で固定してある (`renderIsolation` /
`LayoutProvider` の drag / `sceneTreeStability`)。

## 残課題

- **Phase 5-A Tier 2**: 残り ~85 の flat service を calls slice と 1:1 の
  ~16 フォルダへ (機械的な `git mv` + `Result` 採用)
- **B89**: `createDefPaintColoring` の `sceneUid = 0` 既定。呼び出し元は全て
  値を渡しているので実害はないが、型で再発防止するなら既定を外す
- **`cancelled` flag の one-shot fetch** 13 箇所と component 内 fetch guard
  16 箇所を `useStaleGuard` / `useLiveFetch` へ (Phase 2-1 から外した分)
- **view イベントの二重配送**: `SEM_VIEW` を購読する 2 つの hook に C++ が
  それぞれ配送するため drag 中の受信が 2 倍になる (上記「T2-1(a)」)。統合には
  購読の包含判定か propname のサーバ側フィルタが要る
- **タブ切替の commit 数**: 2 つ目の molview タブを headless で作る手段が
  無く未計測 (tab bar に新規タブのボタンが無く、accelerator は native menu が
  消費する)
