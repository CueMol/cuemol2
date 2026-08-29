# pym console 調査報告書

- **日付**: 2026-05-29
- **対象**: PyMOL ユーザの移行を促進するための「pym console」(PyMOL コマンド言語に部分互換なコンソール) を cuemol3/tritium に導入する件
- **目的**: 完全互換ではなく、PyMOL 経験者が analogy で cuemol3/tritium を使えること
- **目標**: 本書は調査結果の最終まとめ。planning/coding は含まない

---

## 0. 確定済みの設計判断 (ユーザ合意済み)

| 論点 | 確定内容 |
|---|---|
| パーサ配置 | embedded Python `src/python/cuemol/pym/` に置き、cuetty / tritium / pymod の 3 コンテキストで共有 |
| tritium 連携 | C++ に新 API `runPymCommand(line)->string(JSON)` を 1 本追加 (詳細は §2) |
| 入力構文 | **PyMOL 風 DSL 専用** (1 行 = 1 コマンド)。生 Python は cuetty REPL に任せる |
| セキュリティ | GUI console は DSL 限定、任意 Python eval は cuetty REPL のみ (PyMOL SECURE mode 相当の発想) |
| selection 互換 | passthrough + 軽量パーサによる変換。完全 PyMOL selection 互換は非ゴール |
| 状態の source of truth | C++ 側 (scene / undo / selection alias)。Python module globals には持たない |
| 着手 | Phase 0 (副作用ゼロの echo コマンドで両コンテキスト往復証明) から |

---

## 1. 現状整理 — 3 つの実行コンテキストと embedded Python 到達性

cuemol3 には command/script を流し込みうる実行コンテキストが 3 つあり、いずれも同一 `libcuemol2` を共有する。

### (a) cuetty (C++ CLI)
- `cli/cli_main.cpp`。`-i` で `cuemol2::init(confpath, true)` -> `pybr::PythonBridge::getInstance()->runInteractiveShell()` (`cli_main.cpp:198-199`)、`PythonBridge.cpp:104-116` の `PyRun_InteractiveLoop(stdin, "")` で素の Python REPL に落ちる
- embedded CPython 3.12 は完全に到達可能、`_cuemol_internal` built-in module 経由で全 cuemol API を叩ける
- **コマンドパーサは存在しない** — 今はただの Python REPL

### (b) tritium react-gui (Electron + React + Web Worker + node addon)
- renderer -> `postMessage` -> Web Worker -> `@cuemol/core` node addon (同期 C++ wrapper)
- サービスは `worker/shared/calls/` の `ServiceMap`/`MethodMap`/`RpcMap` に型契約として登録し、`server/services/*.service.ts` で実装、renderer から `AsyncCueMol.invokeService<K>()` で呼ぶ

### (c) pymod (外部 pip パッケージ)
- 外部 Python から `import cuemol`。`pymod/python/cuemol/__init__.py` が初回 import で自動 init
- cuetty と **同一の `src/python/cuemol/*.py` を共有** (build 時 copy)
- `cmd.py` に `load/delete/bgcolor/set/get/reset` などのユーティリティはあるが、**コマンドインタープリタではなく単なる関数群**

### crux: embedded Python は tritium node addon から到達可能か -> **YES (検証済み)**
- `tritium/core/src/wrappers/PythonBridge.ts:28-31` が auto-generated で `runString(arg_0: string): void` を `this.invokeMethod("runString", arg_0)` 経由で公開
- `pybr` は `ENABLE_PYTHON_EMBED=ON` で `libcuemol2` に static link 済み (`src/CMakeLists.txt:248-249`)。`cuemol2::init()` が `pybr::init()` を呼ぶ (`loader.cpp:147-150`)

### ただし既存 `runString` は流用不可 (新 API が必要)
1. **`runString` の戻り値は void** (`PythonBridge.qif:22`, `.hpp:40`)。さらに実装 (`PythonBridge.cpp:99-102`) は `PyRun_SimpleString` の戻り値すら検査していない (`runFile` は `res<0` で例外を投げるのに `runString` は捨てる)。**エラー検出経路が現状ゼロ**
2. **stdout/stderr はプロセスグローバルに native ログへ差し替え済み**。`pybr.cpp:177-189` が embedded init 時に `sys.stdout`/`sys.stderr` を `CatchOutErr` -> `ci.print` -> `Wrapper::print` (`wrapper.cpp:861-867` の `LOG_DPRINT`) へ差し替える。tritium で `runString("print(...)")` しても出力は worker から取れず native ログに消える。この差し替えはグローバルなので cuetty REPL とも共有している

---

## 2. アーキテクチャの核心判断

要件: cuetty と tritium (と pymod) の **全てで同一の pym コマンド体系**。

| 案 | 評価 |
|---|---|
| **A. パーサを embedded Python (`src/python/cuemol/pym/`) に置き全員から呼ぶ** | **採用**。共有点が 1 箇所。PyMOL の `parser.py`/`parsing.py` をほぼ直移植可、selection は C 層へ委譲 |
| B. C++ パーサを qsys に置く | 却下。PyMOL パーサは Python signature introspection 多用で C++ 再実装は parity の旨味を全て喪失。最高コスト |
| C. TS パーサを worker に置く | 却下。cuetty/pymod で共有不可。体系が 2 実装に分裂 |

### 新 C++ API の設計指針
- `runPymCommand(line) -> string(JSON)` で `{ ok: bool, output: string, error: string|null }` を返す
- 実装に必要なこと:
  1. `PyRun_String` 系で式/文を実行 (`Py_eval`/`Py_single`/`Py_file` フラグ選択)
  2. `PyErr_Occurred`/`PyErr_Fetch` でトレースバックを文字列化して `error` に
  3. 実行中だけ stdout/stderr を文字列バッファへ一時退避し、`finally` 相当で確実に元の `CatchOutErr` (`pybr.cpp:187-189`) へ復帰、バッファ内容を `output` に集約
  4. worker thread からの CPython 呼び出しに備え `PyGILState_Ensure()`/`PyGILState_Release()` で GIL を明示取得
- 既知の限界: ハンドラが呼ぶ C++ 経路の `LOG_DPRINT` 出力までは `output` に拾えない

### 先に確定すべき設計判断
- **状態の source of truth**: pym の名前付き selection・設定値は **Python module globals に持たない**。tritium は複数 scene + undo + 別タブ並行操作があり、Python グローバルだと二重管理・乖離する。状態は C++ 側 (scene、後述の selection alias 機構) に寄せ、Python 側はステートレスなパーサ + ディスパッチャに保つ
- **GIL/ブロッキング**: worker は同期実行のため重い pym コマンド (load/fetch) は worker スレッドを丸ごとブロックし、gfx ループ・他サービスが止まる。Tier 0 は許容、長時間 I/O 系は将来 progress/cancel 経路 (既存 `subscribeStreamProgress`) に乗せる

---

## 3. selection 文法の対応

### 3.1 結論

PyMOL -> CueMol の selection 文字列変換は **partial-yes**。日常用途の 80/20 サブセットは現実的だが、**単純な regex/sed では破綻する**。理由は PyMOL の `-` (範囲/減算/負数) と `+` (値列挙/論理 OR) の多義性、および両者で **演算子優先順位が異なる**ため。安全に移すには「トークナイザ + 再帰下降パーサ -> 小さな AST -> 完全括弧付き CueMol 文字列を emit」という軽量パーサが必須。

### 3.2 クラスマクロは named selection alias で対応する

`hetatm`/`polymer`/`backbone`/`ss` などの PyMOL クラスマクロは、CueMol の named selection alias 機構で対応できる。仕組みは以下:

- `SelCompiler::checkNameRef` (`SelCompiler.cpp:104-111`) が、selection 式中の裸キーワードを **`StyleMgr::getStrData("sel", name, nScopeID)`** で解決する
- `data/default_style.xml:416-424` に既に以下の `<sel>` alias が定義済み (`rprop type=prot` 等の primitive で構築):
  - `helix` = `rprop secondary=helix`
  - `sheet` = `rprop secondary=sheet`
  - `coil` = `!rprop secondary=helix and !rprop secondary=sheet`
  - `protein` = `rprop type=prot`
  - `nucleic` = `rprop type=nucl`
  - `water` = `rprop type=water`
  - `sugar` = `rprop type=pyranose`
  - `ligand` = `!rprop type=prot and !rprop type=nucl and !rprop type=water`
  - `hydrogen` = `elem H`
