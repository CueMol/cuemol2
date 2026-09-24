> **状況(2026-09-22 更新)**
>
> Phase 1(計測基盤)完了。Phase 2 は当初案を取り下げ、計測が指した対象を 2 本
> マージ済み(PR #625 座標配列を source of truth に / #626 座標テクスチャの
> ダブルバッファリング)。
> 結果は `tritium/bench/README.md`、原因と前後比較は
> `tritium/docs/architecture/renderer-update-cost.md`。
> **次にやるべきことは末尾の「## 現在地と次にやること」を読むこと。**
> 以下の本文は当初のプランで、実施内容とは異なる箇所がある(どこがどう違うかは
> 末尾にまとめた)。

# tritium(CueMol3)性能ベンチマークと最適化プラン

## Context

WebGPU/WebGL2 PoC(`~/proj64/webgpu_ele_poc1`)で得た知見を、実物の分子ビューア `~/proj64/cuemol2/tritium` に適用する。目的は (1) 実分子シーンでの性能を再現可能に計測し論文の主結果にすること、(2) 計測で裏付けた最適化を develop に入れること。

PoC で確定した方法論と、tritium の現状調査(3 並列探索)の要点:

| PoC の知見 | tritium の現状 |
|---|---|
| 頂点は JS 所有 ArrayBuffer に C++ が直接書く(direct) | **既に実装済み**(`tritium/core/cxx_src/ElecDisplayContext.cpp:267-304`、`EcBufferRep.cpp:82-93` で memcpy 回避) |
| 単一 VBO へ GPU 読取中に `bufferSubData` すると 27 倍遅い → VBO ring | **未対策**。`BufferStore.ts:157-170` が単一 VBO へ全量 `bufferSubData`、常に `STATIC_DRAW`、部分更新なし |
| Worker の rAF はバースト発火する → フェンスでバックプレッシャー | 未対策。ただし描画は C++ の dirty flag でゲートされ、常時再描画は jitter AA / AO / hover 時のみ |
| 生成が律速だと転送が測れない | 別問題が支配的: **オブジェクトごと毎フレーム** `useProgram`×2、UBO `bufferSubData`×3、C++ で `Napi::ArrayBuffer::New`+memcpy ×3、N-API 往復 ~7 回(`EcShaderObject.cpp:282-331`、`ShaderStore.ts:224-260`)。行列・フォグは全オブジェクト同一 |
| 1 セル 1 プロセス、CLI 完全指定、キャンバスはデバイスピクセル指定 | 非対話起動の手段なし(ファイル引数のみ)。MD 再生は JS `setInterval`(既定 15fps)で vsync 非同期 |
| 撹乱要因を固定する | jitter AA(`m_jitterMoreSamples`)、AO(`m_aoHalfPending`)、hover(`m_bPresentDirty`、同期 `readPixels`)、DPR が未固定だと "idle" が full frame になる(`src/qsys/GUIView.hpp:87-89`) |

計測基盤: C++ に `qlib::PerfMeasManager` が休眠状態で存在し `sceMgr.enablePerfMeas()` で有効化可(`src/qsys/SceneManager.cpp:265-287`、TS wrapper あり)。JS 側の `perf.ts`(frame time / draw call / upload bytes カウンタ)は `f5879401` で削除済みで `git show f5879401^:tritium/react-gui/src/renderer/worker/server/perf.ts` から復元できる。`EXT_disjoint_timer_query_webgl2` は未使用。既定ビルドが Debug で `MB_DPRINTLN` がホットパスにあるため **Release ビルド必須**。

## 決定事項

| 項目 | 決定 |
|---|---|
| ベンチ駆動 | アプリ内 `--bench` モード。worker 側 bench service が既存 worker service を直接呼び、1 プロセス 1 構成を計測して終了。ランナーが行列を回す |
| データ | 構造は **RCSB から curl で事前取得**(getpdb と同じ URL 経路)。MD トラジェクトリのみ手元コーパス |
| 最適化範囲 | 計測基盤 + 上位 2 項目(per-object UBO/N-API 往復削減、VBO 更新経路)。各項目は計測でゲート |
| 比較対象 | 含めない(tritium 単体)。ただしシーン定義・解像度・カメラ軌道は spec ファイルに外部化し後で同条件比較できる形にする |
| **ブランチ運用** | **ベンチ用コードは develop に入れない**。詳細は次節 |

