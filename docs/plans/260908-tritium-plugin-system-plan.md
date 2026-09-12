# tritium plugin システム 実装プラン (JS/TS + C++ 両レーン)

作成日: 2026-09-08

調査セッション: 2026-09-01 (VSCode 拡張機構の調査 / Python 実現性 / C++ 側 plugin と
配布サイズ) + 2026-09-08 (packaging と配置 / C++ レーンの seam 実測)。

**実装状況 (2026-09-12 更新): Phase 0 のみ実装済み。** react-gui のレジストリを実行時に
開き、既存機能 3 つ (Component Catalog / Get PDB / Sequence panel) を内蔵 plugin として
同じ経路に載せ替えた。ビルド時同梱 (in-tree) までで、実行時ロードは含まない。
仕様と書き方は [`../architecture/tritium_plugin/`](../architecture/tritium_plugin/_index.md)。
Phase A (別 bundle の実行時ロードと packaging)、Phase A' (C++ dlopen レーン)、
Phase B (schema 駆動 UI / userData sideload)、Phase C は**未実装**。
本文書は履歴として残す (計画時点の調査結果と設計方針)。

---

## 1. 目的と前提

### 目的

tritium (react-gui) の機能を増やしていくにあたり、機能を plugin 単位に切り出し、
ユーザが必要なものだけ有効化できるようにする。加えて、**今後追加する C++ の拡張
(新しい file reader / renderer) を libcuemol2 本体を再ビルドせずに足せる**経路を作る。

**既存機能の plugin 化 (切り出し) が目的ではない**。既存機能はそのまま残し、
「今後の拡張をどこに書くか」の受け皿を作るのが本題。

### 決定済みの前提 (2026-09-01 セッションでユーザが確定)

| 項目 | 決定 |
|---|---|
| plugin 作者 | **内製 / 共同研究者のみ**。サードパーティ配布は考えない |
| 配布元 | **CueMol3 開発元のみ** |
| plugin 言語 | JS/TS を第一。Python は将来レーン (後述 §6) |
| C++ plugin | 対象に含める (2026-09-08 に追加。当初は対象外だった) |

この前提から**不要になるもの**: サンドボックス / 権限モデル、署名検証、Marketplace、
公開 API の semver 凍結、Workspace Trust 相当。残る本質コストは
「レジストリを実行時に開くこと」と「plugin コードの実行場所」の 2 つだけ。

---

## 2. VSCode 拡張機構から移せるもの / 移せないもの

VSCode の拡張機構は 7 層に分離されている: (1) マニフェスト = 静的宣言、(2) 起動時
スキャンと中央レジストリ登録、(3) 遅延活性化、(4) Extension Host = 別ランタイム、
(5) 型付き RPC プロキシ、(6) UI は「宣言 + データ」か iframe の二択、(7) 配布と互換性。

- **移せる**: マニフェスト駆動の宣言的寄与 / 中央レジストリ / 型付き RPC プロキシ /
  データ駆動 UI + iframe の二択 / 狭い手書き公開 API
- **移せない**: 独立した extension host プロセス (§3 障害 B) / 任意 React UI

### tritium 側の対応物 (調査済み)

| VSCode の層 | tritium の相当物 | 状態 |
|---|---|---|
| commands レジストリ | `renderer/commands/CommandRegistry.tsx` | 実行時レジストリとして既に存在 |
| コマンド ID / 型契約 | `commands/ids.ts` / `commands/CommandMap.ts` | 閉じた union 型。外部 ID を足せない |
| menus 寄与 | `shared/menuTemplate.ts` | データ駆動だが静的配列 |
| views 寄与 | `shell/ActivityBar.tsx` / `shell/SidePanel.tsx` の `VIEW_PANES` | 静的 Record |
| configuration 寄与 | `shared/types/uiPrefs.ts` + electron-store | 静的 |
| データ駆動 UI | `features/inspector/` の `SchemaSection` / `propModel.ts` | schema からフォーム生成。最有力の足場 |
| extension host | Web Worker (`worker/server/`, `nodeIntegrationInWorker: true`) | 存在するが用途は描画本体 |
| RPC プロトコル | `worker/shared/calls/` の `ServiceMap`/`MethodMap`/`RpcMap` | proxy identifier とほぼ同型。型キーはコンパイル時 |
| サービス登録 | `worker/server/services/index.ts` の `import.meta.glob(eager)` | ビルド時グロブ |
| webview 相当 | なし | - |
| 配布 / レジストリ | なし | - |

**評価**: 「コマンド + サービス + メニューデータ + schema 駆動 UI」という骨格は既に
揃っている。足りないのは「実行時に開いていること」と「別ランタイム」と「配布」。

---

## 3. JS/TS レーンの障害

### 障害 A: 全レジストリがコンパイル時の閉世界

`CmdId` は const object、`CommandMap` は型マップ、`menuTemplate` は静的配列、
`VIEW_PANES` は静的 Record、worker service は `import.meta.glob`、renderer は Vite の
単一バンドル。**「後から足す」経路が物理的に存在しない**。

これは設計ミスではなく「マップ行を足すと callsite 側が compile error で誘導される」
という現行の型安全戦略の結果。plugin 化するなら、**内蔵機能は今の型付きマップのまま、
plugin 由来だけ文字列キー + 実行時スキーマ検証の別レーンにする**二重化が要る
(VSCode も built-in extension と外部 extension を同機構で扱いつつコアの型は別扱い)。

