# umbreon の Electron renderer メモリ制約と process 分離設計

tritium から umbreon backend で **GI (OIDN denoiser) を有効にして大きめ解像度を
render すると crash する**問題の調査記録と、その恒久対策として検討している
**umbreon の別プロセス化 (shared-memory 渡し)** の設計メモ。後日プランを立てて
実装するための土台とする。

対象ブランチ: `feat/render-window-umbreon` (OIDN 有効化は commit `db945e4f`,
PR #422)。本書の crash は**その時点で未修正の既知問題**。

---

## 1. 症状

- tritium の render window で umbreon backend + `Enable GI` + `GI denoise` (=OIDN)
  を有効にして render すると、出力サイズによって crash する。
- 実機 (Electron renderer, Chromium Web Worker) での閾値:

  | 出力サイズ | supersample | 結果 |
  |---|---|---|
  | 300x300 | 3 | OK |
  | 600x600 | 3 | OK |
  | 1200x1200 | 3 | **crash** |

- crash は `EXC_BREAKPOINT` (SIGTRAP)。stack は OIDN の UNet 構築中の確保:

  ```
  oidn::alignedMalloc -> posix_memalign -> _malloc_zone_memalign(system)
    -> oidn::USMHeap -> Engine::newHeap -> ScratchArena
    -> UNetFilter::buildModel -> UNetFilter::commit -> oidnCommitFilter
    -> umbreon::denoiseOidn -> denoisePt1E -> EmbreeRenderer::render
    -> UmbreonSceneExporter::write   (Electron Helper (Renderer) プロセス)
  ```

## 2. 根本原因: OS ではなく Chromium PartitionAlloc

**Electron の renderer プロセスは PartitionAlloc-Everywhere (PA-E) を使い、macOS
では既定の malloc zone を PA に差し替えている。** renderer 内の
`malloc`/`posix_memalign`/`operator new` は全て PA を通る。PA は確保失敗/上限超過を
`nullptr` で返さず **`IMMEDIATE_CRASH()` (= `brk #1` = SIGTRAP)** させる設計
(OOM を悪用可能な中途半端状態にしないためのセキュリティ方針)。上限は「単一確保の
direct-map 上限超過」または「パーティション/プロセスのメモリ枯渇」。

**OS レベルの制限ではない (決定的証拠):** 同一の **1800x1800 の OIDN denoise**
(1200x1200 出力 x ss3 -> 内部 3600x3600 -> 1/2-res gather) が

- **standalone gtest (素のプロセス, system allocator) -> 成功** (`denoise 3.0s`)
- **tritium renderer worker -> crash**

と、同じサイズで結果が違う。素の 64bit プロセスは RAM さえあれば数 GB 確保できる。
crash report の malloc frame 直上が Chromium/V8 コード (strip 済みで
`ares_dns_rr_get_ttl` に誤解決) なのも、`_malloc_zone_memalign` -> 差し替え済み
既定 zone (PA) -> OOM crash の経路と整合する。

### 一般化: umbreon/OIDN 固有ではない

この壁は **libcuemol2 が renderer worker 内で行う任意の大確保**に共通し得る
(例: 巨大な MD trajectory の一括 load、大 volume grid)。「PartitionAlloc の方針」が
制限レイヤであり OS ではない、という理解が重要。

## 3. 検討した対策と結論

| 案 | 結論 |
|---|---|
| OIDN `maxMemoryMB` で tiling | **不可**。OIDN 2.x で削除済み (2.5 header に無し)。メモリ管理は自動、`quality` (FAST/BALANCED/HIGH) のみ |
| `quality=FAST/BALANCED` | network が小さくなりメモリ減。ただし任意サイズで robust ではない (閾値を上げるだけ) |
| 低周波な indirect (E-buffer) を解像度キャップ (downscale->denoise->upscale) | in-process のまま bound 可能・軽微な softening。**stopgap として有効** |
| OIDN の malloc/free 差し替え | choke point は `oidn::alignedMalloc(size,align)` / `oidn::alignedFree(ptr)` (arm64 は posix_memalign<->free の matched pair)。**symbol override は macOS 不可** (定義元 `platform.cpp.o` が `getOSName/getBuildName/getCompilerName/operator<<(DataType)` も定義 -> archive member が pull され duplicate symbol。macOS ld に `--wrap` 無し)。**deplibs の OIDN source patch** (private `malloc_create_zone` / `mmap`) なら可能だが per-OS + 3rd-party patch 保守 + PA 迂回の実機実証が要る |
| 自前 allocator で process 全体の malloc 差し替え | **不可 (危険)**。PA と混在し cross-allocator free で heap 破損 |
| 自前 allocator を**対象限定** (自分の大 buffer だけ mmap/専用 zone 直取り) | 可能・安全。ただし OIDN/embree 等**3rd-party 内部確保はカバー外** |
| Electron build に介入 (PA 無効化) | **非現実的**。prebuilt `electron@42.4.0` 使用 (source build せず)。PA-as-malloc は GN 引数=ビルド時決定で runtime flag 無し。Chromium フルソースビルド + fork 保守 + セキュリティ低下に見合わない |
| a-trous fallback (`denoiser=1`) に戻す | 依存無し・crash しないが最終画像全体を平滑化し OIDN より低画質。**stopgap** |

## 4. 恒久対策の方針: umbreon を別プロセス化 (shared memory 渡し)

3rd-party (OIDN/embree) の内部確保まで含めて根本回避するには、**重い render を
PA の効かない素のプロセスで動かす**のが正攻法。

- **spawn は問題なし**: 既に povray/blendpng を app から spawn できている
  (renderer sandbox は spawn を許す設定)。
- **データは shared memory で zero-copy 渡し**にすると、serialization フォーマットを
  手書きせずに済む。
- **denoise だけ分離**より **umbreon 全体を分離**が上位互換:
  - embree BVH・gather・OIDN の**全確保が子 (system malloc)** -> denoise に限らず
    大シーン/大画像で汎用に堅牢
  - ray trace が子に出るので **worker が固まらない** (現状 in-process render は
    worker を同期ブロックする)
  - isolation (umbreon crash が renderer を巻き込まない)、progress/cancel も可能に

### 有効化する鍵: umbreon::Scene は既に flat 化しやすい

`src/umbreon/scene.hpp` の `Scene` は「**index 参照で結ばれた POD 配列の束**」:

- 全メンバが POD スカラ or `std::vector<POD>` (Mesh: positions/normals/colors/index/
  materials/triMaterialId/triGroupId、spheres/cylinders/instanceOffsets/lights/
  groupBlend/groupEdgeStyle、camera/fog/ambient…)
- **`std::string` / 生ポインタ / nested vector は 0 件**、参照は既に index ベース

-> `std::vector<T>` を `Span<T>` / offset ベースに置き換える **relocatable 化の
API 変更は小さい**。Scene 全体を 1 個の連続ブロックにして shm に置けば、両プロセスが
そのまま使える (真の zero-serialization / zero-copy)。

### ライブラリ: Boost.Process + Boost.Interprocess

process spawn / shared memory は **std に無い**ため「replace Boost」の対象外
(CLAUDE.md の Boost 方針を「std に標準化された場合のみ std へ」と明確化済み)。Boost は
既にリンク済みで追加負担も小さい。

- **Boost.Interprocess**: managed segment + `offset_ptr` + 専用 allocator の
  interprocess vector で **relocatable Scene を共有領域上に直接構築**できる (この設計に
  ドンピシャ)。backing は下記の理由で **`managed_shared_memory` ではなく
  `managed_mapped_file`** を使う
- **Boost.Process**: 子 spawn + wait。**mapped file のパスを argv で渡す** (100MB は
  載らないがパスは載る)
- FlatBuffers/Cap'n Proto や自前ラッパは不要 (この方針なら Boost が最短)

### 共有メモリのサイズ上限と backing の選択 (重要)

Boost 既定の `shared_memory_object` (= `managed_shared_memory`) は OS 毎に上限が大きく
異なり、**macOS は数百MB 級を扱えない**:

| OS | `shared_memory_object` の実装 | 実質上限 | 固有の制約 |
|---|---|---|---|
| macOS | POSIX shm (`shm_open`) | **数MB〜数十MB (非常に小さい)** | tmpfs 無し、SysV `shmmax` 既定 ~4MB、大セグメントの `shm_open`+`ftruncate` が失敗しがち |
| Windows | pagefile-backed file mapping | RAM + pagefile (commit limit) | 3つで最も緩いが **カーネル永続性なし** (最後の handle close で消滅) |
| Linux | tmpfs (`/dev/shm`) | `/dev/shm` サイズ, RAM+swap | `/dev/shm` remount で調整 |

**実装方針**: Scene + 結果フレームは数百MB になり得るので、**`managed_mapped_file`
(実ファイルの mmap) を使う**。上限は「FS 空き容量 + アドレス空間 = 64bit なら実質
RAM+paging」になり、**macOS では事実上必須**。

- `offset_ptr` / segment allocator / interprocess vector を使う relocatable Scene の
  設計は**そのまま** (backing が shm -> mmap file に変わるだけ)
- handoff は shm 名ではなく **mapped file のパス**を argv で渡す
- Windows: 実ファイルバックなので明示 delete まで残り、windows shm の**非永続問題を
  回避**。転送後に**親が temp file を削除**する
- ここで言う mmap file は「serialize して write->read する temp file」とは別物:
  **mmap による zero-copy 共有**。下表「temp file 不要」は前者 (直列 I/O) を指す

### データ転送の選択肢

| 方式 | 評価 |
|---|---|
| **mmap file (`managed_mapped_file`)** | zero-copy・relocatable Scene と相性最良・OS 上限を回避 (macOS 必須)。**本命** |
| POSIX/Windows 生 shm (`managed_shared_memory`) | zero-copy だが **macOS の shm 上限で数百MB を扱えず不可**。Windows は非永続の癖あり |
| pipe (stdin/stdout) | file 無しで簡単。deadlock は「親: 全 write->close->read / 子: 全 read->denoise->全 write」で回避。転送コストは denoise 本体に対し無視できる。ただし relocatable Scene の zero-copy は活かせない |
| temp file (serialize して write->read) | disk I/O と後始末が要る。**不要** (mmap file と混同しない) |

## 5. 次の設計ステップ (後日プラン化)

1. **relocatable Scene の API 形**: `std::vector` メンバの Span/offset 化 + shm segment
   上の Builder。`RenderOptions` (+ `strokeEdges` 等サブ構造) も POD transfer 前提
   (非 POD があれば同様に flat 化)
2. **segment レイアウト**: `managed_mapped_file` 構成、magic + version (親子は同一
   ビルドだが mismatch 検出用)、alignment padding
3. **handoff プロトコル**: 親が mapped file に segment 構築 -> 子に `{file パス, size}`
   を argv 渡し -> 子が同じ mapped file を open/map -> `umbreon::render`
4. **結果返却**: 出力を別 mapped file (raw frame) or PNG bytes を子でエンコードして返す
5. **fallback / 後始末**: 子 crash 時の親退避 (a-trous / denoise skip / エラー表示)、
   転送後の **temp file 削除**、renderer 側で file の `mmap` が sandbox を通るかの実機
   実証 (重い確保は子側なので親は生成+書き込みのみ)

## 6. それまでの暫定策

恒久対策 (§4) の前に crash だけ止めたい場合の選択肢 (いずれも stopgap):

- **a-trous fallback**: `UmbreonDisplayContext::render` の GI で `pt1Denoise=false;
  denoiser=1` に戻す。crash 停止・低画質
- **解像度キャップ**: 低周波な E-buffer を上限解像度に downscale して OIDN、結果を
  upscale。in-process のまま bound

## 関連

- render window の設計: `docs/migration/adr/ADR-0035-render-window.md`
- OIDN 有効化 (deplibs v0.1.0 / `UMBREON_WITH_OIDN` / consumer 側 find_package):
  commit `db945e4f`、`src/cmake/umbreon.cmake`、`build_scripts/build_umbreon_posix`
- umbreon denoise 経路: `src/umbreon/experimental/pt1/pt1_denoise.cpp` (`denoisePt1E`)、
  `experimental/irradiance_cache/denoise_oidn.cpp` (`denoiseOidn`)