## ブランチ運用(develop を汚さない)

```
develop ──┬──────────────────┬──────────────────────▶
          │                  │  merge develop periodically
          ▼                  ▼
bench/perf-harness ──────────────────────────────────▶  (永続、develop へマージしない)
          ▲ temp merge for measurement
perf/ubo-hoist     (develop から分岐 → PR → develop)
perf/vbo-update    (develop から分岐 → PR → develop)
```

- **`bench/perf-harness`**: `--bench` モード、bench service、計測フック、ランナー、spec、結果、手順書。develop からの取り込みは `git merge develop`(リポジトリ方針は merge commit)
- **最適化**: `perf/<topic>` を develop から切る。効果測定は `bench/perf-harness` に一時的に `git merge perf/<topic>` して行う。効果が確認できたら PR で develop へ(`gh pr merge --merge`)。bench ブランチ側は次回 `merge develop` で自然に追随
- **マージ衝突を避ける設計**: ハーネス本体は新規ファイルに置き、既存ファイルへの変更は「フック 1 行」に限定する
  - `main/index.ts`: `--bench` 引数の分岐 1 箇所
  - `gfx_manager.ts` `bindCanvas`: bench 時のみ `gl` を計数 Proxy で包む 1 行(BufferStore/ShaderStore は触らない)
  - `ViewLoopController.ts` `render`: bench 用 per-frame フック 1 行(既存 `afterIdle` と同じ形)
  - C++ addon: `getBenchStats()` 1 メソッド追加と、計測対象関数への `AutoTimeMeas` 数行
- 最適化 PR の設計記録は `tritium/docs/architecture/`(WebGL backend 固有)に置く。このプラン自体とベンチ手順は bench ブランチの `docs/plans/260919-tritium-perf-benchmark-plan.md` + `tritium/bench/README.md` に置き、develop には入れない

## 前提・環境

- **Release ビルド**: `cd build_scripts && task rebuild_libcuemol2 CONFIG=Release && task build_tritium CONFIG=Release`(POSIX 既定は Debug。`docs/plans/260718-line-cyl-coord-texture-direct-update-phase3-plan.md:21`)
- 起動: `task run_tritium FRESH=1` 相当(`CUEMOL_FRESH_PREFS=1` でクリーンプロファイル。`main/index.ts:48-63`)。`disable-renderer-backgrounding` は既定で付く(`main/index.ts:45`)
- 解像度: PoC と同じく `--canvas=WxH` をデバイスピクセルで指定し、`useContentSize` + `setContentSize` でタイトルバーの影響を除く。基準 **1920x1080**、フィルレート確認用に 2880x1800
- **撹乱要因の固定**(bench spec の `pin` で view/scene プロパティを設定): jitter AA off、AO off、hover ハイライト/GPU pick off(`useHoverInfoHandler` の `naviHover` は bench では発火しないが、view 側の `m_bPresentDirty` も抑える)、AA 方式固定。プロパティ名は実装時に `GUIView.hpp` / `FrameRenderPipeline` で確認
- 反復: 各セル 3 回、平均 ± SD を報告(論文向け)。1 セル = 1 プロセス、セル間に settle(大規模は長め)

### テストデータの準備(`tritium/bench/fetch.sh`、bench ブランチのみ)

**構造は RCSB から事前取得**する。ベンチ実行中にダウンロードしない — ネットワーク変動が `load` シナリオの計測に直接混入するため。取得先は getpdb と同じ経路(`worker/shared/pdbUrls.ts` の `pickCoordUrl` が `https://files.rcsb.org/download/<id>.cif`)なので、アプリが開くのと同一のファイルになる。

```sh
curl -fL --retry 3 -o data/<id>.cif.gz https://files.rcsb.org/download/<id>.cif.gz && gunzip
```

**形式は mmCIF に統一**する。大規模エントリ(4V6X / 3J3Q)は鎖数が PDB 形式の上限を超えるため mmCIF しか存在せず、揃えないと `load` シナリオでリーダが混ざって交絡する。`readerName` は `pickCoordUrl` をそのまま import して使う(bench service は worker 側なので `worker/shared/` から読める)。