### 障害 B: extension host を置く場所がない (最大の問題)

VSCode が ext host を分離できるのは、扱うモデル (テキスト) が安く複製できるから。
tritium のモデルは **worker 内の C++ オブジェクト**であり、ADR-0035 のとおり
native addon は main window の renderer にしか存在しない (第 2 window は別プロセス =
独立した libcuemol2 状態になる)。つまり plugin host を別プロセス / 別 worker にしても
そこに libcuemol2 の状態を持てない。選択肢は 2 つで、どちらにも代償がある:

1. **plugin を描画 worker の中で走らせる** — C++ 呼び出しが同期で速い。代わりに
   plugin の無限ループ = 描画フリーズ。watchdog / タイムアウト / 規約が要る
2. **専用 plugin worker から描画 worker へ RPC** — 隔離できる。代わりに全 C++
   アクセスが postMessage 往復になり、描画 worker が再入呼び出しを受けられる必要がある

内製限定という前提では **1 を採り、watchdog で凌ぐ**のが妥当。

### 障害 C: UI 寄与とデザインシステムの衝突

`docs/migration/ui-style-guide.md` の form-kit 規約は、plugin 作者が任意の React/CSS を
持ち込むと即座に崩れる。加えて Vite の単一バンドル構成では、実行時ロードした ESM に
React インスタンスを共有させるには react/react-dom の external 化 + import map が要る。

対策は VSCode と同じ二択:
- **既定: schema 駆動**。`features/inspector/SchemaSection` を plugin 向けフォーム schema に
  一般化する。見た目はコアが描くのでスタイルガイドが自動的に守られる
- **逃げ道: webview 相当の iframe** + postMessage。Electron 側は
  `contextIsolation: true` / `nodeIntegration: false` (`main/windows/windowChrome.ts:63`) なので前提は整っている

なお **Phase A (同梱のみ) では plugin を Vite の入力に含めてビルド時に解決できる**ため、
React 共有問題そのものを回避できる。

### 障害 D: 公開 API の凍結コスト

`tritium/core/src/wrappers/` は `.qif` からの自動生成。これを plugin に露出すると
libcuemol2 の C++ API が事実上凍結される。`@cuemol/plugin-api` のような**手書き・狭い**
ファサードを介するべき (内製限定なので append-only の縛りまでは不要)。

---

## 4. C++ レーン (2026-09-08 調査)

### 4.1 良い知らせ: 登録機構はすでに plugin 前提の形をしている

- **`<mod>_regClasses()` / `<mod>_unregClasses()` は mcwrapgen が自動生成済み**
  (`src/modules/molvis/molvis_loader.cpp:34`)。dlopen 後に呼ぶエントリポイントとして
  そのまま使える
- `molvis::init()` は `molvis_regClasses()` + `RendererFactory::regist<>()` を呼ぶだけ
  (`src/modules/molvis/molvis.cpp:32`)。plugin は `extern "C" cuemol_plugin_init()` を
  1 本被せるだけで済む
- `src/modules/molvis/CMakeLists.txt:81` に `# add_library(molvis SHARED ...)` が
  コメントアウトで残り、`MOLVIS_API` (`molvis.hpp:18`) / `QLIB_API` の dllexport /
  visibility マクロが全モジュールに生きている。**legacy CueMol2 が DLL モジュール
  構成だった名残**で、SHARED に戻す土台がある
- `ClassRegistry` は regist/unregist 両方、`StreamManager` も `unregistReader`
  (`src/qsys/StreamManager.hpp:95`) を持つ。ランタイム登録・解除は設計として想定済み

### 4.2 TS 側は「自動的に見える」ものが多い

| plugin が足すもの | TS 側で必要な作業 |
|---|---|
| 新しい **Renderer** | **discovery はゼロ**。一覧は C++ の `searchCompatibleRendererNames()` から来る (`worker/server/services/helpers/rendererFilter.ts` は denylist を被せるだけ) -> Add renderer に自動で出る。Inspector の専用ページだけ TS 側で書く |
| 新しい **file reader / writer** | **ゼロ**。一覧は `StreamManager::getInfoJSON2()` (`StreamManager.hpp:103`) から来る -> file-open の filter に自動で出る |
| 新しい scriptable クラス | **wrapper クラスは不要**。`invokeMethod()` / `getProp()` の generic 経路で使える。ただし §4.4 F-1 の fallback が前提 |

さらに:
- Inspector は type 名で schema を引き、**未知の type は common page にフォールバック**
  する (`features/inspector/rendererPropSections.ts:117` のコメントに明記) -> plugin
  renderer が入っても落ちない
- `MC_DYNCLASS` のみのクラスは最も近い `MC_SCRIPTABLE` 祖先として TS に現れる
  (`tritium/core/src/cuemol.ts:78`) -> **新 API を足さない reader なら TS wrapper が不要**

つまり「新しいファイル形式リーダーを足す plugin」は **C++ だけで完結し、TS 側の変更
ゼロで UI に出る**。C++ plugin 機構の最初の検証対象として最適。

### 4.3 足りないもの (3 つ)

#### (a) dlopen 機構がゼロ

