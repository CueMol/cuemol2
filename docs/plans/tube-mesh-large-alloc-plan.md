# tube 系のメッシュの巨大な一括確保をなくす計画 (2026-10-21 作成)

対象: tube / ribbon / cartoon の GPU メッシュ (`molvis::TubeMeshBuilder`、`molvis::TubeGpuSupport`、`gfx::TrigGpuPrim`)。

## 背景: 何が起きているか

3J3Q (244 万原子) の cartoon で、Electron の renderer process が落ちる (SIGTRAP、exitCode 5)。
調査 (cuemol3_paper_data の `notes/2026-10-21_m4-air.md`、17:00-17:10、M4、`bench/perf-harness` `b54547dd`):

- 落ちた場所: `TubeMeshBuilder::vertexSlow` の `push_back` -> `operator new` -> Electron の malloc (PartitionAlloc) -> 停止。
  レジスタに 2 GiB + 8 バイト。PartitionAlloc は 1 回の確保が約 2 GiB を超えると、メモリ不足として止める
  (`qlib/ChunkedArray3D.hpp` の冒頭のコメントと同じ理由)。
- build のときの記録 (`m_pos`、`m_norm` は頂点あたり float 3 つ = 12 バイト) は `std::vector` で、容量を超えると 2 倍に確保し直す。
  1 GiB (約 8,950 万頂点) を超えると 2 GiB を求めて落ちる。3J3Q cartoon は約 9,400 万頂点 (見積もり) なので、
  **実際に要るのは約 1.1 GB なのに、2 倍の確保で落ちている**。