| 規模 | PDB ID | 原子数(概算) | 内容 |
|---|---|---|---|
| 10² | **1CRN** | 327 | crambin |
| 10³ | **4HHB** | 4,779 | ヘモグロビン |
| 10⁴ | **1AON** | 58,674 | GroEL/GroES |
| 10⁵ | **4V6X** | ~220,000 | ヒト 80S リボソーム(mmCIF のみ) |
| 10⁶ | **3J3Q** | 2,440,800 | HIV-1 カプシド(mmCIF のみ、.cif で数百 MB) |

327 → 2.44M でおよそ **3.9 桁**。3J3Q は取得・解析とも重いので既定の行列からは外し、`--scenes=3j3q` で明示指定したときだけ回す(「そもそも載るか」を示す 1 点として論文には要る)。

`data/` は gitignore し、`fetch.sh` が `manifest.json`(id / バイト数 / SHA-256)を書いて corpus を検証可能にする。

**MD トラジェクトリのみ手元ファイル**(RCSB からは取得できない)。既定は `~/Dropbox/works/test_data/traj_test/` の `eq1.dcd`(2MB)+ `ionized.psf`。PSF は open dialog 未対応だが worker service の `loadTrajectory` 経路で読めるか実装時に確認する。より大規模なもの(リリースノートの 113,961 原子 × 1,001 フレーム)があればパスを指定して差し替えられる形にする。

## Phase 1: 計測基盤(`bench/perf-harness`)

### 1.1 `--bench` モード

**main** (`tritium/react-gui/src/main/`):
- 新規 `main/bench/benchArgs.ts`: `--bench=<spec.json>`、`--bench-out=<result.json>`、`--canvas=WxH` を解釈(`parseFileArgs.ts` は `-` 始まりを捨てるので衝突しない)
- `main/index.ts` にフック 1 行: bench 引数があれば `benchArgs` を `get-config` 相当の IPC で renderer に渡し、`chromeWindowOptions` に content size を適用
- 保存確認ダイアログの回避: bench 時は `before-quit` の modified-scene 確認をスキップ(`tritium/CLAUDE.md:637-643` の E2E 終了処理の問題を bench では設計で潰す)
- 結果受信 IPC `bench:result` → `--bench-out` へ JSON 書き出し → `app.quit()`

**renderer(page)**: 起動後、`shellOpenQueue` と同じタイミングで bench spec を worker の `bench.run` service に投げる。UI は通常どおり(HUD 不要。既存 UI のまま計測。ただし bench 時は hover ハンドラを無効化)

**worker** `server/services/bench.service.ts`(新規、`import.meta.glob` で自動登録。`worker/shared/calls/bench.ts` にスライス追加):
1. `loadObject`(既存 file service の関数を直接 import)で構造を読む
2. spec の `renderers[]` ごとに `new_renderer` コマンド + `sel` + props(既存 rend/coloring service 関数を再利用)
3. カメラ初期化(`fitView` 相当)、`pin` を適用
4. `sceMgr.enablePerfMeas(PM_RENDER_SCENE)` + GL 計数 Proxy を有効化 + C++ `AutoTimeMeas` 集計をリセット
5. シナリオ実行(1.3)。warmup 後 measure 区間のサンプルを収集
6. 結果 JSON を組み立てて renderer → main へ返す

**ランナー** `tritium/bench/run.js`(新規。PoC の `scripts/bench.js` を移植): 行列(scene × renderer × scenario × canvas × 反復)を展開し、セルごとに `electron . --bench=... --bench-out=... --canvas=...` を **新プロセス**で起動、`--bench-out` を集約して `tritium/bench/results/<stamp>.{csv,json}` に書く。絞り込み `--scenes/--renderers/--scenarios/--canvases/--repeat`。spec は `tritium/bench/specs/*.json`

### 1.2 計測フック