`src/` 全体で `dlopen` / `LoadLibrary` の使用は **0 件**。`data/sysconfig.xml:20` の
`module.dir` エントリは**読む側のコードが存在しない**。`src/libcuemol2_api/loader.cpp:129`
が `molstr::init(); anim::init(); ...` と静的に列挙している。

実装自体は小さい:
- qlib に薄い DynLib (dlopen / LoadLibrary のラッパ) を 1 本
- `loader.cpp` の module init 直後に plugin dir を走査 -> `cuemol_plugin_init()` を
  解決して呼ぶ
- `fini` では **コアの `qsys::fini()` より前に** plugin の unreg を回す

**タイミング制約**: module init 直後・scene load 前・startup probe 前の **1 回だけ**に
する。ADR-0037 (scene-export capability gate) の「availability は静的なビルド属性」
という前提を保つため、**遅延活性化を C++ には持ち込まない**。

#### (b) out-of-tree ビルドができない (実務上の最大障害)

`install(TARGETS cuemol2 FILE_SET HEADERS)` (`src/CMakeLists.txt:323`) が install して
いるのは **7 ヘッダだけ**: `common.h` / `qmtypes.h` / `_version.h` /
`libcuemol2_api/{api,loader,gui,binding}.hpp` (`src/CMakeLists.txt:315-320`)。
`qlib/ClassRegistry.hpp` も `qsys/RendererFactory.hpp` も入っていない。CMake package
config の export も、mcwrapgen の install もない。

本格対応に必要なもの:
- ヘッダ install 範囲の拡張 (qlib / qsys / gfx + 必要な module 群)
- `cuemol2Config.cmake` の export (`install(EXPORT ...)`)
- mcwrapgen + `src/mcwgen.cmake` の install (`.qif` を使う場合のみ必須)
- Boost / CGAL のヘッダ依存を plugin 側にも通す手当て