- 3J3Q ribbon は、リング共有 (#688) で頂点が 0.57 倍の約 5,350 万になり、今は落ちない。ただし余裕は 1.7 倍しかない。

確保している大きな連続領域は 2 段にある。

| 段 | 確保 | 大きさ (3J3Q cartoon、約 9,400 万頂点の見積もり) | 今の問題 |
|---|---|---|---|
| A. 記録 (build) | `TubeMeshBuilder` の `std::vector` 4 本 (`m_pos`、`m_norm`、`m_col`、`m_name`) | 座標 1.1 GB、法線 1.1 GB、色と hit name 各 0.38 GB。2 倍の確保で座標と法線が 2.25 GB を求める | 実際の量は 2 GiB 未満なのに落ちる |
| B. GPU primitive (`toGpuPrim`) | `TrigGpuPrim::alloc` -> `ElecDisplayContext::allocBuffer` -> `Napi::ArrayBuffer::New` を頂点とインデックスで 1 つずつ。WebGL の 1 本の VBO / IBO にそのまま送る | 頂点 24 バイト x 頂点数 = 約 2.26 GB (LAYOUT_PACKED) | 実際に上限を超える。2 倍の確保は無いので、ちょうどの大きさで確保する |

## 方針

1. **実際の量が上限より小さいなら、落ちない。** 記録 (A) を、1 回の確保の大きさに上限のある 1 次元のコンテナに替える
   (`qlib::ChunkedVector<T>`、`ChunkedArray3D` の 1 次元版)。2 倍の確保と、そのときのコピー (旧と新が同時に要る) が無くなる。
2. **実際の量が上限を超えるなら、確保する前に検出して、落とさずに描かない。** GPU primitive の頂点バッファとインデックスバッファ (B) の
   バイト数を、確保の前に上限と比べる。超えたら確保せず、その renderer は何も描かず、ログに 1 回出し、状態を外から見えるようにする。
   build の途中で上限を超えた時点で記録をやめ、超えたメッシュのためにメモリと時間を使わない。
3. **普段の大きさの性能と読みやすさは変えない。** 上限より小さいメッシュは、今と同じ 1 つの primitive、同じ描画、同じ更新の経路。
   更新 (座標と色の書き換え) は GPU primitive に直接書く今の経路のままで、コンテナを通らない。

やらないこと (将来):
- detail level を下げて描く (上限を超えたときの、より良い対処)。
- 上限を超えるメッシュを複数の primitive に分けて描く (chunk の境目で分けられる見込みはある。下の「将来」)。
- tube 系以外の GpuPrim (sphere、cylinder など) の同じ問題。

## 設計

### 1. `qlib::ChunkedVector<T>` (新規、`src/qlib/ChunkedVector.hpp`、ヘッダだけ)

- 要素を固定の大きさのブロック (2 のべき乗個、既定 8 MiB 相当。`ChunkedArray3D::kDefaultChunkBytes` と同じ) に分けて持つ。
  `std::vector<std::unique_ptr<T[]>>` でブロックを持つ (`ChunkedArray3D` と同じ形)。
- インターフェースは `TubeMeshBuilder` が使う分だけ: `push_back`、`operator[]` (`blocks[i >> kShift][i & kMask]`)、`size`、`empty`、
  `clear` (メモリを返す)、ブロックごとに連続領域を渡す `forEachSpan(f(const T *, size_t))`。添字は `size_t`。
- 伸ばすときは新しいブロックを 1 つ足すだけ (既存の要素はコピーしない)。どの 1 回の確保もブロックの大きさを超えない。
- 配列全体を指す 1 本の連続したポインターは取れない (取れないことが、1 回の確保を小さく保つ仕組みそのもの)。連続しているのはブロックの中だけで、
  ブロックごとの先頭と要素数を `forEachSpan` で渡す。記録した配列は `toGpuPrim` で頂点ごとに読むだけで、全体のポインター (`data()`) を
  使う箇所は無い (`b54547dd` で確認)。WebGL に渡す連続したバッファは GPU primitive の側 (段 B) で、今のまま連続。
- ブロックの要素数と要素の型:
  - 要素数は 2 のべき乗にする (`kBlockShift`。添字の計算をシフトとマスクで済ませる)。既定はブロックが 8 MiB 前後になる値 (要素の大きさから決める)。
  - 頂点の座標と法線は、float を 1 つずつではなく、**頂点 1 つ分の構造体を要素にする** (`struct Vec3f { float x, y, z; };`、12 バイト、
    `static_assert(sizeof(Vec3f) == 12)`)。要素の数が 2 のべき乗でも、頂点がブロックの境目で分かれない。ブロックの中では
    `Vec3f` の連続した並び (= `float[3 * n]`) として、`memcpy` や SIMD の処理ができる。
  - float を要素にして要素数を 3 の倍数にする形も考えたが、添字の計算に割り算が要るので採らない。
- 性能: `push_back` はブロックの終わりの判定が 1 つ増えるだけで、2 倍の確保とコピーが無くなる分、大きなメッシュの build は速くなる見込み。
  `operator[]` はシフトとマスクの分だけ増えるが、build の後の詰め替え (`toGpuPrim`) は `forEachSpan` でブロックごとに回す。

### 2. `TubeMeshBuilder` の記録を `ChunkedVector` に

- `m_pos`、`m_norm` (`ChunkedVector<Vec3f>`)、`m_col`、`m_name` (`ChunkedVector<quint32>`) を替える。
  `vertexSlow` の `push_back` は座標と法線で 1 回ずつになり (今は float ごとに 3 回ずつ)、`getPos(i)` は `m_pos[i]` から `Vector4D` を作る形になる。`m_prims`、`m_chunks` は小さいので `std::vector` のまま
  (`Prim` 20 バイト。primitive の数は頂点の数より桁違いに少ない)。
- `vertexSlow` の build の部分、`getPos` / `getNorm` / `getColor` / `getHitName`、`releaseVertexData` (`clear`) は形が変わらない。
- `toGpuPrim` の頂点の詰め替えは、要素ごとの `getPos(i)` のままでもよい (読みやすい)。性能を測って差が出たときだけ `forEachSpan` にする。

### 3. 上限を超えるメッシュの検出

- 上限の値: `gfx::DisplayContext` に `virtual size_t getMaxBufferBytes() const` を足す。既定 (OpenGL などの native の経路) は事実上の無制限 (`SIZE_MAX`)。
  `ElecDisplayContext` は PartitionAlloc の 1 回の確保の上限より少し小さい値を返す (値は下の P-0 で確かめて決める。目安 2 GiB - 数十 MiB)。
  テストのために上限を差し替えられるようにする (`TubeGpuSupport` の static setter、`setParallelMinVerts` と同じ形)。
- 記録の途中: `TubeMeshBuilder` に頂点数の上限を渡す (`startBuild(nSceneID, nMaxVerts)`。上限 = バイトの上限 / `sizeof(PackedUnit)` (24))。
  超えたら `m_bOverflow` を立て、以後の頂点と primitive を記録しない (`vertexSlow` の build の分岐の中だけ。インラインの更新の経路は変えない)。
- `toGpuPrim` の前: 頂点のバイト数 (`nVerts * 24`) とインデックスのバイト数 (`nInds * 4`) を上限と比べる (頂点だけでなく、
  三角形の多いメッシュのインデックスも見る)。
- 超えたとき (`TubeGpuSupport::build`):
  - 記録を捨て (`m_mb.clear()`)、primitive を確保しない (`m_prim.invalidate()`)、`m_bHasMesh = false`。
  - `m_bTopoValid = true` のままにして、座標の更新 (MD の再生、coord-morph) のたびに build し直さないようにする
    (`updateMesh` はメッシュが無ければ何もしない、今の作り)。設定の変更などで invalidate されたら、もう一度 build して判定する。
  - 状態: `tubeGpuLastPass()` に `TG_PASS_TOO_LARGE` を足し、`tubeGpuIsTooLarge()` で外から見えるようにする (テスト、bench、将来の UI 用)。
  - ログ: `LOG_DPRINTLN` で 1 回 (renderer の名前、頂点数、必要なバイト数、上限)。毎フレームは出さない。
  - display list の経路には落とさない (同じ大きさのバッファを作るので、同じく落ちる)。
- bench (`tritium/bench/run.js`) からは、描かれた三角形数 0 と上の状態で判定できるようにする (結果の JSON に状態を出すかは実装のときに決める)。

### 4. 確保の失敗そのものへの備え (補助)

- `ElecDisplayContext::allocBuffer` の `Napi::ArrayBuffer::New` が、上限の手前でも失敗することがありうる (メモリの断片化など)。
  そのとき JS の例外になるのか、プロセスが落ちるのかを P-0 で確かめる。例外になるなら、捕まえて「上限を超えた」と同じ扱いにする。
  落ちるなら捕まえられないので、3 の事前の判定だけに頼る (上限に余裕を持たせる)。

## 手順 (1 つの PR にまとめる。積み上げない)

| | 項目 | 状態 |
|---|---|---|
| P-0 | 上限の確認 (M4、Electron 42.10.0): (a) renderer の中の `operator new` が止まる大きさ (2 GiB 前後を数点)、(b) `Napi::ArrayBuffer::New` が 2 GiB 前後でどうなるか (例外か停止か)。一時的なデバッグ用の関数で確かめ、結果をノートに書く。Windows でも同じか (Windows の 3J3Q tube は GPU プロセスの `GL_OUT_OF_MEMORY` で、別の上限) | [ ] |
| P-1 | `qlib::ChunkedVector<T>` とユニットテスト (ブロックの境目の `push_back` / `operator[]`、`clear` でメモリを返す、`forEachSpan` が全要素を順に渡す) | [ ] |
| P-2 | `TubeMeshBuilder` の記録を `ChunkedVector` に。既存のテスト (共有あり・なしで三角形が一致、build と update が一致、chunk の並列更新) がそのまま通ること | [ ] |
| P-3 | 上限の検出 (`getMaxBufferBytes`、記録の途中の打ち切り、`toGpuPrim` の前の判定、`TG_PASS_TOO_LARGE`、ログ) | [ ] |
| P-4 | テスト: 小さい上限を差し替えて 1CRN で、(1) 上限を超えると落ちずに何も描かず、状態が `TG_PASS_TOO_LARGE` になる、(2) その後の座標の更新で build し直さない、(3) 上限の内側では今と同じ三角形 (位置、法線、色、hit name) になる | [ ] |
| P-5 | 実機の確認 (M4): 3J3Q cartoon coord-morph が落ちずに非表示になり、ログが 1 回出る。3J3Q ribbon は今と同じく描ける (render fps 8.3)。性能: 4V6X / a4tail の ribbon / cartoon、3J3Q tube で、build の時間 (`loadMs`、`firstDrawMs`) と更新 (render fps、worker の CPU) が変わらない (A / B を交互に 2 回ずつ) | [ ] |

## 判断の材料と注意

- 上限は 1 回の確保の大きさの話で、プロセス全体のメモリ量 (16 GB の機体での swap、OS による強制終了) は別の問題。3J3Q cartoon の記録は
  合計で約 3 GB (座標、法線、色、hit name) を使うので、P-3 の記録の途中の打ち切りはメモリの面でも効く。
- 3J3Q ribbon は頂点バッファが約 1.28 GB (24 バイト x 5,350 万) で、上限 (約 2 GiB) の内側。上限を 1 GiB のように小さく取ると、今描けている ribbon が描けなくなるので、
  P-0 で実際の上限を確かめてから値を決める。
- WebGL / ANGLE の 1 本のバッファの上限 (特に Windows の D3D11) は別にありうる。`getMaxBufferBytes` を backend ごとに返す形にしておけば、後から足せる。

## 将来

- 上限を超えるメッシュを、chunk (segment) の境目で複数の `TrigGpuPrim` に分けて描く。chunk の並列更新は chunk の始めで輪の参照を切って
  (`startChunkUpdate` の `resetRing()`) 結果が build と一致しているので、ring band は chunk をまたいで前の輪を参照していないと見ている (確かめる必要あり)。
  更新は、インラインの書き込みの範囲判定 (`m_nVertCur < m_nVerts`) を primitive の境目までにして、境目で次の primitive に切り替える。
- detail level を下げて描く (上限を超えたときに、断面の分割数や spline の分割数を下げて作り直す)。