| 何を | どこで | 方法 |
|---|---|---|
| frame time(p50/p95/p99)、drawn/skipped | `ViewLoopController.ts` `render` のフック | `performance.now()` 差。C++ が実際に描いたかは `PM_RENDER_SCENE` のサンプル数増分で判定 |
| GPU 時間 | `gfx_manager.ts` `bindCanvas` | bench 時のみ `EXT_disjoint_timer_query_webgl2` を取得、1 フレームに 1 クエリ、後続フレームで回収(PoC の `webgl2.js` と同じ形) |
| GL 呼び出し数(`useProgram`/`bufferSubData` bytes/`drawElements*`/`bindVertexArray`/`bindBufferBase`/`getUniformLocation`) | `bindCanvas` | bench 時のみ `gl` を **計数 Proxy** で包む(`getError` は呼ばない。旧 `wrapGL` の同期問題を避ける)。BufferStore/ShaderStore は無変更 |
| C++ 内訳: renderer ジオメトリ生成、`EcBufferRep::{create,update,draw}`、`EcShaderObject::update*UBO`、`EcFloatDataTexture::update`、`DisplayList::callDisplayListImpl` | 各関数に `qlib::AutoTimeMeas` 相当の累積タイマ | addon に `getBenchStats()` を追加(累積 us と回数、`allocBuffer` 累計バイト)。`services.cpp` の `getMemoryTrackingStats` と同じ露出方法 |
| メモリ | worker/main | `process.memoryUsage()`(rss/external)、`allocBuffer` 累計、VBO 総バイト(Proxy で `bufferData` サイズを積算) |
| 入力→描画遅延(software) | bench service | 合成 `mouseMove` を `handleMouseMove`(`WorkerService.ts:550`)に注入し、注入時刻 → 次 rAF の描画完了時刻を記録。**motion-to-photon は測れない**旨を結果に明記 |

### 1.3 シナリオ

| id | 内容 | 主指標 |
|---|---|---|
| `static-orbit` | 表現生成後、毎フレーム view を一定角回す(合成ドラッグまたは camera 直接)。ジオメトリ不変 | render fps、frame time 分位、GPU ms、GL calls/frame、draw calls/frame |
| `md-playback` | **rAF ごとに** `setTrajectoryFrame(++f)`(既存の `setInterval` 再生は使わない。`docs/plans/260718-md-trajectory-phase2-plan.md:29` が求めていた frame-locked harness) | update fps(進んだフレーム/秒)、frame time、C++ 内訳(座標テクスチャ更新 vs フルリビルド) |
| `prop-change` | 毎フレーム色 or 選択を変更 | 変更 → 描画完了の時間、upload bytes/frame(現状は全量再送) |
| `load` | ファイル読込 → 初回描画完了 | 総時間と C++ 内訳(`buffer-alloc-routing.md` の手法。初回フレームの 82% が生成、の追試) |
| `idle` | 何もしない | frame time ≒ 0 の確認(撹乱要因の固定が効いているかの自己診断) |

### 1.4 行列(既定)

- scenes: 1CRN / 4HHB / 1AON / 4V6X の 4 規模(3J3Q は明示指定時のみ)
- renderers: `cpk`(座標テクスチャ)/ `ballstick`(同)/ `cartoon`(DisplayList、フルリビルド)/ `dsurface`(`TrigGpuPrim`、32B 頂点)/ `simple`(instanced line)。**混在させない**(遅い方が律速するため。`260717-…-plan.md:1269`)
- scenarios: `static-orbit` は全組合せ、`md-playback` は MD 対応データ × {cpk, ballstick, cartoon}、`prop-change` と `load` は中・大規模
- canvas: 1920x1080。フィルレート確認に `static-orbit` × 最大規模のみ 2880x1800 を追加
- 反復 3。1 セル約 10 秒 + 起動、全体で 1〜2 時間。**普段は絞り込みで最小限だけ回す**

### 1.5 成果物

- `tritium/bench/README.md`: 手順、行列、撹乱要因の固定方法、結果表
- `tritium/bench/results/`: CSV/JSON(コミット対象。bench ブランチのみ)
- ベースライン表(最適化前)

## Phase 2: 最適化(develop 向け、計測でゲート)

### 2.1 `perf/ubo-hoist`: オブジェクトごとの UBO / ArrayBuffer / N-API 往復の削減

現状(`EcShaderObject.cpp:282-331`、`ShaderStore.ts:224-260`、例 `src/gfx/SphereGpuPrim.cpp:138-145`): `GpuPrim::draw` ごとに `enable → setupFog → setupMat → updateDrawParamsUBO → drawElem → disable` で、UBO 3 本を毎回 `Napi::ArrayBuffer::New`+memcpy して `bufferSubData`、`useProgram` を 2 回。