- **さらに runtime API がある**: `StyleManager.setStrData("sel", key, value, nScopeID, nStyleSetID)` (`StyleManager.qif:92`) で、予約語と衝突しない限り **任意のキーワードを動的に定義できる**。`getStrData`/`removeStrData`/`getStrDataDefsJSON` も完備 (`StyleManager.qif:87-93`)

#### 方針
- 不足する PyMOL マクロは pym 初期化時に `setStrData("sel",...)` で alias 登録する。**C++ molstr 拡張は不要、データレベルで完結**
  - `polymer` = `protein or nucleic`
  - `backbone` = `name N,CA,C,O` 系 (protein/nucleic で別定義)
  - `sidechain` = `(protein and !backbone)` 系
  - `hetatm`/`organic` ≈ 既存 `ligand` の近似、または専用 alias
  - `solvent` = 既存 `water`
  - `ss H`/`ss S`/`ss L` -> 既存 `helix`/`sheet`/`coil`
- **PyMOL `select name, expr` は `setStrData("sel", name, 変換後expr)` に 1:1 クリーンマップ** — これが PyMOL の named-selection 再利用セマンティクスそのもの

### 3.3 推奨レイヤー: pure-Python `src/python/cuemol/pym/sel_translate.py` (新規)

理由:
- selection は **ほぼ全コマンドの引数**であり、コマンドパーサと同じ embedded Python 層に置くと呼び出しが一点に集約する。cuetty / tritium worker (`makeSel.ts` 経由 SelCommand) / pymod の全消費者が同じパッケージを共有できる
- `-`/`+` 多義性・優先順位再構成という真のパースが必要な部分も Python で素直に書け、C++ 再ビルド不要で反復が速い
- C++ フロントエンド案 (molstr に PyMOL 方言 flex/bison を二重に持つ) は過剰。クラスマクロが alias 機構で解決できるため、C++ 拡張の必要性自体が下がった

実装構成 (sel_translate.py):
1. トークナイザ (quote/regex/括弧/演算子/値に分割、`-`/`+` の文脈を確定)
2. 再帰下降パーサ -> 小 AST (PyMOL 優先順位で構築)
3. emitter -> **完全括弧付き** CueMol 文字列 (rename・range `:`・list 変換・マクロ alias 写像を emit 時に適用)
4. マクロ alias 表 (PyMOL マクロ -> CueMol alias 名)。不足分は init 時に `setStrData("sel",...)` 登録
5. 未対応トークンは **静かに通さず** 位置付きエラー (`pym: unsupported PyMOL selector 'segi' (no CueMol equivalent)`)

根拠ファイル: `src/modules/molstr/scanner_sel.lxx` (keyword 54-191、比較演算子 71/76/81、`rprop` token 132)、`src/modules/molstr/parser_sel.yxx` (優先順位、range 448-492、`around[molname]` 147-154)、`src/modules/molstr/SelCompiler.cpp:104-111` (alias 解決)。

### 3.4 token 対応表

| 区分 | PyMOL | CueMol | 備考 |
|---|---|---|---|
| **対応 (そのまま)** | `name CA` | `name CA` | scanner:110 |
| | `elem`/`element`/`symbol` | `elem` | scanner:107 |
| | `resn`/`resname` | `resn` | scanner:115 |
| | `chain` | `chain` | scanner:122 |
| | `alt`/`altloc` | `alt` | scanner:113 |
| | `and`/`or`/`not`/`( )` | 同左 | scanner:61-66 |
| | `all`/`*`/`none` | 同左 | scanner:84/134/135 |
| | `around D`/`expand D`/`byres` | 同名・同義 | scanner:141/154/187 |
| | `%name`/裸名 | 裸名 (named_selection) | SelCompiler SelRefNode |
| **要変換 (rewrite)** | `resi 1-10` | `resi 1:10` | range `-`->`:` (parser:472) |
| | `name CA+CB` (列挙) | `name CA,CB` | `+`->comma |
| | `elem C+N` (論理 OR) | `elem C or elem N` | `+`->`or` (文脈判定) |
| | `X - Y` (減算) | `X and not (Y)` | 減算演算子なし |
| | `b`/`q` | `bfac`/`occ` | rename (scanner:138/139) |
| | `==` | `=` | scanner:71/76/81 のみ |
| | `id N` | `aid N` | 内部 atom ID、意味注意 |
| | `//A/10/CA` | `A.10.CA` | 5 階層 -> 3 階層射影 |
| **alias で対応** | `hetatm`/`solvent`/`polymer`/`organic` | `<sel>` alias 登録 | §3.2。setStrData |
| | `backbone`/`sidechain` (class) | `name ...` 系 alias | §3.2 |
| | `ss H`/`ss S`/`ss L` | `helix`/`sheet`/`coil` alias | 既存 alias |
| **対応不能 / 要注意** | `segi`/`index`/`model`/`x/y/z`/`charge`/flag 系 | — | token 自体なし。要エラー |
| | `>=`/`<=` | — | 3 比較演算子のみ、厳密等価不能 |
| | `within/beyond/near_to` (方向付き 2 集合) | `around` (片側) のみ部分 | 厳密対応せず |
| | `neighbor`/`extend` | token はあるが **未実装 (false 返し)** | drop 確定。写像すると空結果の罠 |

### 3.5 最初に対応すべき PyMOL selection サブセット (80/20)
- 識別子: `chain` / `resi` (range 含む) / `resn` / `name` / `elem`
- 論理: `and` / `or` / `not` / `( )`
- マクロ: `polymer` / `protein` / `nucleic` / `water`/`solvent` / `hetatm` / `backbone` / `sidechain` / `ss H/S/L` (alias 経由)
- 空間: `around D` / `byres`
- 明示的に後回し/drop: `within/beyond/near_to` の方向付き 2 集合、`segi`/`index`/`x,y,z`/flag 系、`neighbor`/`extend`

---

## 4. PML コマンド -> cuemol マッピング総表 (200 コマンド)

### 種別の定義
- **direct**: 既存 API がほぼ 1:1
- **adapter**: 既存 API + グルー/引数変換
- **partial**: 中核は動くが一部セマンティクスが失われる
- **new-impl**: cuemol 側に新規実装が必要 (実装層を明記)
- **drop**: 移行 analogy の範囲外

### 種別集計の目安
direct ~24 / adapter ~58 / partial ~24 / new-impl ~28 / drop ~12。**direct/adapter が大半**で、cuemol に部品がそろっているケースが多い。密度マップ・分子表面・結晶対称・多フレームは cuemol 側に実装があり、selection 系コマンドは §3.2 の alias 機構を前提とする。