**逃げ道 (Phase A' で採る)**: plugin を cuemol2 repo 内 (例 `src/plugins/<name>/`) に置き、
アプリと同じビルドで作って成果物の .so だけを plugin ディレクトリに配置する。
共同研究者には repo の branch / PR で書いてもらう。内製限定なら (b) は丸ごと不要。

#### (c) ABI 互換 = plugin はアプリと同一ビルドに縛られる

plugin は `qlib::ClassRegistry` / `qsys::RendererFactory` / Boost / CGAL の C++ シンボルに
直接依存する。同一コンパイラ・同一 libc++・同一 Boost でなければ壊れる。

**plugin をアプリと独立にバージョニングするのは原理的に不可能**。plugin は必ず同じ CI
実行で作り、同じ tag で出す。これは制約というより設計指針で、§5 の「配布物を増やさず
同梱する」判断とちょうど噛み合う。

### 4.4 plugin が足した API を TS から使う (wrapper 問題)

**結論: wrapper クラスは必須ではない。`invokeMethod()` / `getProp()` の generic 経路で
足りる。ただし未登録クラス名の fallback (下記 F-1) を先に入れること。**

#### 現行パイプラインは全部ディレクトリ駆動

| 段 | 実体 |
|---|---|
| 1 | mcwrapgen が `.qif` から `<Class>.ts` を生成 -> `${CMAKE_BINARY_DIR}/ts/wrappers` |
| 2 | `make_es6_wrapper_table.py` が**その dir を `*.ts` で glob** して `wrapper-loader.ts` を生成 (`src/python/make_es6_wrapper_table.py:44`。PascalCase stem のみ。**ハードコードされたクラス一覧は無い**) |
| 3 | `install(FILES ${MCWG_NODEJS_WRAPPERS} DESTINATION share/typescript)` (`src/mcwgen.cmake:153`) |
| 4 | tritium/core の `copy_wrappers` が `copy_directory share/typescript -> tritium/core/src/wrappers/` (`tritium/core/CMakeLists.txt:191`) |
| 5 | Vite が worker bundle に取り込む (`@cuemol/core` 本体は external だが `@cuemol/core/src/cuemol` は deep import なので bundle される) |

`tritium/core/src/wrappers/` は **git 管理外の生成物** (`git ls-files` で 0 件)。

#### 方式 1 (既定): build 時に本体の wrapper table へ混ぜる

plugin を `src/plugins/<name>/` に置き、既存モジュールと同じく `MCWRAPGEN_CLASS` /
`MCWRAPGEN_SCR_WRAPPERS` を呼ぶだけで、wrapper は**自動的に table に載る**。追加機構ゼロ。
§4.3(c) の ABI 制約により plugin はどのみちアプリと同一ビルドなので、新たな制約にならない。

plugin を無効化 / 非同梱にしたときに table にクラスだけ残るのは**無害**。wrapper は C++ 側に
クラスが登録されていなければ使われないだけで、前例もある (`UmbreonSceneExporter` は umbreon
無効ビルドでも table に残る)。capability 判定は `getInfoJSON2()` / `hasClass()` 側の担当
(ADR-0037)。

欠点は「アプリを更新せずに plugin だけ差し替える」ができないことだが、ABI 制約がある以上その
要求自体が成立しない。

#### 方式 2: 実行時登録 (後入れが要求されたときだけ)

`wrapper_map` は plain object だが **worker bundle の内側 (IIFE) に閉じていて外から import
できない**。したがって `CueMol` に `registerWrapper(className, Klass)` を足し、**plugin の
activation 時に worker がその関数を plugin に渡す** (`ctx.registerWrapper`) 形になる。

注意: 生成 wrapper は継承チェーンを相対 import で作る (`TrajBlock.ts` は
`import { Object } from './Object'`)。plugin 側で bundle すると `BaseWrapper` / `Object` の
コピーが 2 つできる。実害は `cuemol.ts:231` の `isWrapper` の `instanceof` だけで、しかも
`isWrapper` / `isImplementation` は**アプリ内で 1 箇所も使われていない**。

#### 方式 3 (推奨): wrapper を作らず generic 経路で使う

生成 wrapper は**型付きシュガーにすぎない**。`TrajBlock.ts` の実体は
`get nframe(): number { return this.getProp('nframe'); }` であり、`BaseWrapper` が
`getProp` / `setProp` / `invokeMethod` / `getPropsJSON` / `hasProp` / `resetProp` /
`getClassName` / `getAbiClassName` を全部持っている。**untyped でも機能は完全**。

plugin が足した新メソッドが generic 経路で届く根拠:
`invokeMethod` は `MC_SCRIPTABLE` ごとに生成される **virtual override** (`src/qlib/mcutils.hpp:82`)
で、N-API 側は native object に対して `pthis->invokeMethod(nm, args)` を呼ぶだけ
(`src/libcuemol2_api/binding.cpp:258`)。つまり**どの TS wrapper を被せているかと無関係に、
最派生クラスの実装へ名前で dispatch される**。

型は plugin 側の手書き `.d.ts` ファサードで被せればよい (libcuemol2 の生成 wrapper を
公開 API にしない、という §3 障害 E の方針とも一致する)。

#### クラス名の見え方 (どちらになるかで fallback の要否が決まる)

`getClassName()` は `getScrClassObj()` = **最も近い `MC_SCRIPTABLE` 祖先**を返す
(`tritium/core/cxx_src/wrapper.cpp:117`)。

| plugin クラスの宣言 | `getClassName()` が返す名前 | wrapper_map | 必要な手当て |
|---|---|---|---|
| `MC_DYNCLASS` のみ (`.qif` なし = 新 scriptable API なし) | 祖先の名前 (`ObjReader` など) | ヒットする | **なし** |
| `.qif` あり (新 property / method を足す) | **plugin 自身のクラス名** | ミスする | **F-1 の fallback が必須** |

#### F-1: 未登録クラス名の generic fallback (実装必須)

`tritium/core/src/cuemol.ts:92` の `createWrapper` は、wrapper 未登録のクラス名に対して
**例外を投げる**:

```ts
const Klass = wrapper_map[className];
if (!Klass) {
    throw new Error(`createWrapper: no wrapper registered for class "${className}".`);
}
```

これを **`new BaseWrapper(nativeObj, this)` を返す fallback に変える** (throw をやめる)。
理由:

- 方式 1 でも、plugin を**非同梱ビルド**した配布物では table に wrapper が無い状態が起きうる
- 方式 3 では、`.qif` を持つ plugin クラスが 1 つでも C++ から返ってきた瞬間に throw する
- throw のままだと、plugin を無効にした状態で該当 scene を開いただけでアプリが落ちる

fallback 実装時の付随事項:
- 握り潰さず `console.warn` を 1 回出す (どのクラスが untyped で流れているか分かるように)
- `BaseWrapper` は `getProp` / `invokeMethod` を持つので、**fallback しても機能は落ちない**。
  失われるのは型と IDE 補完だけ
- 既存テストがこの throw に依存していないかを確認する (`createWrapper` の異常系テスト)

#### F-2: メソッド存在確認の口が無い (小さいギャップ)

N-API `Wrapper` が公開しているのは `hasProp` / `getProp` / `setProp` / `resetProp` /
`getPropsJSON` / `hasPropDefault` / `invokeMethod` / `getClassName` / `getAbiClassName`
(`tritium/core/cxx_src/wrapper.cpp:596-604`)。**`hasMethod` / `implements` が無い**ため、
「この plugin メソッドが存在するか」を TS から確認するには try/catch するしかない。

C++ 側には `LInvokable::hasMethod` (`src/qlib/LPropSupport.hpp:93`) と
`implements(nm)` (`src/qlib/mcutils.hpp:84`) が既にあるので、`hasProp` と同じ形で
1 メソッド生やすだけで済む。plugin の capability 判定を書きやすくするため、Phase A' で
入れておくとよい。
- **plugin 無しで .qsc を開いたときの挙動が未確認**: scene に plugin renderer が残って
  いるケースは必ず起きる。`src/qsys/SceneXMLReader.cpp:355` の `createObjByTypeNameT`
  経路が未知 type に対して tolerant かどうかを実装前に確認する (§8)
- **重い依存の二重ロード**: plugin が OIDN / TBB のような重いライブラリを独自に static
  link すると、アプリ側と二重に載る

### 4.5 やらないこと

- **既存機能の切り出しを目的にしない**。実測で、libcuemol2 の C++ コード総量は 12.8 MB
  しかなく (dylib 65 MB の内訳は OIDN の学習済み重み 44.4 MB + Embree 4.9 MB +
  `__text` 12.8 MB + `__LINKEDIT` 7.0 MB)、sysdep の分離は 0.46 MB にしかならない。
  配布サイズ目的の分割は割に合わない
- **umbreon の plugin .so 化は採らない**。size は解決するが
  `docs/plans/umbreon-process-isolation-plan.md` §2 の PartitionAlloc crash は
  in-process である限り解決しない。umbreon は process 分離が上位互換

### 4.6 plugin から既存の依存ライブラリを使う

libcuemol2 は多くの third-party を **static link して 1 本の dylib に畳んでいる**。plugin が
同じものを使いたいとき、どう解決するか。

#### 現状の内訳

| 種別 | 実体 |
|---|---|
| **static (libcuemol2 に埋め込み)** | 内部モジュール全部 (`qlib` / `gfx` / `qsys` / `molstr` / `molvis` / `xtal` ... 全て `add_library(... STATIC)`)、vendored の `qmpcre` / `qmexpat` / `qmpng` / `qmzlib`、deplibs の **oneTBB / Embree / OIDN / umbreon / MeshMS**、GLEW |
| **shared (別 dylib として同梱)** | **Boost** (`Boost_USE_STATIC_LIBS OFF`, `src/CMakeLists.txt:29`)、LibLZMA、OpenGL |
| **header-only** | CGAL |

#### macOS / Linux: libcuemol2 にリンクするだけで解決する

`MB_HAVE_GCC_VIS_ATTR` は `src/config_cmake.h.in:286` で**コメントアウトされたまま**なので
`QLIB_API` / `QSYS_API` は非 Windows で空に展開され、`-fvisibility=hidden` の指定も
プロジェクトのどこにも無い。結果、**全シンボルが default visibility で export される**。

実測 (`tritium/core/build/lib/libcuemol2.dylib`、export 済み 23,074 個):

| シンボル | export 数 |
|---|---|
| `qlib::ClassRegistry` | 18 |
| `qsys::RendererFactory` | 14 |
| oneTBB (`tbb::detail::r1::*`) | **74** |
| OIDN | 574 |
| umbreon | 86 |
| MeshMS | 41 |
| zlib (`deflate`) | 1 |
| libpng | 2 |
| **Embree (`rtcNewDevice`)** | **0** |

static で取り込んだ third-party も dylib の export として plugin から解決できる。plugin 側は
`target_link_libraries(plugin PRIVATE cuemol2)` 相当だけでよい。

**例外は Embree**。`nm -m` で `_rtcNewDevice` は `non-external (was a private external)` =
Embree 自身が hidden visibility でビルドされているため見えない。Embree を直接使う plugin は
umbreon の API 経由にするか、libcuemol2 側で re-export が要る。

配布物でも問題ない: `collect-cuemol2-runtime.sh` の `strip -x` は local シンボルのみ落とすので、
staged 版でも 22,737 個が残る (`ClassRegistry` / `RendererFactory` も確認済み)。

#### Windows: API マクロが付いたものだけ

`QLIB_EXPORTS=1` は WIN32 のときだけ定義され (`src/qlib/CMakeLists.txt:212`)、
`__declspec(dllexport)` が static lib 経由で `cuemol2.dll` の export table に載る。plugin 側は
**`LINK_SHARED` を定義**して `__declspec(dllimport)` に切り替え `cuemol2.lib` にリンクする
(この分岐は `src/qlib/qlib.hpp:15` に既にある。legacy の DLL モジュール構成の名残)。

ただし export されるのは API マクロ付きのシンボルだけで、**vendored zlib/png/expat/pcre、
TBB、Embree、OIDN は Windows plugin から一切見えない**。

#### 原則: 同じ static lib を plugin 側で再リンクしない

プロセス内に 2 コピーができる。zlib/png/expat/pcre は ODR 違反と「片方で確保して他方で解放」
によるヒープ不整合、OIDN は 44 MB の重みブロブが二重に載る。**oneTBB は最も危険**で、
`src/cmake/tbb.cmake` のコメント自体が

> libcuemol2 is the only in-process consumer, so a single static copy is safe and the
> oneTBB scheduler-singleton caveat does not apply.

と書いている。**plugin が来た瞬間にこの前提が崩れる。**

#### TBB をどうするか (plugin が最も踏みやすい)

plugin が multithreading を書こうとすると TBB に触りたくなる。判断:

| 案 | 内容 | 評価 |
|---|---|---|
| **1 (推奨)** | TBB は static のまま。plugin は `qlib/parallel.hpp` の `qlib::parallel_for` を使う。Windows のためだけに、`QLIB_API` を付けた**非テンプレートの薄い entry point** を 1 本足して export する (例: `std::function<void(size_t)>` を取る `parallel_for_impl`) | 3 OS 共通で runtime が 1 つ。配布物が増えない。std::function 越しのオーバーヘッドは粒度の粗いループなら無視できる。DLL 境界を `std::function` が越えるが、同一コンパイラ / 同一 STL は §4.3(c) の ABI 制約で既に保証される |
| 2 | oneTBB を shared 化し、libcuemol2 と plugin が同じ `libtbb.dylib` を見る | 最も素直だが、deplibs バンドルの作り直し (umbreon / Embree / MeshMS / OIDN が全部同じ shared TBB を見る必要)、配布物 +1、3 OS 分の rpath と署名、`tbb.cmake` の設計判断の反転。**得られるのは「Windows plugin が TBB を直接使える」だけ** |
| 3 | plugin は `std::thread` / `std::async` を使い TBB に触らない | 最も安い。libcuemol2 の TBB 並列と入れ子になると oversubscription するが、粒度が粗ければ実害は小さい |

**macOS / Linux では TBB を shared 化する必要はない** — r1 ABI 74 本が既に export されており、
plugin が TBB ヘッダを include して libcuemol2 にリンクすれば**同一 scheduler を共有する**。
shared 化の唯一の動機は Windows だが、案 1 のほうが安い。

付随する注意:

- **tbbmalloc は入っていない** (`scalable_*` の export は 0)。`tbb::scalable_allocator` は
  使えない。`cache_aligned_allocator` は r1 の `cache_aligned_allocate` が出ているので使える
- `ENABLE_TBB` の既定は **ON** (`CMakeLists.txt:20`)。`src/CMakeLists.txt:43` のコメントが
  "default OFF" と書いているのは**誤り**なので、ついでに直す
- `qlib::parallel_for` は `HAVE_TBB` が無いと黙って直列になる。plugin は
  `qlib::parallel_enabled()` / `parallel_max_concurrency()` を見て挙動を決める
- `qlib/parallel.hpp` は header-only。`ensureThreadLimit()` の関数内 static は
  macOS/Linux では weak symbol として 1 つに畳まれる。Windows で案 1 の entry point 経由に
  するとインスタンスは本体側 1 つに固定されるので、こちらのほうが素直

#### plugin 固有の依存 (libcuemol2 が持っていないもの)

plugin 側で static link して閉じ込めるのが正しい。ただし macOS/Linux は default visibility
なので、**plugin のビルドでは `-fvisibility=hidden` を明示し `cuemol_plugin_init` /
`cuemol_plugin_fini` だけ export する**。そうしないと plugin 由来のシンボルが他へ漏れる。

#### Boost は shared なので rpath 設計が要る

plugin も同じ `libboost_*.dylib` にリンクする。これが §5.3 の配置に跳ね返る。

---

## 5. packaging と配置

### 5.1 実測した制約

| | 実態 | インストール後に plugin を置けるか |
|---|---|---|
| macOS | `asar: false`、`build/afterPack.js` で deep ad-hoc 署名、`hardenedRuntime: false`、notarization は未了 | `.app` 内に足すと CodeResources の seal が壊れる。Phase 4 (Developer ID + notarize + staple) 移行後は Gatekeeper に弾かれる -> **不可** |
| Windows | NSIS `perMachine: true` -> Program Files | 書き込みに管理者権限 -> **実質不可** |
| Linux | AppImage (read-only squashfs) + deb (`/usr` 配下) | **原理的に不可** |
| 書ける場所 | `app.getPath('userData')` のみ (前例: `main/stateStore.ts:80`、`user_styles.xml`) | ここだけ |

その他:
- **auto-update は未導入** (`electron-updater` なし)。配布は tag -> GitHub Release の
  installer 一式のみ
- **`bundle_apps` が最良の前例**: POV-Ray / apbs / ffmpeg はビルド時に
  `task download_extpkgs` で取得 -> `collect-cuemol2-runtime.sh` で staging ->
  `extraResources` で `Resources/bundle_apps/` に同梱 -> 実行時パスは
  `main/handlers/appPath.ts:45` が `process.resourcesPath` から解決し、dev は env var、
  ユーザー設定で上書き可能。**「同梱 + 実行時パス解決 + 設定で上書き」がすでに動いている**
- ロード経路が非対称: worker は `nodeIntegrationInWorker: true` で `require()` が使える
  (`electron.vite.config.ts` が `@cuemol/core` を external にして `require()` に落として
  いる前例そのもの)。renderer は dev が `http://localhost`
  (`main/windows/mainWindow.ts:171`)、packaged が `file://` なので**外部ファイルの
  dynamic import は経路が違う**

### 5.2 判断: plugin を独立した配布物にしない

配布元が開発元のみという前提では、独立配布はコストだけ増えて利点がほとんどない。
3 レーンに分け、**既定を「同梱」に置く**。

#### レーン A (既定): アプリに同梱する = built-in plugin

配置: `Resources/plugins/<id>/` (`extraResources` に 1 ブロック追加、`bundle_apps` と
同じ形)。ソースは monorepo に `tritium/plugins/<id>/` として置き、
`collect-cuemol2-runtime.sh` が staging する。

- ユーザには**有効 / 無効のトグルだけ**を見せる (VSCode の built-in extension と同じ)。
  「必要な機能だけ入れる」動機は、サイズではなく **UI の複雑さを減らす**ことで満たす
- JS/TS plugin は bundle 済みで数百 KB。同梱コストは実質ゼロ (現状 580 MB の 0.05%)
- 署名 seal を壊さない / version skew ゼロ / `@cuemol/plugin-api` の semver 凍結も不要
- **配布物が 1 個も増えない** (インデックス JSON もダウンローダも auto-update も不要)

#### レーン B: userData への sideload (JS/TS のみ)

配置: `userData/plugins/<id>/`。zip 展開、または開発中はディレクトリを直接指す。

- 探索順は **userData > 同梱** (同 id なら userData が勝つ)。built-in を差し替えて
  試せるのがこの経路の主目的
- dev は `CUEMOL_PLUGIN_PATH` で repo 直参照 (`BUNDLE_APPS` / `LIBCUEMOL2_ROOT` と同じ)
- 復旧路として「plugin を全部無効にして起動する safe mode」を最初から入れる

**native を含む plugin は userData に置かせない**:
- macOS: userData の未署名 dylib は、Phase 4 で `hardenedRuntime: true` + Developer ID に
  した瞬間 library validation で弾かれる。`disable-library-validation` entitlement で
  回避はできるが、アプリ全体の防御を下げる取引になる。同梱なら `afterPack.js` の deep
  署名対象に入り、Phase 4 の inner-first 署名にも自然に含まれる
- Windows: plugin DLL が `cuemol2.dll` を解決する必要がある。同梱なら install tree 内
  なので `AddDllDirectory` 1 行で済む
- Linux: `$ORIGIN/../lib` の rpath 前提が同梱なら維持される

#### レーン C: 重い native / データ pack

umbreon+OIDN 44 MB / ffmpeg 45 MB / apbs 14 MB は plugin 機構では解決しない別問題。
着手するなら「アプリと同じ tag の GitHub Release asset」として出し、アプリ自身が取得して
userData に展開する (Finder 経由の zip 展開は quarantine を伝播させるため)。
ただし**着手動機はサイズではなく、umbreon の PartitionAlloc crash が実害になったとき**。

### 5.3 ディレクトリ構成 (1 plugin = 1 ディレクトリ、C++ と TS を同居)

```
Resources/plugins/<id>/               <- JS/TS 部分 (extraResources)
  plugin.json                         # id, version, engines.cuemol (4-part 完全一致), contributes
  worker.cjs                          # 任意 (worker 側エントリ, bundle 済み)
  ui.mjs                              # 任意 (renderer 側エントリ, bundle 済み)

Resources/app/node_modules/@cuemol/core/build/lib/plugins/   <- native 部分
  lib<id>.dylib / <id>.dll / lib<id>.so
```

**native は libcuemol2.dylib と同じツリーに置く。** plugin は libcuemol2 と Boost
(shared、§4.6) にリンクするので、`Resources/plugins/<id>/native/` に置くと staged lib への
rpath が深く脆くなる (`@loader_path/../../../../app/node_modules/...`)。`build/lib/plugins/`
に置けば `@loader_path/..` で両方に届き、Windows も `cuemol2.dll` と同じ階層になるので
`AddDllDirectory` すら不要になる。1 plugin が 2 箇所に分かれるので、`plugin.json` の
`native` フィールドがファイル名を宣言して両者を結ぶ。

- `plugin.json` が「この plugin は native を持つか」を宣言。native が無ければ JS/TS だけで動く
- **plugin 側で bundle 済みにして配る**。実行時に npm 依存を解決させない
- 署名も checksum も不要 (内製限定)。zip は素の zip でよく、独自拡張子も不要
- renderer 側は dev(http) / packaged(file) の差を吸収するため、main に custom protocol
  (例 `cuemol-plugin://`) を 1 本登録して `import('cuemol-plugin://<id>/ui.mjs')` に統一する。
  副次的に読み取り範囲を plugin root に閉じ込められる

### 5.4 plugin dir を誰が渡すか

C++ plugin の dlopen は **worker 内の addon が持つ libcuemol2 インスタンス**に対して
起きる。plugin dir を知っているのは main なので:

- `initCueMol(confpath)` (`tritium/core/cxx_src/init_cuemol.cpp:97`) に plugin dir 引数を
  足すか、`cuemol2::init` 後に `loadPlugins(dirs)` を別 API で呼ぶ
- **sysconfig.xml に絶対パスを書かない**。パスは既存の `apppath` IPC
  (`main/handlers/appPath.ts`) に 1 フィールド足して main から流す。
  `defaultRenderBinaries` とまったく同じ形

---

## 6. Python レーン (将来)

Python も可能で、API 面は JS/TS より整っている (`src/pybr/pybr.cpp` の埋め込み CPython、
`share/python/*.py` の自動生成 wrapper、`src/pybr/scripts/cuemol.py` の `scene()`/`sel()`/
`UndoTxn`、`PythonBridge.qif` -> `tritium/core/src/wrappers/PythonBridge.ts` は生成済み)。
UXP では出荷済み機能だった。

ただし tritium では 3 点が塞がっている:
- (a) `ENABLE_PYTHON_EMBED` は posix で `EMBED_PYTHON_ROOT` があるときのみ ON、**Windows は OFF**
- (b) `tritium/packaging/collect-cuemol2-runtime.sh:101` が embed-python 版 libcuemol2 を
  検出するとエラーで停止する (`docs/architecture/tritium-packaging-renovation.md:160` の
  実地記録: 同梱 DMG は起動時に即終了)
- (c) `PythonBridge::runString` は `PyRun_SimpleString` を**同期で**呼ぶだけなので、
  描画 worker を専有して全描画・全 service が停止する

**方針**: JS/TS = 寄与 (contribution)、Python = 中身 (計算) に役割分担する。マニフェストは
JS/TS 側に 1 つだけ持ち、Python は `"python": { "entry": "analysis.py" }` のように宣言して
**JS/TS から呼ばれる側**に限定する。Python が無い環境ではその plugin だけ無効化すればよく
(判定は UXP の `cuemol.hasClass("PythonBridge")` がそのまま使える)、plugin 機構全体は生きる。

**Phase 1 では Python を入れない**。(a)(b) は plugin 機構と無関係な packaging タスクで、
これに引きずられると plugin 側が進まない。

---

## 7. 実装フェーズ

### Phase 0: レジストリを実行時に開く (plugin を作らずに)

`CommandRegistry` に文字列 ID の plugin レーンを足し、`menuTemplate` / `VIEW_PANES` /
Inspector schema を「静的配列 + 実行時追加分」の合成に変える。そのうえで**既存機能を
1-2 個「内蔵 plugin」として同じ経路に載せ替える** (VSCode 自身が自分の言語機能を
extension として実装し API を自分で検証したのと同じやり方)。

外部 plugin ゼロでも価値があり、失敗しても捨てやすい。

### Phase A: JS/TS built-in plugin の同梱

- `tritium/plugins/<id>/` のソース配置と bundle 手順
- `collect-cuemol2-runtime.sh` + `electron-builder.yml` の `extraResources` に 1 ブロック
- `appPath.ts` に plugin root の解決関数を 1 本 (packaged / dev の 2 分岐)
- マニフェスト読み込み + `contributes` のレジストリ登録 + 有効/無効の設定
- plugin コードは描画 worker 内で走らせる (障害 B の選択肢 1) + 実行時間 watchdog
- API は `@cuemol/plugin-api` の手書きファサードに限定

**配布物ゼロ増、署名影響ゼロ、CI 時間増ゼロ。**

### Phase A': dlopen 機構 + 同梱 native plugin

- qlib に DynLib、`loader.cpp` に plugin 走査 + `cuemol_plugin_init()` 呼び出し
- `initCueMol` / `apppath` に plugin dir を通す
- plugin は `src/plugins/<name>/` に置き、アプリと同じビルドで .so を作る (§4.3(b) 逃げ道)。
  `.qif` があれば TS wrapper は既存パイプラインで自動的に table に載る (§4.4 方式 1)
- **`createWrapper` の generic fallback (§4.4 F-1) を先に入れる**。これが無いと、`.qif` を
  持つ plugin クラスが C++ から返った瞬間に throw する。plugin 非同梱ビルドでも同じ
- (任意) `hasMethod` / `implements` を N-API `Wrapper` に生やす (§4.4 F-2)
- **依存の解決規約を決めて plugin の CMake テンプレートに落とす** (§4.6): plugin は
  libcuemol2 にのみリンクし static lib を再リンクしない / plugin 固有依存は
  `-fvisibility=hidden` で閉じ込める / Windows は `LINK_SHARED` を定義する
- **TBB は案 1 を採る** (§4.6): `qlib::parallel_for` を使わせ、Windows 用に `QLIB_API` 付きの
  非テンプレート entry point を 1 本 export する。あわせて `src/CMakeLists.txt:43` の
  "default OFF" コメント (実際は `CMakeLists.txt:20` で ON) を直す
- **最初の 1 本は既存機能の切り出しではなく、新規に足したい reader を最初から plugin
  として書く**。TS 側の変更ゼロで UI に出るので、機構の検証だけに集中できる
- `SceneXMLReader` の未知 type 経路を tolerant にする (§8)

### Phase B: パネル寄与 (schema 駆動) + userData sideload

schema 駆動のパネル寄与、userData への sideload (JS/TS のみ)、safe mode。
必要なら iframe webview。

### Phase C: 重い native / データ pack の分離

umbreon の crash が実害になったタイミングで、size ではなく安定性を理由に着手。

---

## 8. 実装前に確認すべきこと

1. **`SceneXMLReader` の未知 type 挙動** (`src/qsys/SceneXMLReader.cpp:355` 付近)。
   plugin renderer を含む .qsc を plugin 無しで開いたとき、該当ノードだけスキップして
   警告を出せるか、それとも読み込み全体が失敗するか
2. **`RendererFactory` / `StreamManager` の unregist 経路が実際に安全か** (生存している
   インスタンスがある状態で unregist した場合の挙動)。plugin の無効化を実行時に許すなら必須。
   許さない (再起動必須) 設計にするなら不要
3. **`createWrapper` の throw に依存している既存テストが無いか** (§4.4 F-1 の fallback 化で
   壊れないか)。wrapper 問題そのものは §4.4 で解決済み
4. Windows で plugin DLL から `cuemol2.dll` を解決する具体手順 (`AddDllDirectory` /
   `SetDefaultDllDirectories` の適用箇所)

---

## 9. 参照

- `docs/architecture/tritium-packaging-renovation.md` -- packaging の現状と Phase 4 (署名 / notarization)
- `docs/plans/umbreon-process-isolation-plan.md` -- umbreon を plugin .so にしない理由
- `docs/migration/adr/ADR-0035-render-window.md` -- native addon が main window にしかない制約
- `docs/migration/adr/ADR-0037-scene-export-capability-gate.md` -- capability probe が起動時 1 回である前提
- `docs/migration/ui-style-guide.md` -- plugin の UI 寄与が守るべき規約
- 前例調査: napari (`npe2` の YAML マニフェスト + contributions)、ChimeraX
  (`bundle_info.xml` + toolshed)、PyMOL / Blender / Fiji (スクリプト言語 + register API)