変更:
1. **行列・フォグ UBO をパス単位に**: `GUIView::drawScene` / `FrameRenderPipeline` のパス開始時に 1 回だけ更新(dirty 時のみ)。`GpuPrim::draw` からは外す。binding point 0/1 はプログラム間で共有されているので描画順に依存しない
2. **UBO 用 ArrayBuffer の永続化**: `EcShaderObject` が UBO ごとに `Napi::ObjectReference` を保持し C++ が直接書く(頂点と同じ direct 方式)。JS は `bufferSubData` のみ。`createBuffer`(`ElecView.hpp:69-77`)の毎回呼び出しを排除
3. **`useProgram` はプログラム変更時のみ**: `ShaderStore` に current program を持たせ、同一なら no-op。`disable` の `useProgram(null)` は廃止(次の enable で上書きされる)
4. `getUniformLocation` をプログラム別にキャッシュ(`ShaderStore.ts:191,202,213`)。同 PR に含める(小さく、同じファイル)
5. `updateDrawParamsUBO` の `bindBufferBase` 再実行を初回のみに

検証: `static-orbit` の GL calls/frame と C++ 内訳(`update*UBO` 累積)が大幅減、frame time が多オブジェクトシーンで改善。単一オブジェクトでは差が小さいことも確認(効果の性質の裏付け)

### 2.2 `perf/vbo-update`: VBO 更新経路

現状(`BufferStore.ts:112,157-170`): 常に `STATIC_DRAW`、更新は単一 VBO へ offset 0 の全量 `bufferSubData`、部分範囲なし。

変更:
1. **usage hint**: 更新されうるバッファ(`isUpdated` が真になったことがある、または C++ が「動的」と宣言)は `DYNAMIC_DRAW`
2. **全量書き換え時の衝突回避**: PoC の実測(orphan 44.5ms / ring 31.3ms / 単一 838ms @480MB)に基づき、**サイズ閾値で切替**: 小バッファは orphan(`bufferData(null,size)` → `bufferSubData`)、大バッファは 2 枚 ring。`BufferStore` の `_draw_data` エントリを `{vaos[], vbos[], index}` に拡張(VAO は VBO ごとに要る)
3. **部分更新**: `gfx::AbstDrawElem` に dirty range(開始/終了要素)を持たせ、`EcBufferRep::draw` の N-API 引数で `offset/length` を渡し、JS は `bufferSubData(target, offset, new Uint8Array(ab, offset, length))`。色変更・選択変更の経路(`objectChanged` → `invalidate`)で範囲を記録するのは renderer 側の作業量が大きいので、**まず `SelectionRenderer` / 色変更の 1 経路**で効果を出し、他は後続

検証: `prop-change` の upload bytes/frame と frame time、`md-playback` × cartoon(フルリビルド)の frame time。`static-orbit` は無変化のこと(回帰なし)

### 2.3 見送り(記録のみ)

- フェンスによるバックプレッシャー: tritium は dirty gating があり常時描画は限定的。`md-playback` で rAF バーストが観測されたら検討
- 16bit インデックス / `hitName` の別ストリーム化、cartoon・分子表面の `atomsMoved` 部分更新、hover `readPixels` の非同期化(PBO)、`ShaderStore.deleteShader` がマップエントリを消さないバグ(`ShaderStore.ts:163-171`、bench で shader を作り直す前に直す価値あり)

## 実装順序

1. bench ブランチ作成、`fetch.sh` でデータ取得、Release ビルド確認、`--bench` の最小経路(load → static-orbit → 結果出力 → quit)を 1CRN で通す
2. 計測フック(frame time / GPU query / GL Proxy / C++ 集計 / メモリ)
3. シナリオ追加(md-playback frame-locked、prop-change、load、idle)、撹乱要因固定、ランナー
4. ベースライン取得(絞り込みで段階的に。全行列は最後に 1 回)
5. `perf/ubo-hoist` 実装 → bench へ一時マージ → 計測 → PR
6. `perf/vbo-update` 実装 → 同上
7. 結果整理、`tritium/bench/README.md`、architecture doc

## Verification