### 4.1 File I/O & Loading

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| load | ファイル/URL から読込 | fileio.load -> StreamManager.createHandler+read。対応: PDB/mmCIF/MOL2/SDF/GROMACS gro/AMBER prmtop/NAMD coor/QDF/**PSE(PyMOL session)**/density(MTZ/CCP4/Brix/mmCIF map/Xplor)。XYZ なし | adapter | easy | fileio.py:128-156, importers/*.qif, mdtools/*.qif, xtal_loader.cpp |
| loadall | glob 一括ロード | glob.glob + load ループ (新規) | new-impl | easy | none |
| load_traj | 軌道ファイル | **trajectory reader (DCD/XTC/TRR) は未実装、MD trajectory ブランチ待ち**。ただし単フレーム MD (gro/coor/inpcrd) は mdtools で読込可。frame 容器は MorphMol が既存 | partial | — | mdtools/*, anim/MorphMol.qif:19-32 |
| load_mtz | MTZ 密度 | **MTZ2MapReader + MapFFT (FFTW3 で構造因子->密度)。resolution/gridsize/column 指定可** | direct | easy | MTZ2MapReader.qif:11-29, MapFFT.cpp:326-524, xtal_loader.cpp:21 |
| load_png | PNG 表示 | console は headless | drop | hard | none |
| load_embedded | 埋込データ | text-block パーサ新規 (~30 行) | new-impl | moderate | none |
| fetch | PDB 取得 | net_fetch.fetch(pdbid, scene) | adapter | moderate | net_fetch.py:64-75, streamLoadFromUrl.service.ts |
| save | 構造/scene 書出 | fileio.saveObject -> createHandler(cat1) | adapter | moderate | fileio.py:103-118 |
| log/log_open/log_close | コマンド記録 | logging 基盤なし | drop | trivial-hard | none |
| cd/pwd/ls | 作業 dir 操作 | os.chdir/getcwd/glob ラッパ (数行) | new-impl | trivial | stdlib |

### 4.2 Selection & Picking

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| select | 名前付き選択生成 | **StyleManager.setStrData("sel", name, expr)** (§3.2) | adapter | easy | StyleManager.qif:92, SelCommand.qif:27 |
| deselect | 全選択非表示 | *selection renderer を visible=false 走査 | adapter | moderate | Renderer.qif, Object.qif |
| indicate | 選択ハイライト | compile + *selection renderer visible | direct | trivial | SelCommand.qif:27, applyMolSelString.service.ts |
| pop | 選択を 1 原子ずつ反復 | 反復 API 不在、C++ iterator 推奨 (Python generator で暫定可) | new-impl | hard | MolCoord.qif:45/51 |
| unpick | pk 選択クリア | 対話 picking 不在 | drop | very-hard | none |
| remove_picked | picked 原子削除 | deleteAtoms あり、picking 状態は外部 | partial | moderate | MolCoord.qif:75 |

### 4.3 Representation: Show/Hide

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| show | 表現 ON | Renderer.visible + MolRenderer.sel。対応 renderer: simple(lines)/ballstick(sticks)/cpk(spheres)/cartoon/ribbon/trace/nucl/tube/spline/anisou/atomintr + **molsurf/dsurface(surface)** + contour/isosurf/gpu_mapmesh/gpu_mapvol(map) | adapter | easy | Renderer.qif:39-40, Object.qif:75-76 |
| hide | 表現 OFF | Renderer.visible=false (rep 単位は不可) | partial | trivial | Renderer.qif:39-40 |
| as | 排他表現 | 他 renderer hide + target show | adapter | easy | Object.qif:84/94-95 |
| cartoon | as cartoon 固定 | Object.createRenderer('cartoon') | adapter | easy | Ribbon2Renderer.cpp (getTypeName='cartoon') |
| show surface | 分子表面 | **DirectSurfRenderer("dsurface"): surftype=vdw/sas/ses, surfalgor=edtsurf/msms, proberad, detail。または MolSurfRenderer("molsurf")** | adapter | easy | DirectSurfRenderer.qif:43-57, MolSurfRenderer.qif |

### 4.4 Coloring & Styling

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| color | 着色 | Renderer.coloring(ColoringScheme) | adapter | moderate | Renderer.qif:29, rendererColoring.service.ts:218-246 |
| color_deep | リセット後着色 | resetProp('coloring') + 再適用 | adapter | easy | rendererColoring.service.ts:243 |
| spectrum | プロパティ着色 | RainbowColoring (palette 写像不完全) | partial | hard | RainbowColoring.qif:11-46 |
| bg_color | 背景色 | Scene.bgcolor (既存ラッパ) | direct | trivial | Scene.qif:40, cmd.py:9 |
| set_color | 色定義 | StyleManager.setColor + 再適用 | adapter | moderate | StyleManager.qif:73 |
| recolor | 再着色 | Renderer.reapplyStyle/applyStyles | direct | easy | Renderer.qif:97-98 |
| desaturate | 彩度下げ | ColoringScheme 新規 (PyMOL も Incentive-only) | new-impl | very-hard | none |

### 4.5 Camera, View & Scene

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| zoom | 選択にフィット | View.fitView/MolCoord.fitView2 | adapter | moderate | View.qif:91-93, MolCoord.qif:64-65 |
| center | 視点中心移動 | View.setViewCenter | adapter | easy | View.qif:100-101 |
| origin | 回転中心 | setViewCenter (view 中心と混同) | partial | easy | View.qif:100-101 |
| orient | 主軸整列 | PCA 不在、新規 (Eigen ~200 行) | new-impl | hard | View.qif:113-114 |
| view | 名前付きビュー | Scene.saveViewToCam/loadViewFromCam | direct | trivial | Scene.qif:122-124, cameraOps.service.ts |
| set_view | 18 要素ビュー設定 | setRotQuat+setViewCenter+setSlabDepth | adapter | moderate | View.qif:31-35/92-113 |
| get_view | ビュー取得 | View プロパティ再構成 | adapter | easy | View.qif:31-35 |
| clip | クリップ面 | setSlabDepth (near/far 独立不可) | partial | moderate | View.qif:96-97 |
| get_clip | クリップ取得 | View.slab (対称のみ) | partial | easy | View.qif:96-97 |
| scene | scene スナップショット | in-memory scene list 新規 (~500 行) | partial | very-hard | Scene.qif:56-178 |
| scene_order | scene 並替 | scene 基盤依存 | new-impl | easy | none |
| reset | ビューリセット | rotateView(0,0,0)+fitView | adapter | easy | View.qif:113-114, MolCoord.qif:64 |
| viewport | 表示サイズ | View.sizeChanged | direct | trivial | View.qif:86 |
| window/full_screen | ウィンドウ制御 | Electron 層 | drop | trivial | none |
| stereo | ステレオ | View.stereoMode (モード一部) | adapter | easy | View.qif:47-53 |

### 4.6 Measurement & Analysis

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| distance | 距離測定 | AtomIntrRenderer.appendById/appendBy2Vecs | adapter | easy | AtomIntrRenderer.qif:107-110 |
| angle | 角度 | AtomIntrRenderer.appendAngleById | adapter | easy | AtomIntrRenderer.qif:113 |
| dihedral | 二面角 | AtomIntrRenderer.appendTorsionById | adapter | easy | AtomIntrRenderer.qif:116 |
| get_distance | 距離値 | Vector.sub().length() | adapter | trivial | MolAtom.qif:34, Vector.qif:55/44 |
| get_angle | 角度値 | Vector.angle() | adapter | easy | Vector.qif:51 |
| get_dihedral | 二面角値 | MolAtom.dihedral() | direct | trivial | MolAtom.qif:56 |
| get_area | 表面積 | SAS/SES 生成は DirectSurfRenderer/MolSurfObj で可能だが、**面積値を返す API は無し** (三角メッシュから集計が要る) | new-impl | moderate | MolSurfObj.qif:36-40 (面積 getter 欠) |
| get_extent | 範囲 | getBoundBoxMin/Max | direct | trivial | MolCoord.qif:61-62 |
| count_atoms | 原子数 | getAtomSelSize/getAtomSize | direct | trivial | MolCoord.qif:50-51 |
| count_frames | フレーム数 | **MorphMol.nframe** (複数フレーム容器が既存) | direct | trivial | anim/MorphMol.qif:19-32 |
| count_states | 状態数 | MorphMol.nframe (state=frame と見なせば)。trajectory reader は MD ブランチ待ち | adapter | easy | anim/MorphMol.qif:19-32 |
| identify | 原子 ID リスト | AtomIterator ループ | adapter | easy | AtomIterator.qif:26 |
| id_atom | 単一原子 ID | AtomIterator 検証付き | adapter | easy | AtomIterator.qif:26 |
| index | (obj,index) | AtomIterator (index は脆弱) | adapter | moderate | AtomIterator.qif:27 |
| find_pairs | 原子ペア検出 | MolAnlManager.calcAtomContact2JSON | adapter | moderate | MolAnlManager.qif:62 |
| phi_psi | 主鎖二面角 | 抽出 API 不在 (~300 行) | new-impl | moderate | none |
| pi_interactions | π 相互作用 | 検出不在 (PyMOL も Incentive) | new-impl | hard | MolAnlManager.qif:61-63 |
| overlap | VDW 重なり | VDW 半径未公開 | new-impl | moderate | none |
| get_chains | chain 一覧 | getChainsJSON | adapter | easy | MolCoord.qif:58 |
| get_symmetry | 結晶対称 | **CrystalInfo プロパティ (a/b/c/alpha/beta/gamma/nsg/spacegroup/hm_spacegroup)** | direct | easy | CrystalInfo.qif:25-40 |
| get_title | state タイトル | per-state title なし | drop | easy | none |
| get_type | オブジェクト型 | Object.srctype | partial | easy | Object.qif:53-54 |
| get_version | バージョン | QIF 未公開 | partial | moderate | none |

### 4.7 Fitting & Alignment

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| align | 配列ベース整列 | **構造ベース SSM (superposeSSM1) で代替提供可。配列アライナは無し** (PyMOL の配列依存は再現不可) | partial | moderate | MolAnlManager.qif:24, .cpp:308 |
| alignto | 全対象を整列 | superposeSSM1 の thin ラッパ (~50 行) | adapter | easy | MolAnlManager.qif:24/33 |
| fit | 原子マッチ重畳 | superposeLSQ1 (matchmaker 欠) | partial | moderate | MolAnlManager.qif:33 |
| extra_fit | 複数対象整列 | ssm_fit ループ (~100 行) | adapter | easy | mol_util.py:176 |
| intra_fit | 全 frame 整列 | MorphMol で frame アクセス可 + superposeLSQ + frame ループ (容器は既存、fit ループは新規) | new-impl | moderate | anim/MorphMol.qif, MolAnlManager.qif:33 |
| intra_rms | frame 別 RMS | calcRMSD + MorphMol frame ループ | new-impl | easy | MolAnlManager.qif:35, anim/MorphMol.qif |
| intra_rms_cur | fit なし RMS | calcRMSD(no-fit) | adapter | easy | MolAnlManager.qif:35 |
| pair_fit | ペア重畳 | pair_fit 不在 (~300 行) | new-impl | hard | MolAnlManager.qif:33 |
| rms | 変換なし RMS | mol_util.calc_rmsd | direct | trivial | mol_util.py:186 |
| rms_cur | fit なし RMS | calcRMSD(flag) | adapter | trivial | MolAnlManager.qif:35 |
| super | 配列+構造整列 | **構造ベース SSM (superposeSSM1) で代替可、配列重み欠** | partial | moderate | MolAnlManager.qif:24, .cpp:308 |
| cealign | CE 整列 | SSM で代替可 (別アルゴ) | partial | hard | ssmlib/ssm_align.h:12-13 |
| usalign | TM-align | 不在 | new-impl | very-hard | none |

### 4.8 Object & Atom Editing

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| delete | オブジェクト削除 | Scene.destroyObject(name->uid) | adapter | easy | Scene.qif:63, cmd.py:58-85 |
| remove | 原子削除 | MolAnlManager.deleteAtoms | adapter | easy | MolCoord.qif:75, mol_util.py:169-173 |
| rename | 原子名一意化 | 生成ロジック新規 | new-impl | moderate | none |
| copy | オブジェクト複製 | copyAtoms(sel='*') | adapter | easy | MolAnlManager.qif:48 |
| create | 選択から新分子 | copyAtoms + addObject | adapter | moderate | MolAnlManager.qif:48, Scene.qif:56-57 |
| extract | create+remove | copyAtoms + deleteAtoms | direct | easy | MolAnlManager.qif:48/50 |
| copy_to | 複製+rename | copyAtoms + changeChainName | adapter | moderate | mol_util.py:206-210 |
| fragment | 断片ライブラリ | ライブラリ不在 | drop | very-hard | none |
| pseudoatom | 擬似原子追加 | appendAtom1 + 座標計算 | adapter | moderate | MolCoord.qif:79 |
| group | グループ化 | 階層なし (命名規約で部分) | partial | hard | Object.qif:30 |
| ungroup | グループ解除 | 命名 prefix 除去 | partial | easy | Object.qif:30 |
| split_chains | chain 分割 | chain 反復 + copyAtoms | adapter | moderate | MolAnlManager.qif:52 |
| split_states | state 分割 | MorphMol の各 frame を個別 MolCoord に抽出 (frame アクセスは既存、抽出ロジック新規) | new-impl | moderate | anim/MorphMol.qif (getFrame/removeFrame) |
| join_states | state 結合 | MorphMol.insertBefore/appendThisFrame で frame 追加 | adapter | moderate | anim/MorphMol.qif:81/88 |
| update | 座標転送 | 原子ループ + pos 更新 | partial | moderate | MolCoord.qif:77 |

### 4.9 Bond & Geometry

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| bond | 結合作成 | MolAnlManager.makeBond | adapter | easy | MolAnlManager.qif:43, MolCoord.cpp:400 |
| unbond | 結合削除 | MolAnlManager.removeBond | direct | easy | MolAnlManager.qif:42 |
| set_bond/unset_bond | 結合別設定 | per-bond 設定系なし | drop | hard | none |
| set_geometry | 幾何/価数設定 | metadata 欠、原子プロパティで部分 | partial | moderate | MolAtom.hpp |
| set_dihedral | 二面角設定 | 回転群検出 + 軸回転 (~400-600 行) | new-impl | hard | none |
| valence | 結合次数変更 | MolBond::setType (Python binding 欠) | adapter | moderate | MolBond.hpp:54 |
| cycle_valence | 次数巡回 | setType 反復 + h_fill | adapter | moderate | MolBond.hpp:35-40 |
| fuse | オブジェクト結合 | `MolCoord::merge()` は **`#if 0` で無効化中**。再有効化が要る | new-impl | moderate | MolCoord.hpp:320-333 (#if 0) |
| attach | 原子付加 | appendAtomScr1 + 幾何計算欠 | adapter | moderate | MolCoord.qif:79 |
| replace | 原子置換 | remove+append+h_fill | adapter | moderate | MolCoord.hpp:154 |
| h_add | 水素付加 | 化学規則エンジン不在 | new-impl | very-hard | none |
| h_fill | 水素再計算 | 除去のみ可、付加は h_add 依存 | partial | hard | mol_util.py:169-173 |
| h_fix | 水素再配置 | 幾何計算器新規 (PyMOL も未対応) | new-impl | hard | none |
| dss | 二次構造定義 | calcProt2ndry2 + setProt2ndry | adapter | easy | MolAnlManager.qif:68/70 |
| fix_chemistry | 化学修正 | 検証エンジン不在 (PyMOL も未対応) | drop | very-hard | none |
| protonate | pH 依存プロトン化 | h_add + pKa 予測不在 | new-impl | very-hard | none |
| alphatoall | CA->全原子展開 | AtomIter/ResidIter (~200 行) | adapter | easy | mol_util.py:24-86 |
| mse2met | MSE->MET 変換 | iterate + element/name 変更 | adapter | easy | mol_util.py:24-86 |
| rebond | 距離再結合 | 距離ベース結合検出新規 (KD-tree 500-800 行) | new-impl | moderate | MolCoord.hpp:165 |

### 4.10 Transformations

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| move | カメラ並進 | View.translateView | adapter | easy | View.qif:104-106 |
| rotate | 原子/行列回転 | mol_util.rotate / Object.xformMat | adapter | moderate | MolCoord.qif:77, Object.qif:57 |
| translate | 原子/行列並進 | mol_util.shift / Object.xformMat | adapter | moderate | MolCoord.qif:77, Object.qif:57 |
| turn | カメラ回転 | View.rotateView | adapter | easy | View.qif:113 |
| rock | Y 軸揺動 | SimpleSpin + 連続ループ配線 | partial | hard | SimpleSpin.qif:23-27 |
| drag | 対話ドラッグ編集 | 対話編集枠組み不在 | new-impl | very-hard | none |
| set_symmetry | 結晶対称設定 | **SymOpDB.changeXtalInfo (cell + space group) / CrystalInfo.setCellDimension** | adapter | hard | SymOpDB.qif:24, .cpp:451-484, CrystalInfo.hpp:108-124 |
| symmetry_copy | 対称コピー | **SymmRenderer::rendSymm で対称分子複製描画** (cell/extent 指定) | partial | moderate | SymmRenderer.cpp:111-134, SymOpDB.cpp:113 |

### 4.11 Selection Query & Manipulation

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| alter | 原子プロパティ変更 | AtomIter + setAtomProp (式評価器欠) | adapter | moderate | mol_util.py:AtomIter, MolAtom.qif |
| alter_state | 座標/フラグ変更 | MorphMol.setFrame で frame 選択 + MolAtom.pos 書換 (単 frame 操作)。flag は未対応 | partial | hard | anim/MorphMol.qif, MolAtom.qif:pos |
| iterate | 原子読込反復 | AtomIter + MolAtom 読込 | direct | trivial | mol_util.py:AtomIter |
| iterate_state | 座標読込反復 | AtomIter + atom.pos (単 state) | partial | easy | MolAtom.qif:pos |
| set_name | 名前変更 | Object.name | direct | trivial | Object.qif:name |
| set_title | state タイトル | per-state metadata 不在 | drop | very-hard | none |
| set_property | オブジェクトプロパティ | LScrObjBase.setProperty | adapter | easy | LScrObjects.hpp:36-37, cmd.py:set |
| set_atom_property | 原子プロパティ | setAtomPropInt/Real/Str ループ | adapter | easy | MolAtom.qif:49-51 |
| protect/deprotect | 編集保護フラグ | フラグ系不在 | new-impl | hard | none |
| flag | 32bit フラグ | フラグ系不在 | new-impl | hard | none |
| mask/unmask | picking マスク | picking 統合必要 | new-impl | very-hard | none |
| invert | 立体反転 | 反転幾何不在 | new-impl | very-hard | none |

### 4.12 Settings & Configuration

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| set | 設定変更 | setProp (型強制+対象解決) | adapter | moderate | wrapper.cpp:setProp, cmd.py:set |
| get | 設定取得 | getProp / getGenericProps | adapter | easy | genericProps.service.ts:90-118 |
| unset | デフォルト復帰 | resetProp | direct | easy | genericProps.service.ts:137-141 |

### 4.13 Rendering & Export

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| png | PNG 保存 | PngSceneExporter via StreamManager | adapter | moderate | PngSceneExporter.hpp:21-24 |
| ray | レイトレ画像 | **POVRay/LuxRender/LuxCore へ scene export (PovSceneExporter/LuxRendSceneExporter/LuxCoreSceneExporter)。内蔵 RT は無し、外部レンダラ実行が前提** | partial | hard | rendering/PovSceneExporter.cpp, LuxRendSceneExporter.cpp |
| capture | OpenGL 画像 | View.redraw + ImgSceneExporter | adapter | easy | View.qif:123/125 |
| draw | OpenGL 画像 (寸法) | ImgSceneExporter | adapter | moderate | ImgSceneExporter.hpp:21-89 |
| refresh | 再描画 | View.invalidate/redraw | direct | trivial | View.qif:123/125 |
| rebuild | ジオメトリ再構築 | Scene.clearAllData (粗い) | partial | moderate | Scene.qif:68 |
| mpng | 動画フレーム書出 | AnimMgr + 逐次 export 新規 | new-impl | hard | povrender.py:256-284 |
| cache | キャッシュ管理 | 公開 API 不在 | drop | very-hard | none |
| get_pdbstr | PDB 文字列 | PDB writer + ByteArray デコード | adapter | moderate | StreamManager.qif:53/29 |
| multisave | 複数エントリ PDB | obj 反復 + writer ループ新規 (~60-80 行) | new-impl | moderate | Scene.qif:71 |
| multifilesave | テンプレ複数保存 | obj/state 反復 + テンプレ新規 | new-impl | hard | Scene.qif:71 |

### 4.14 Movie & Animation

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| mset | state->frame 対応 | AnimMgr 適応 (state 構文差) | adapter | moderate | AnimMgr.qif:71-77 |
| mview | カメラキーフレーム | saveViewToCam + CamMotion | direct | easy | Scene.qif:122-124, CamMotion.qif |
| mplay/mstop | 再生/停止 | AnimMgr.start/stop | direct | trivial | AnimMgr.qif:52-54 |
| mtoggle | 再生トグル | playState 分岐 | adapter | trivial | AnimMgr.qif:48 |
| mdo/mappend | frame 別コマンド | frame コマンド実行枠組み新規 | new-impl | hard | AnimMgr.qif:71-77 |
| madd | spec 追記 | mset を append | adapter | easy | AnimMgr.qif:71-77 |
| mcopy/mmove | keyframe 複写/移動 | getAt + append/removeAt | adapter | easy-moderate | AnimMgr.qif:72/75/77 |
| mdelete | frame 削除 | removeAt + destroyCamera | adapter | easy | AnimMgr.qif:77, Scene.qif:120 |
| minsert | 空 frame 挿入 | insertBefore(NoopAnimObj) | adapter | easy | AnimMgr.qif:76 |
| mdump | 動画ダンプ | AnimMgr 走査 print | adapter | easy | AnimMgr.qif:38/72 |
| mmatrix | 初期カメラ | saveViewToCam('__mmatrix') | adapter | moderate | AnimMgr.qif:27-28 |
| frame/rewind/ending | フレーム移動 | AnimMgr.goTime | direct | trivial-easy | AnimMgr.qif:57 |
| forward/backward/middle | フレーム相対移動 | elapsed +/- + goTime | adapter | trivial | AnimMgr.qif:40/57 |
| accept/decline | session security | PyMOL 固有 | drop | easy | none |

### 4.15 Advanced Features & Utilities

| pymol cmd | 目的 | cuemol マッピング | 種別 | 難易度 | API 参照 |
|---|---|---|---|---|---|
| label | 原子ラベル | NameLabelRenderer (式評価欠) | partial | moderate | NameLabelRenderer.qif:48-50 |
| edit | 対話編集 picking | 編集枠組み不在 | drop | very-hard | none |
| curve_new | Bezier 曲線 | 曲線オブジェクト不在 | new-impl | hard | none |
| slice_new | 密度スライス | 2D スライス renderer 不在 | new-impl | hard | DensityMap.qif |
| volume | ボリューム | **GLSLMapVolRenderer は実装済みだが scripting interface が `xtal.cpp:54` で comment-out。有効化に C++ 変更要** | partial | moderate | GLSLMapVolRenderer.qif:10-43, xtal.cpp:54 |
| isomesh | メッシュ等値面 | **MapMeshRenderer / GLSLMapMeshRenderer(2)** | direct | easy | MapMeshRenderer.qif:11-36, GLSLMapMeshRenderer.qif |
| isodot | ドット等値面 | **MapSurfRenderer drawmode="point"** (MSRDRAW_POINT) | direct | easy | MapSurfRenderer.qif:32-36, .hpp:56-60 |
| isosurface | 等値面 | **MapSurfRenderer drawmode="fill"** | direct | easy | MapSurfRenderer.qif:32-36 |
| isolevel | 等値レベル変更 | MapRenderer.siglevel (sigma) / level (absolute) | direct | trivial | MapRenderer.qif:44-45/55-56 |
| map_new | 原子から密度生成 | forward FFT (原子->構造因子) 不在。MapFFT は逆方向のみ | new-impl | very-hard | MapFFT.cpp (逆方向のみ) |
| map_set | 密度演算 | grid 演算不在 | new-impl | hard | DensityMap.qif |
| map_set_border | 境界値設定 | API 不在 (PyMOL も未対応) | drop | trivial | DensityMap.qif |
| map_double/map_halve | 再サンプリング | resampling 不在 (各 200-300 行) | new-impl | moderate | DensityMap.qif |
| map_trim | 密度トリム | crop 不在 | new-impl | moderate | DensityMap.qif |
| ramp_new | カラーランプ | **MultiGradient (multi_grad プロパティ)** | direct | easy | MapRenderer.qif:84-87, qsys/MultiGradient.qif |
| ramp_update | ランプ更新 | MultiGradient 更新 | direct | easy | MapRenderer.hpp:141-167 |
| gradient | 勾配場 | ベクトル場可視化不在 (色 gradient の MultiGradient とは別物) | new-impl | hard | none |
| symexp | 対称展開 | **SymmRenderer::genByCell + SymOpDB::getSymOps (空間群の全対称操作で複製)** | adapter | moderate | SymmRenderer.cpp:140-199, SymOpDB.cpp:113 |
| smooth | 軌道平滑 | MorphMol frame 配列に windowed 平均フィルタ新規 (frame 容器は既存) | new-impl | moderate | anim/MorphMol.qif |
| sort | 原子並替 | sort API 不在 | partial | moderate | MolCoord.qif |
| vdw_fit | VDW 最適化整列 | 最適化器不在 (PyMOL も未対応) | drop | hard | MolCoord.qif:77 |
| pbc_wrap/pbc_unwrap | PBC 折返し | **CrystalInfo.orthToFrac/fracToOrth + floor が部品として既存** (完全 API は無く、ラッパ新規) | new-impl | easy-moderate | CrystalInfo.cpp:159-163, SymmRenderer.cpp:172/182 |

---

## 5. 新規実装が必要な機能 (new-impl) の棚卸し

価値/工数比の高い順 (やるべき -> 保留 -> 落とす)。

### 高価値・低工数 (早期に着手推奨)

| 機能 | 不足点 | 実装層 | 工数 | 判断 |
|---|---|---|---|---|
| cd/pwd/ls | stdlib ラッパのみ | python pym | ~10 行 | やる (自明) |
| loadall | glob+ループ | python pym | ~10 行 | やる |
| pbc_wrap/unwrap | crystal_info から幾何計算 | python pym | ~80-180 行 | crystal_info 公開状況の確認後にやる |
| alphatoall (adapter 寄り) | iterate/alter 相当 | python pym | ~200 行 | やる |

### 中価値・中工数 (フェーズ 2、需要次第)

| 機能 | 不足点 | 実装層 | 工数 | 判断 |
|---|---|---|---|---|
| phi_psi | 主鎖二面角抽出 | C++ molanl | ~300 行 | 解析用途あれば |
| rename | 原子名一意化 | C++ molanl | moderate | 編集ワークフロー次第 |
| load_embedded | text-block パーサ | python pym | ~30 行 | 低優先 (稀用) |
| rebond | 距離ベース結合検出 (KD-tree) | C++ molstr | 500-800 行 | 需要次第 |
| multisave | obj 反復 PDB 結合 | python pym | ~60-80 行 | export 需要次第 |
| isodot | voxel ドット renderer | C++ xtal | 250-350 行 | isomesh/isosurface 完了後 |
| map_double/halve/trim | grid 再サンプリング/crop | C++ xtal | 各 200-300 行 | map 編集需要次第 |
| orient | PCA 主軸整列 | C++ molstr | ~200 行 (Eigen) | 中優先 (あると便利) |

### state/frame 系 — MorphMol が容器、trajectory reader のみ MD ブランチ待ち

多フレーム容器は `src/modules/anim/MorphMol` (`frame`/`nframe`/`setFrame`/`insertBefore`/`removeFrame`/`appendThisFrame`、QIF 公開済み) に**既に存在する**。よって:
- `count_frames` (=MorphMol.nframe)、`frame`/`mset`、`join_states` は MorphMol で **adapter/direct** で対応可
- `split_states` / `intra_fit` / `intra_rms` / `smooth` は MorphMol の frame アクセスを土台にロジック新規 (new-impl だが「data-model 不在」ではない)
- `load_traj` のみ trajectory reader (DCD/XTC/TRR 等) が真に不在で、別ブランチの experimental MD trajectory 実装の develop 統合待ち。単フレーム MD (gro/coor/inpcrd) は mdtools で既に読込可

### 高工数・要 picking 基盤 (原則保留)

| 機能 | 不足点 | 実装層 | 工数 | 判断 |
|---|---|---|---|---|
| pop | selection iterator API | C++ molstr | ~200 行 | 保留 (Python generator で暫定可) |
| set_dihedral | 回転群検出 + 軸回転 | C++ qlib/molstr | 400-600 行 | 保留 |
| pair_fit | ペア LSQ | C++ molanl | ~300 行 | 保留 |
| protect/deprotect/flag | MolAtom にフラグ追加 | C++ molstr | 200-400 行 | 保留 (編集モード前提) |
| mask/unmask | picking 統合 | C++ qsys picking | 400-500 行 | 保留 (picking 不在) |
| mdo/mappend | frame コマンド実行 AnimObj | C++ qsys/anim | substantial | 保留 |
| curve_new/slice_new/gradient | 新 Object/Renderer | C++ qsys/xtal | 300-800 行 | 保留 (専用需要待ち) |

### 落とすべき very-hard (migration parity に対し非現実的)

| 機能 | 理由 |
|---|---|
| usalign | TM-align (~2000 行超) が必要。SSM 代替で当面しのぐ |
| h_add/protonate | 化学規則エンジン/pKa 予測 (2000-3000 行)。embedded Python なので RDKit 等の外部統合検討余地あり |
| map_new | 原子->構造因子の forward FFT 合成が不在 (800-1200 行)。MapFFT は逆方向のみ |
| invert | 立体反転 + picking (600-800 行) |
| desaturate/pi_interactions | PyMOL 自体が Incentive-only/実験的。優先度低 |

---

## 6. 着手順 (Tier と Phase)

合意済みの **Phase 0 (echo) -> Phase 1 (UI) -> Phase 2 (parser+commands)** 計画に対し、コマンドを以下の Tier で並べる。

### Tier 0 — selection 不要・direct/adapter の即値コマンド (Phase 1 の UI 確認直後に投入可)
selection を伴わず、cuemol API がほぼ 1:1 で存在するもの。echo console が動いた直後の「手応え」を出す層。
- 設定系: `set` / `get` / `unset`
- ビュー: `view` / `viewport` / `refresh` / `reset` / `bg_color` / `get_view` / `set_view` / `turn` / `move`
- 動画移動: `frame` / `rewind` / `ending` / `forward` / `backward` / `mplay` / `mstop` / `mview`
- 計測値: `get_dihedral` / `get_extent` / `count_atoms` / `get_chains`
- ファイル/シェル: `load` / `fetch` / `save` / `cd` / `pwd` / `ls`
- 編集: `delete` / `set_name`

### Tier 1 — selection 翻訳が前提のコマンド (Phase 2 で sel_translate.py 投入後)
selection 文字列を引数に取り、`sel_translate.py` がある前提で adapter を書く層。pym console の「本体」。
- 表現: `show` / `hide` / `as` / `cartoon`
- 着色: `color` / `color_deep` / `recolor` / `set_color`
- 選択: `select` (= setStrData alias) / `indicate` / `deselect`
- 計測: `distance` / `angle` / `dihedral` / `get_distance` / `get_angle` / `identify` / `find_pairs` / `zoom` / `center`
- 編集: `remove` / `create` / `extract` / `copy` / `alter` / `iterate` / `set_atom_property`
- 表面/マップ: `isomesh` / `isosurface` / `isolevel` / `ramp_new`

**前提条件**: この層に入る前に sel_translate.py のフェーズ 1 サブセット (§3.5) が動いていること。selection は全コマンド引数なので、パーサが未完だと Tier 1 全体がブロックされる。

### Tier 2 — deferred
- MD trajectory ブランチ統合待ち (§7): `split_states` / `join_states` / `intra_fit` / `alter_state` / `count_states` / `smooth` / `load_traj` / `mset`
- picking/編集モード依存: `edit` / `drag` / `mask` / `protect` / `invert` / `remove_picked` / `unpick`
- 重量級アルゴリズム: `align` / `super` / `usalign` / `h_add` / `protonate` / `map_new` / `set_symmetry`
- frame コマンド: `mdo` / `mappend`

### Phase 計画との対応
- **Phase 0 (echo)**: コマンドディスパッチ経路の確立。副作用ゼロの `echo` コマンド + 故意エラー行で、Python 側 `do(line)->dict` -> 新 C++ API `runPymCommand` -> (cuetty REPL / tritium worker) の往復を、GIL・stdout 退避・JSON 往復まで証明する。`load` の周辺リスクと混ぜない
- **Phase 1 (UI)**: console UI (`ConsolePane.tsx`) が出た時点で Tier 0 を順次拡充。selection 不要なので並行可能。`panes/index.ts` barrel + `SidePanel.tsx` の `buildViewPaneConfigs()` に登録。history は既存 `SelectionPane.tsx:73` の `getHistory()` を参照パターンに
- **Phase 2 (parser+commands)**: `sel_translate.py` (§3.3 の構成) を最初に投入 -> degrade 検出テスト (token 翻訳の wire 形式を pin) を先に書く -> Tier 1 を一括展開。Tier 2 は明示的に後送り

---

## 7. リスク・未解決の問い

### 多 state/frame モデル — MorphMol が容器、trajectory reader のみ不在
1. **複数フレーム容器は `src/modules/anim/MorphMol` に既存** (`frame`/`nframe`/`setFrame`/`insertBefore`/`removeFrame`/`appendThisFrame`、QIF 公開済み)。`count_frames`/`frame`/`mset`/`join_states` は MorphMol で adapter/direct 対応可
2. trajectory reader (DCD/XTC/TRR) のみ不在 -> 別ブランチの experimental MD trajectory 実装が develop に統合されると `load_traj` が adapter 化。単フレーム MD (gro/coor/inpcrd) は mdtools で既に読込可
- `split_states`/`intra_fit`/`intra_rms`/`smooth` は MorphMol の frame アクセスを土台にロジック新規 (new-impl だが基盤改修は不要)
- **アクション**: (a) MorphMol と AnimMgr の役割分担 (どちらが `frame`/`mset` の source of truth か) を確定。(b) MD trajectory ブランチ統合の前後で軌道リーダの対応フォーマットを確認

### selection 翻訳のリスク
1. **クラスマクロの alias 設計**: §3.2 の通り alias 機構で対応可能。ただし `backbone`/`sidechain` の正確な定義 (protein/nucleic で異なる原子名集合)、`hetatm` の正確な定義 (PDB 上の非標準残基 vs CueMol の `ligand` alias) は要詰め。近似で不正確になる場合の扱い (エラー vs 黙認) を決める
2. **`-`/`+` 多義性の取りこぼし**: regex 実装に逃げると静かに誤変換。§3.3 推奨の AST 経由を堅持し、未対応トークンは必ず位置付きエラーにする
3. **`within/beyond/near_to` の方向付き 2 集合演算**: cuemol `around` は片側のみ。限定形以外は翻訳しない
4. **`neighbor`/`extend`**: cuemol に token はあるが未実装 (false 返し)。drop で確定 (写像すると空結果の罠)

### 最大工数 new-impl の未解決問い
5. **picking/対話編集基盤**: `edit`/`drag`/`mask`/`protect`/`invert`/`unpick`/`remove_picked` は cuemol に対話 picking がないためまとめて保留。pym console は「テキスト式の非対話 API」と割り切るのが自然
6. **配列アライメント (`align`/`super`)**: cuemol は構造ベース SSM のみ。配列アライナ (~2000 行) を実装するか、`cealign`->SSM 代替・`alignto`->ssm_fit ループで「構造整列のみ提供」と割り切るか
7. **化学エンジン (`h_add`/`protonate`/`rebond`)**: RDKit 等外部ライブラリ統合の是非。embedded Python なので RDKit を引き込めるなら工数激減だが、依存とビルドの判断が要る

### 横断的な確認事項
8. **selection の単一実装点**: tritium worker (`makeSel.ts`/`validateSelection.service.ts`) と pymod の SelCommand 経路が、sel_translate.py の出力を同じ契約で受けるか。境界をまたぐので型契約マップ (ServiceMap 等) への行追加が起点
9. **degrade 検出テストの先行整備**: sel_translate.py 投入前に「PyMOL 式 -> CueMol 式」の wire 形式 (token 翻訳・優先順位の括弧付け) を pin するテストを `__test__/` に先に書く
10. **新 API のシグネチャ**: `runPymCommand(string)->string(JSON {ok,output,error})` で良いか。`dict` 返し (LVariant->JS object) 案もあるが、境界が単純な前者を推奨

---

## 8. 概念モデルの差分と pym console layer での吸収可能性

PyMOL と CueMol はデータモデル・状態モデルが根本的に異なる。pym console が「PyMOL ユーザに馴染む」ためには、コマンド名や引数の翻訳だけでなく、**概念のズレを pym layer がどこまで吸収できるか**を見極める必要がある。吸収可能性を次の 4 段階で分類する。

- **◎ 吸収可能**: pym layer の翻訳/ラッパで PyMOL の挙動をほぼ再現できる
- **○ 方針決めで吸収**: cuemol に対応概念はあるが写像方法に設計判断が要る (一度決めれば安定)
- **△ 部分・要割り切り**: 中核は再現できるが、必ずセマンティクスのズレが残る (ユーザに告知が要る)
- **✗ 吸収不可**: cuemol に概念自体が無い (新規実装か、機能として落とす)

### 8.1 概念差分の総覧

| 概念 | PyMOL モデル | CueMol モデル | 吸収可能性 |
|---|---|---|---|
| 名前付き selection | session 横断の名前付きアトム集合 (可視インジケータ付き、enable/disable) | テキストの selection alias (StyleMgr) + 分子ごとに評価される sel property | △ |
| representation (show/hide) | 原子ごとの rep フラグ bitmask。show/hide は原子集合に対し加算的 | Renderer オブジェクト (各々が sel + style を持つ)。rep = renderer の生成/設定 | ○ |
| coloring | 原子プロパティ (color は atom に乗り全 rep で共有) | Renderer の ColoringScheme (PaintColoring の sel-based paint 等) | ○ |
| object と state/model | 1 object が複数 state (NMR model/traj frame) を保持 | MolCoord=単一座標。複数 frame は MorphMol、alt conf は confid | △ |
| 暗黙コンテキスト | current object / sele / picked (pk1-4) / current frame を暗黙保持し commands が参照 | scene -> object -> renderer の明示参照。"active view/scene" はある | △ |
| settings | ~1000 個の flat な設定名前空間 (global/object/state/atom スコープ) | renderer/object/scene 上の型付きプロパティ (setProp)。flat な設定名は無い | △ |
| 色名・パレット | PyMOL 独自色名 + ramp | HTML/CSS2 色名 (default_style.xml) + `$molcol` 等 | ◎ |
| undo | 限定的 | 明示的 UndoTxn (transaction) | ◎ (透過) |
| movie/animation | mset で state->frame 対応、mview で camera keyframe | AnimMgr タイムライン + CamMotion + MorphMol | △ |
| map (density) と等値面 | map object + isomesh/isosurface が別 mesh object を生成 (level/selで carve) | DensityMap object に MapSurfRenderer を attach (siglevel)。carve 概念は別 | ○ |
| picking / 対話編集 | pk1-4、edit/drag、原子フラグ (protect/flag/mask) | 対話 picking・編集フラグの枠組みが無い | ✗ |
| 配列ベース操作 | 配列アライメント (align/super)、配列番号 | 構造ベース (SSM) のみ。配列アライナ無し | ✗ (構造ベースで部分代替) |

### 8.2 重要な概念差分の詳細

#### (a) selection の「効果」— ユーザ指摘の核心
PyMOL の `select sele, expr` は **session の selector 名前空間に名前付きアトム集合を作る**。この集合は first-class な存在で、可視インジケータ (pink dots) で enable/disable でき、オブジェクトを横断し、後続コマンドが名前で参照する。「selection が存在する」こと自体が representation から独立した状態。

CueMol では selection の「効果」が 2 つに分離している:
1. **再利用のための名前**: `StyleManager.setStrData("sel", name, exprstr)` でテキスト alias を登録 (StyleMgr スコープ=scene or global)。これは式の別名であって、アトム集合の実体ではない
2. **可視化**: 選択を見せるには `*selection renderer (SelectionRenderer)` の `sel` プロパティに式をセットする。「選択中の原子」は、各 MolCoord に対し式をコンパイル評価した結果

→ **吸収方針 (△)**: pym `select name, expr` は (1) `setStrData("sel", name, 変換後expr)` で名前再利用を吸収 (◎ 部分)、必要なら (2) SelectionRenderer の sel を更新して可視インジケータを再現 (○)。ただし **概念のズレは残る**: PyMOL は「1 つのアトム集合」、CueMol は「各分子に対し再評価されるテキストフィルタ」。`count_atoms sele` のような「sele の原子数」は CueMol では対象分子ごとに変わる。座標編集後も固定集合として扱う PyMOL の局面は再現できない (CueMol alias は常に動的)。pym layer は「named selection = 動的な式の別名」と割り切り、その旨を help に明記するのが現実的。

#### (b) representation: 原子フラグ vs Renderer オブジェクト
PyMOL の `show sticks, chain A` は chain A の原子の stick-rep フラグを立てる (加算的、既存表示に重なる)。`hide sticks, resi 5` はその一部を落とす。representation は原子に属する。

CueMol では representation = **Renderer オブジェクト**で、各 renderer が自分の `sel` と style を持つ。`show sticks, chain A` に素直に対応するものが無い。

→ **吸収方針 (○)**: pym layer が「object ごと・rep type ごとに 1 つの代表 renderer を持つ」という規約を決め、`show rep, sel` をその renderer の `sel` の **和集合更新** (`既存sel or 新sel`)、`hide rep, sel` を `既存sel and not 新sel` に写像する。これで PyMOL の加算/減算的 show/hide を近似できる。一度規約を決めれば安定するが、PyMOL のように 1 原子が複数 rep を同時に持つ細かな組合せや、ユーザが GUI で別途作った renderer との整合は注意が要る。

#### (c) coloring: 原子プロパティ vs ColoringScheme
PyMOL の color は原子に乗り、全 representation で共有される。CueMol の color は **renderer の ColoringScheme** (例: PaintColoring に sel ベースの paint を積む)。

→ **吸収方針 (○)**: `color red, chain A` は対象 object の各 renderer の coloring に「chain A -> red」の paint を追加する形に写像。PyMOL の「1 回の color で全 rep に効く」挙動は、pym layer が object 配下の関連 renderer 全てに適用することで近似 (renderer 単位なので明示的にループが要る)。

#### (d) 暗黙コンテキストと source of truth
PyMOL は current object / sele / picked / current frame を暗黙に持ち、引数省略時にそれを使う。これは §0/§2 で決めた「状態は C++ 側を source of truth、Python はステートレス」方針と緊張する。

→ **吸収方針 (△)**: pym layer に **薄い session コンテキスト** (直近の selection 名、デフォルト対象 object 名程度) を持たせて引数省略を再現するが、**アトム集合・座標・表示状態などの実データは持たない** (それらは C++ scene が source of truth)。picking 由来の pk1-4 は cuemol に picking 概念が無いため再現しない (✗)。

#### (e) settings: flat 名前空間 vs 型付きプロパティ
PyMOL の `set name, value [, object]` は ~1000 個の flat 設定名を持つ。CueMol は renderer/object/scene 上の型付きプロパティ (setProp)。

→ **吸収方針 (△)**: PyMOL 設定名 -> cuemol プロパティパスの**翻訳表**を持つ。対応するものは adapter で写像できるが、(i) 多くの PyMOL 設定は cuemol に対応プロパティが無い、(ii) scope (global/object/state/atom) の概念が違う、ため**部分対応**。未対応設定は位置付きエラーにする。

#### (f) map と等値面の関係
PyMOL は `isomesh name, mapname, level, sel` で map を参照する独立 mesh object を作り、`sel` 周辺で carve する。CueMol は DensityMap object に MapSurfRenderer/MapMeshRenderer を attach し `siglevel`/`level` で等値レベルを指定。

→ **吸収方針 (○)**: `isomesh`/`isosurface` は対象 DensityMap に renderer を生成 + level 設定に写像 (direct)。ただし PyMOL の「selection 周辺だけ carve」は cuemol の対応機構を確認の上で写像 (carve 範囲指定の有無が要確認)。

### 8.3 吸収できない概念 (✗) — pym console の非ゴール
- **picking / 対話編集**: pk1-4、edit/drag、原子フラグ (protect/deprotect/flag/mask)、invert。cuemol に対話 picking の枠組みが無い。pym console は「テキスト式の非対話 API」と割り切る
- **配列ベースアライメント**: align/super の配列依存部分。cuemol は構造ベース SSM のみ (構造整列としては partial 代替可)
- **per-atom/per-state の細かな setting scope**: cuemol のプロパティモデルと粒度が合わない部分

---

## 9. 主要 load-bearing ファイル一覧

| 役割 | パス |
|---|---|
| パーサ/ディスパッチャ置き場 (新規) | `src/python/cuemol/pym/__init__.py` |
| selection 変換 (新規) | `src/python/cuemol/pym/sel_translate.py` |
| 新 C++ API 追加先 | `src/pybr/PythonBridge.qif` / `.cpp` / `.hpp` |
| embedded Python init (stdout 差し替え) | `src/pybr/pybr.cpp:177-189`, `src/pybr/wrapper.cpp:861-867` |
| cuetty エントリ | `cli/cli_main.cpp:198-199`, `src/pybr/PythonBridge.cpp:104-116` |
| selection 文法 (CueMol) | `src/modules/molstr/scanner_sel.lxx`, `parser_sel.yxx` |
| selection alias 解決 | `src/modules/molstr/SelCompiler.cpp:104-111` |
| selection alias 定義 (XML) | `data/default_style.xml:416-424` |
| selection alias runtime API | `src/qsys/style/StyleManager.qif:87-93` |
| cuemol python ユーティリティ | `pymod/python/cuemol/cmd.py`, `cuemol.py`, `mol_util.py`, `fileio.py`, `net_fetch.py`, `undo_txn.py` |
| 密度マップ (リーダ+FFT+renderer) | `src/modules/xtal/MTZ2MapReader.qif`, `MapFFT.cpp`, `CCP4MapReader.qif`, `BrixMapReader.qif`, `MmcifMapReader.qif`, `MapSurfRenderer.qif`, `MapMeshRenderer.qif`, `MapRenderer.qif`, `GLSLMapVolRenderer.qif`, `xtal_loader.cpp` |
| 分子表面 | `src/modules/surface/DirectSurfRenderer.qif`, `MolSurfRenderer.qif`, `MolSurfObj.qif` |
| 結晶対称 | `src/modules/symm/SymOpDB.{qif,cpp}`, `CrystalInfo.qif`, `SymmRenderer.{qif,cpp}`, `UnitCellRenderer.qif` |
| 多フレーム容器 | `src/modules/anim/MorphMol.{qif,hpp,cpp}` |
| 単フレーム MD リーダ | `src/modules/mdtools/{GROFileReader,AmberPrmtopReader,NAMDCoorReader,PsfReader}.qif` |
| フォーマット importers (PSE 含む) | `src/modules/importers/{MmcifMolReader,MOL2MolReader,SDFMolReader,PSEFileReader}.qif` |
| 構造整列/解析 | `src/modules/molanl/MolAnlManager.qif`, `LsqFit.cpp`, `ssmlib/ssm_align.h`, `ContactMap.cpp` |
| 画像/レイトレ export | `src/modules/rendering/{PngSceneExporter,PovSceneExporter,LuxRendSceneExporter,LuxCoreSceneExporter}.cpp` |
| tritium worker 契約 | `tritium/react-gui/src/renderer/worker/shared/calls/` |
| tritium selection 経路 | `tritium/react-gui/src/renderer/worker/server/services/helpers/makeSel.ts`, `validateSelection.service.ts` |
| tritium pane 登録 | `tritium/react-gui/src/renderer/components/panes/index.ts`, `SidePanel.tsx` |

---

## 付録: PyMOL 側の参照 (調査時)

- コマンドキーワード表: `~/ext/pymol-open-source/modules/pymol/keywords.py`
- コマンドパーサ: `~/ext/pymol-open-source/modules/pymol/parser.py`, `parsing.py`
- selection エンジン (C 層): `~/ext/pymol-open-source/layer2/Selector.cpp`
- SECURE mode: `~/ext/pymol-open-source/modules/pymol/parser.py:152-153,282-285`
- 補完: `~/ext/pymol-open-source/modules/pymol/parser.py:524-593` (`auto_arg` + docstring)