- 各段階で `cd build_scripts && task build_tritium CONFIG=Release && task run_tritium FRESH=1` が起動し、`launch worker OK` → `INITIALIZED` → `bindCanvas` → `shader program created OK` が出ること(`CLAUDE.md:155`)
- `--bench` 単体: `electron . --bench=tritium/bench/specs/1crn-cpk-orbit.json --bench-out=/tmp/o.json --canvas=1920x1080` が結果 JSON を書いて終了する。`idle` シナリオで frame time ≒ 0(撹乱固定の確認)
- ユーザー目視: 各シナリオで意図した表現・動き(視点回転 / MD 再生 / 色変化)になっていることを確認してから計測に入る(PoC で「真っ黒」を見逃した教訓)
- 再現性: 同一セル 3 反復の CV が数 % 以内。1 セル 1 プロセスで前セルの影響が無いことを、同セルを順序を変えて回して確認
- 最適化: bench ブランチへ一時マージ → 同一行列で前後比較。`static-orbit` に回帰が無いことを必須条件にする
- テスト(リポジトリ方針: 最小限、契約を pin): bench ブランチ側は `calls/index.test.ts` が service 登録を検査するので `bench` スライスを追加。develop 側の最適化 PR は「UBO が パス単位で 1 回だけ更新される」「部分更新が offset/length を渡す」の wire 契約 1〜2 件ずつ
- 型・lint: `npx tsc -p tsconfig.web.json --noEmit`、`tsconfig.node.json`、`task lint_tritium_style`。react-gui vitest、core Jest

## リスク

- Release ビルドのビルド時間(libcuemol2 フル再ビルド)。最初に 1 回
- 大規模データのメモリ。4V6X(~22 万原子)の CPK は 136 B/原子 で約 30MB、分子表面はさらに大きい。3J3Q(244 万原子)は数百 MB 級になり、VBO ring(2×)と重なると厳しい。ランナーの settle を長めに取り、3J3Q は単独実行
- 3J3Q の `.cif` は数百 MB。取得は 1 回だけで済むが、`load` シナリオの時間は他規模と桁が違う
- `pin` するプロパティ名の確認漏れ → `idle` シナリオで自己診断
- bench ブランチと develop の乖離。`merge develop` を最適化 PR ごとに実施


---

# 現在地と次にやること

*(2026-09-22 追記。以上の本文は当初案。以下が実際の結果と、そこから見えた次の作業。)*

## 完了したこと

**Phase 1(計測基盤)** — 完了。5 シナリオ + idle 自己診断、5 規模(327 / 4,779 /
58,870 / 237,685 / 2,440,800 原子)。1 セル 1 プロセス、3 反復、反復間の広がりは
平均の 1% 未満。

| シナリオ | 内容 |
|---|---|
| `static-orbit` | カメラのみ動かす。ジオメトリ不変 |
| `prop-change` | 毎フレーム色を変える |
| `coord-morph` | 毎フレーム全原子が動く。topology 不変(`md-playback` の代替) |
| `md-playback` | 実 MD トラジェクトリを rAF ごとに 1 フレーム進める(往復再生)。2026-09-24 追加、下記「md-playback を実データで有効化」 |
| `load` | ファイル読込 → 初回描画 |
| `input-latency` | 合成ドラッグ。ワーカー内の区間のみ(motion-to-photon ではない) |
| `idle` | 自己診断。撹乱要因の固定が効いているかを確認 |

**Phase 2** — 当初の 2 項目は実施せず、計測が指した対象を 2 本マージ。

| PR | 内容 | 効果 |
|---|---|---|
| #625 | 座標配列を source of truth に(`MorphMol` の `AnimMol` 派生化を含む) | 4V6X の座標更新 24.9 → 60 fps、静的表示の CPU が全規模で約 0.3 ms に平坦化 |
| #626 | 座標テクスチャのダブルバッファリング | 3J3Q の転送 22.0 → 9.9 ms、36.4 → 53.9 fps |

**#626 は #625 の副産物として見えた。** 原子ごとの検索が消えた結果、それまで実質の
スペーサになっていた 26 ms が無くなり、単一テクスチャへの書き込みが GPU の読み取りと
衝突するようになった。同じバイト数・同じ呼び出しで転送時間が 2.5 倍に増えたことで
発覚。**PoC の VBO ring(27 倍)の知見は tritium でも生きていたが、別のボトルネックに
隠れていた。**

## md-playback を実データで有効化 (2026-09-24)

公開 MD データを `tritium/bench/md-corpus.json` に登録した。取得は `fetch-md.py` で行い、
匿名で取れて SHA-256 を照合できるものだけを採った。GPCRmd はダウンロードにアカウントが要り、
MDRepo はトークンが要るので不採用。10⁶ 原子級で溶媒込みの公開トラジェクトリは実用的なサイズの
ものが無く、自前計算を手動配置のエントリ (`large`) とした。詳細は `tritium/bench/README.md`
の「Getting the MD trajectories」。

| セル | 原子 | fps | フレーム更新 ms | CPU ms | 座標テクスチャ µs/f |
|---|---:|---:|---:|---:|---:|
| ifabp cpk (DCD) | 12,445 | 60.0 | 0.60 | 0.44 | 135 |
| yiip cpk (XTC, lazy) | 111,815 | 60.0 | 3.34 | 0.47 | 228 |
| yiip cpk (XTC, eager) | 111,815 | 60.0 | 0.30 | 1.04 | 526 |
| yiip ribbon (XTC, lazy) | 111,815 | 26.8 | 1.98 | 34.7 | - |
| mcv448 cpk (XTC, lazy) | 161,188 | 60.0 | 2.20 | 0.89 | 461 |

(Apple M2 / ANGLE-Metal、1920x1080、3 反復)

- **cpk は 16 万原子の実トラジェクトリで 60 fps。** coord-morph の結論はそのまま成り立つ
- **MorphMol に無いコストは lazy 読込の XTC 展開で、11 万原子で約 3 ms/frame。** 16.7 ms の
  予算には収まる。eager にすると消えるが、load が 1.0 -> 2.3 s、RSS が 1.1 -> 1.7 GB に増える
- **ribbon は実データでも 27 fps (CPU 35 ms)。** 残項目「メッシュ系レンダラの座標高速経路」が
  実用上最大の差であることが、実データの再生でも確認できた
- **公開データを読むと reader の制約に当たった。** 製品側では直さず、ベンチの派生ファイルで回避した:
  - DCD reader は little-endian しか読めない (ifabp の DCD は big-endian)
  - PDB reader は chain ID が重複した鎖と 5 桁 resid を区別できない (YiiP)
  - PDB reader は `loadsegid` を使っても水の resid wrap が残る

## 取り下げた項目: 色変更でジオメトリを捨てない(旧 C)

`prop-change` は 1AON で CPU 42.3 ms / GPU 4.8 ms と、測定値としては残る中で最大
だった。色を変えただけで座標テクスチャ・原子レイアウト・VBO の全てを捨てて作り直して
いる(`MolRenderer::propChanged` の `defaultcolor` → `invalidateDisplayCache`)。

**それでも取り下げる。頻度が合わないため。** `prop-change` は「毎フレーム色を変える」
という合成負荷だが、実際にはカラースキームの変更は**ユーザー操作 1 回につき 1 回**で、
そのとき 42 ms かかっても体感は一瞬。毎秒 60 回色を変える経路はアプリに存在しない。

対して #625 / #626 が直したのは、トラジェクトリ再生中に**毎フレーム**発生する経路
だった。インタフェース変更を伴う作業(各レンダラが既存 draw element に対して色の
再割り当てだけを走らせる仕組み)に見合わない。

**この判断を誤りかけた理由を記録しておく。** 42 ms という数字が他より大きいことだけを
見て「最大の未着手項目」と位置づけ、**その 42 ms が誰にとっての何のコストかを検討して
いなかった**。計測値の大小だけでなく、その経路が実際に何回起きるかを併せて見ること。

`prop-change` シナリオ自体はベンチに残す。ただし他のシナリオと並べると誤解を招くので、
**参考値・低頻度経路**として明示する。

## やる必要がなかったこと

| 当初案 | 実測 | 判断 |
|---|---|---|
| **2.1 per-object UBO をパス単位に巻き上げ** | 重い側(4V6X)でフレームの **0.3%**。小さい構造ほど相対的に大きく見えるが、そちらは元々 CPU 0.36 ms で削っても見えない | **取り下げ**。分母を draw 時間ではなくフレーム全体に取れば最初から分かったこと |
| **2.2 VBO 更新経路(usage hint / orphan / ring / 部分更新)** | 当時 2.5〜3.3% | **取り下げは当時正しく、結論としては誤り。** #625 で前後の CPU 作業が消えると同じ転送が 2.5 倍に増え、リングが効くようになった(#626 で実施)。VBO 本体は未着手(B) |
| **ribbon / dsurface / ballstick / simple の行列** | ballstick は cpk と、dsurface は ribbon と同経路。ribbon は最適化されていないジオメトリ生成を測るだけ | cpk のみに縮小。ribbon の測定値は「メッシュ経路がなぜ遅いか」の記録として保存 |
| **`md-playback`** | 当時はトラジェクトリがマシン上に無く、RCSB にも無い | `coord-morph`(MorphMol による座標補間)で代替した。**後に実データで有効化**(下記)。代替の根拠(レンダラからは区別できない)は正しかったが、フレームのデコードは MorphMol に無いコストだった |

**当初案が外れた理由は共通している。** PoC はジオメトリ生成が LUT で激安だったため
転送が律速に見えたが、実アプリでは生成側と原子走査が支配的で、転送はその陰に隠れて
いた。**プランの「各項目は計測でゲート」という条件だけが正しく機能した。**

**ただし 2.2 の取り下げは、教訓としては逆向きだった。** 「今のフレームで N% だから
不要」は、その N% が別のボトルネックに隠されている可能性を排除しない。実際 2.2 は
#625 で前段が消えた途端に再浮上し、#626 として最大の効果を出した。**大きい項目を
直したら、一度取り下げた項目を測り直すこと。**

## 今回はここまで

**最適化作業は 2 件で打ち止め。** 残りは記録に留め、着手しない。

| 残項目 | 内容 | 着手しない理由 |
|---|---|---|
| メッシュ系レンダラの座標高速経路 | cpk は同条件で ribbon の 24 倍速い(1AON の `coord-morph` で 60.0 対 2.5 fps)。リボン表示でのトラジェクトリ再生は普通の使い方なので、実用上は最大の差 | スプラインメッシュを座標変化時に再生成ではなく更新できるかが未検証。スプライン係数自体が変わるため自明でなく、設計判断を伴う規模 |
| VBO ダブルバッファリング | `BufferStore.ts` は単一 VBO / `STATIC_DRAW` / 全量 `bufferSubData` のまま。メッシュ系は毎フレーム 4 バッファ再確保 | 効くのはメッシュ系のみで、上記を先に直せば再確保自体が減る。単独でやる意味が薄い |
| `LScrSp` の値渡し / `dynamic_cast` | プロファイルで 8〜19% / 5〜12% | **その測定は座標経路を直す前**。原子ごとの走査が大幅に減った今どれだけ残っているか未確認で、まず再プロファイルが要る |

詳細と着手時の判断材料は `tritium/docs/architecture/renderer-update-cost.md`。

## 今回の成果

| | |
|---|---|
| **計測基盤** | 6 シナリオ、5 規模(327 〜 2,440,800 原子)、1 セル 1 プロセス、反復間の広がりは平均の 1% 未満。別ホストでの実行手順は `tritium/bench/RUNNING-ELSEWHERE.md` |
| **最適化 2 件** | #625 座標配列を source of truth に / #626 座標テクスチャのダブルバッファリング |
| **論文向けの主結果** | 静的表示は 327 〜 2,440,800 原子で 60fps、CPU は約 0.3 ms で**原子数に依存しない**。座標更新は 237,685 原子まで 60fps、244 万原子で 53.9 fps。addon 境界のコストは 0.0% |
| **未確認** | 単一環境(Apple M2 / ANGLE-Metal)のみ。Windows / RTX 4080 での確認待ち |

## ブランチ運用(実績)

当初案通り機能した。`bench/perf-harness` は永続でベンチコードを隔離し、develop へ
入ったのは `src/` とドキュメント 1 本のみ(PR #625、32 + 1 ファイル)。
`git branch --contains bench/perf-harness` が bench 自身しか返さないことで片方向性を
担保。効果測定は bench へ一時マージして実施。

1 点だけ運用上の注意: perf ブランチは develop 由来で `tritium/bench/.gitignore` を
持たないため、`git add -A` が構造ファイル(25 MB)を拾う。実際 3 回混入させ、
履歴から除去した。**perf ブランチでは `git add` にパスを明示すること。**
