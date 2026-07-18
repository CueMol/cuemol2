# 実装計画: 線・円柱系レンダラの座標テクスチャ direct update (Phase 3)

Phase 1 (CPK, PR #441 / commit `8fc30dd0`) で確立した座標テクスチャ direct update を、線・円柱系のレンダラへ展開する。頂点シェーダが原子 index で座標テクスチャを `texelFetch` し、座標変化時はテクスチャ更新だけで済ませる方式を、`SelectionRenderer` / `TraceRenderer` / `BallStickRenderer` / `SimpleRenderer` に広げる。

**Phase 3 のマイルストーン: 汎用の index 版線プリミティブ `gfx::LineIdxGpuPrim` と円柱プリミティブ `gfx::CylinderIdxGpuPrim` を新設し、上記 4 レンダラを direct update 化する。** valence (二重/三重結合) を持たない Selection/Trace/BallStick を先に片付け、valence が生きている SimpleRenderer を最後に回す。

Phase 2 (`AnimMol` / `Trajectory` / DCD reader) は別計画。Phase 3 は Phase 2 と独立に進められる。

---

## 0. 前提・規約

- Phase 1 plan (`docs/plans/260717-cpk-coord-texture-direct-update-plan.md`) の §0 と同じ。コードコメントは英語 ASCII、文字列は英語、コミットは英語で `Co-Authored-By` 無し、ビルド/テストは Taskfile の task を使う。
- 2 つの作業ツリーを参照する (Phase 1 と同一)。

| 役割 | パス | ブランチ | 位置づけ |
|---|---|---|---|
| **実装先** | `/Users/user1/proj64/cuemol2` | `develop` | CMake ビルド。tritium (Electron/WebGL2) を含む現行本流 |
| **参照実装** | `/Users/user1/proj64/cuemol2_png` | `dev201608` | autotools の 2016-2018 レガシー。**読むだけ。変更しない** |

- 性能測定は Release ビルドで行う (Ninja 単一構成なので `task rebuild_libcuemol2 CONFIG=Release` / `task build_tritium CONFIG=Release` で再構成が要る。`perf.ts` の `PERF_MEASURE` トグル)。
- direct update の目視・性能検証は **tritium のみ**。native (Oc 系) はビルドが通ることだけ確認 (uxp_gui は起動しない)。Phase 1 と同じ方針。

---

## 1. 目的とマイルストーン

### 解決する問題

Phase 1 で CPK は座標変化時の全再構築が消えたが、同じシーンに同居する線・円柱系レンダラは依然として `atomsMoved` のたびに全再構築される。特に `SelectionRenderer` は Phase 1 のテストシーンに同居しており「床」として残っている (Phase 1 plan §7.4)。

### Phase 3 のゴール

- 汎用の index 版線プリミティブ `gfx::LineIdxGpuPrim` を新設し、`SelectionRenderer` / `TraceRenderer` / `SimpleRenderer` の線描画を direct update 化する
- index 版円柱プリミティブ `gfx::CylinderIdxGpuPrim` を新設し、`BallStickRenderer` のスティックを direct update 化する。ボールは Phase 1 の `gfx::SphereIdxGpuPrim` を再利用する
- `MolCoord` / `MolAtom` / `MorphMol` / `AnimMgr` を変更しない (Phase 1 と同じ制約)
- 各レンダラ単独のシーンで、変更前後の描画一致と、再構築が消えることを確認する

### Phase 3 で意図的にやらないこと

- Spline / Tube への展開 (係数テクスチャが必要な別課題。Phase 1 plan §8.2)
- `AnimMol` の導入と、レンダラ間での座標テクスチャ共有 (Phase 2)。Phase 3 では **レンダラごとに 1 枚所有**する (§4.4)
- `SelectionRenderer` の `MODE_POINT` (点スプライト描画)。当面レガシー経路のまま (§4.8)
- `BallStickRenderer` の dead な valence コードの移植・削除 (§4.9)

---

## 2. 背景 — Phase 1 で確立した基盤

Phase 3 はこれらを土台にする。すべて `develop` (PR #441) に存在する。

- **`gfx::FloatDataTexture`** (`src/gfx/FloatDataTexture.hpp`): 可変 RGB32F データテクスチャ抽象。`DisplayContext::createFloatDataTexture()` で生成 (既定 `nullptr` → 従来経路フォールバック)。バックエンドは `OcFloatDataTexture` (native) と `EcFloatDataTexture` (WebGL2)。TS 側 peer API は `createFloatDataTexture` / `updateFloatDataTexture` (`TextureStore.ts` / `gfx_manager.ts`)。
- **`gfx::SphereIdxGpuPrim`** (`src/gfx/SphereIdxGpuPrim.{hpp,cpp}`): index 版球インポスタ。`setData(i, idx, rad, devcode)` で index を積み、`setCoordTex(tex, unit)` でテクスチャを bind。**BallStick のボールでそのまま再利用する。**
- **シェーダ基盤**: `src/sysdep/ogl_core/lib_atoms.glsl` の `getAtomPos(tex, ind)` / `getAtomPos3(tex, ind)` (sampler2D + 幅 `TEX2D_WIDTH=1024` 折り返し、`texelFetch`)。body + `#define` 違いの薄いラッパ 2 ファイルで direct/idx を出し分ける (`sphere2_body_vert.glsl` + `sphere2_vertex.glsl` / `sphere2idx_vertex.glsl`)。ビルド時に C プリプロセッサで解決 (`src/glsl.cmake`)。
- **レンダラ側パターン** (`CPK2Renderer`):
  - `renderCoordTexImpl(pdc)`: VBO (index/半径/色) と座標テクスチャを **初回 1 回だけ**構築。`m_aidcache` に AID を記録。
  - `updateCoordTex()`: 座標だけ再収集して `texSubImage2D`。`display()` からダーティ時に 1 回だけ呼ぶ。
  - `objectChanged()`: `OBE_CHANGED` + `descr=="atomsMoved"` でダーティフラグ + `setUpdateFlag()`。GL は叩かない。
  - `display()`: ダーティなら `updateCoordTex()` を 1 回、その後ドロー。`createFloatDataTexture()` が `nullptr` なら従来 GpuPrim にフォールバック。

---

## 3. 調査で判明した事実 (実コードで確認済み)

### 3.1 現 develop の線は「三角形化した幅付き線」

`gfx::LineGpuPrim` は `DRAW_TRIANGLES` + `setNumInstances(nlines)` の真のインスタンシング (`src/gfx/LineGpuPrim.cpp:61-62`)。シェーダ `linew2_vert.glsl` (`:38` でロード) が、2 端点属性 `a_vertex1` / `a_vertex2` + bicolor `a_color1` / `a_color2` から、`screenSize` / `lineWidth` uniform を使って**スクリーン空間で幅 quad を展開**する (`a_index` が quad の 4 隅を選ぶ)。

core profile / WebGL2 では**太い `GL_LINES` 自体がサポートされない** (lineWidth が 1 にクランプされる)。したがって幅を出すには三角形 quad が必須で、細線に戻す選択肢はない。

**帰結**: 参照実装 (dev201608) の座標テクスチャ線経路は **`GL_LINES` (細線・2 頂点/線)** 前提だったので (§3.5)、素直な移植はできない。**`linew2_vert.glsl` の幅 quad 展開と `lib_atoms.glsl` の `texelFetch` を 1 つのシェーダに合体**させる必要がある。これが Phase 3 の中核的な新規シェーダ作業。

### 3.2 `SelectionRenderer` — 即時描画だが GPU 上は LineGpuPrim・単色・アスター

- `MolAtomRenderer` を継承し、`rendAtom` / `rendBond` で **DisplayContext 即時描画** (`pdl->vertex`)。この即時描画は display-list バックエンドが **`LineGpuPrim` にコンパイル**する (`src/gfx/DisplayList.cpp:302`)。レンダラ自身は GpuPrim / シェーダ経路を持たない。
- **単色**: `beginRend` で `pdl->color(m_color)` を一度だけ (`SelectionRenderer.cpp:112`)。bicolor なし。
- **結合**: `drawSelInterAtomLine` → `vertex(pos1); vertex(pos2);` (`:80-87`)。1 本線。
- **孤立原子 (非結合のみ)**: `rendAtom` は `if (!fbonded)` のとき `drawSelAtom` → **`drawAster(pos, 0.25)`** (`:89-92, 127-138`)。`drawAster` は model 空間の X/Y/Z 軸に沿った ±rad の**3 本線** (`DisplayContext.hpp` の実装、`pos±Xr` / `pos±Yr` / `pos±Zr`)。
- **モード**: `MODE_STICK` (`m_nMode==0`, 線) と `MODE_POINT` (`m_nMode==1`, `startPoints` の点スプライト) の 2 モード (`:102-138`)。
- **`objectChanged`**: `OBE_PROPCHG` + `"sel"` しか特別扱いせず、`atomsMoved` は `super_t` に落ちて全 invalidate (`:178-188`)。direct update 用のフックが無い。

### 3.3 `TraceRenderer` — 残基 (CA) 連結の線・valence なし

- 自前 VBO `m_pVBO` (`gfx::DrawElemVC`) を `DRAW_LINES` で持ち (`TraceRenderer.cpp:161`)、`pdl->vertex(curpt)` で残基 (CA) を連結する (`:109`)。valence なし。

### 3.4 `BallStickRenderer` — 既にシェーダ経路あり・valence は dead code

- CPK と同型のシェーダ経路: `m_pSphGpuPrim` (`SphereGpuPrim`) + `m_pCylGpuPrim` (`CylinderGpuPrim`)、`m_bUseShader`、`renderShaderImpl` (`BallStickRenderer.cpp:32-33, 438`)。`display()` の末尾で 2 プリミティブを別ドローする。
- **`renderShaderImpl` は valence を扱わない** (`:438-555`)。全結合を**単一円柱**として `m_pCylGpuPrim->setData(i, pos1, pos2, bondw, devcode)` に積むだけ (bicolor は中点で 2 分割)。`getType()` / `DOUBLE` / `TRIPLE` を見ていない。
- valence コード (`drawVBondType1` の `getDblBondDir`, `:210-227`) は**即時描画経路 `rendBond` からのみ**呼ばれ、`display()` が `isFile() || m_nVBMode!=VBMODE_OFF` のときだけそこに入る (`:49-51`)。**通常のシェーダ描画では dead**。
- `CylinderGpuPrim::setData(i, pos1, pos2, bondw, devcode)` は 2 端点を受け取る。

**帰結**: BallStick の座標テクスチャ化は **valence 不要**。ボールは `SphereIdxGpuPrim` 再利用、スティックは `CylinderIdxGpuPrim` (2 端点 index) で、CPK の自然な拡張になる。

### 3.5 `SimpleRenderer` — シェーダ経路の valence が live・参照は ind_d 方式

- シェーダ経路 `renderShaderImpl` (`SimpleRendererGLSL.cpp:49`) が **valence を実描画**する。`m_bValBond` (既定 `true`, `SimpleRenderer.cpp:29`) + `getDblBondDir` で二重/三重の平行線を描く (`SimpleRendererGLSL.cpp:76-138`)。`m_lineGpuPrim` を使う。
- `objectChanged` は既に `atomsMoved` で `m_lineGpuPrim.invalidate()` している (`:218-230`) が、これは「次 display で全再構築」であって direct update ではない。
- **参照実装 (dev201608) は valence をアニメ正確に実装していた**。`dblbon_vert.glsl` が `a_ind` = ivec3 (ind1, ind2, **ind_d**) を受け取り、`getNormalVec(pos1, pos2, posd)` で**シェーダ内**にオフセット方向を計算する (3 点とも texture から fetch するので分子が動いても方向が追従)。専用シェーダ `gpu_dblbonrend` + 専用 VBO (`SimpleRendGLSL.cpp:138, 399-432`)。主経路は `DRAW_LINES` (GL_LINES, `:320, 416`)。`simple_vertex.glsl` は `a_ind12` = ivec2 で、`ind2<0` を孤立原子アスター、`ind2>=0` を結合にエンコードしていた (`:28, 55-60`)。

**帰結**: SimpleRenderer だけが concern 2 (二重結合オフセット) を持つ。参照の ind_d 方式が移植の下敷きになる。ただし GL_LINES 前提なので、幅 quad 展開 (§3.1) と合体させる必要がある。

### 3.6 結合・アスターは AID→テクセル index マップが要る

CPK は「`AtomIterator` の列挙順 i = テクセル index」で済んだ (Phase 1 §3.4)。だが Selection/Simple の**結合**、BallStick の**円柱**は原子を AID で参照して列挙するため、「列挙順 = index」が成立しない。アスターも AID 参照。したがって **`AID → テクセル index` のマップ**が要る (参照実装の `SimpleRendGLSL` の `m_sels` に相当)。

---

## 4. 設計方針 (確定事項)

以下は設計議論の結果、確定した決定である。実装時に再検討しないこと。異論があれば実装を止めて相談。

### 4.1 shader はプリミティブ単位。複合レンダラに統合シェーダを作らない

Phase 1 plan §8.3 の方針を踏襲。BallStick のように複数プリミティブを複合するレンダラは、**統合シェーダを書かず、各プリミティブの index 版を再利用し、1 枚の共有座標テクスチャを bind する**。理由:

- 現 BallStick も既に球・円柱の 2 シェーダ・2 ドローで、統合シェーダを持たない
- 球 (ビルボード quad) と円柱 (円柱インポスタ) は頂点レイアウトも frag レイキャストも別物で、統合すると per-vertex type 分岐 + union レイアウトが必要になり複雑化するだけ。GPU はどのみち別ドロー
- 統合シェーダにすると CPK が同じ球シェーダを再利用できなくなる

### 4.2 `gfx::LineIdxGpuPrim` = 「index + 静的オフセット」を持つ汎用幅線プリミティブ

`LineGpuPrim` を雛形に、真のインスタンシング (`setNumInstances` + `DRAW_TRIANGLES`) を踏襲。**各端点を「テクセル index + model 空間の静的オフセット」で表す**。`LineGpuPrim` の `a_vertex1` / `a_vertex2` (vec4) をそのまま再利用し、**`xyz = offset`, `w = index`** にパッキングする (属性レイアウトを最小限しか変えない)。

シェーダ (body 分割、§4.7): `pos = getAtomPos3(coordTex, int(a_p1.w)) + a_p1.xyz;` を端点ごとに行い、その後 `linew2_vert.glsl` と同じスクリーン空間幅 quad 展開 + bicolor。これで以下が同一プリミティブ・同一シェーダで表せる:

| 描くもの | 端点データ (index, offset) |
|---|---|
| 結合線 | `(idx1, 0)`, `(idx2, 0)` |
| 孤立原子アスター | 3 本線、全端点が**同じ idx**: `(idx, -X·r),(idx, +X·r)` / Y / Z |
| 二重結合の静的オフセット版 (§4.6 の fallback) | `(idx1, dvd·s),(idx2, dvd·s)` |

**アスターが特別扱い不要な理由**: `drawAster` のオフセットは model 空間の軸固定・静的なので、原子がアニメで動いても十字マーカーは軸固定サイズで追従する。シェーダ内計算も stale も無い。参照実装は負 index の符号トリック + シェーダ内方向テーブルでアスターを分岐処理していたが、**「index + 静的オフセット」ならオフセットは単なるデータ**で、シェーダは分岐なしの汎用のまま (参照より綺麗)。

### 4.3 `gfx::CylinderIdxGpuPrim` = 2 端点 index の円柱。ボールは SphereIdxGpuPrim 再利用

`CylinderGpuPrim` を雛形に、`setData(i, idx1, idx2, radius, devcode)` で 2 端点 index を積む。シェーダで `pos1 = getAtomPos3(idx1); pos2 = getAtomPos3(idx2);` を fetch し、既存の円柱インポスタ展開に流す。bicolor は現 BallStick と同じく中点 2 分割 (2 インスタンス) でよい。offset は Phase 3 の BallStick では不要 (単一円柱のみ) なので持たせない。

BallStick のボールは Phase 1 の `SphereIdxGpuPrim` を**そのまま再利用**。

### 4.4 座標テクスチャは「レンダラごとに 1 枚」所有し、レンダラ内の複数プリミティブで共有する

- 1 レンダラ内 (BallStick の球+円柱、Selection の結合+アスター) は**同じ 1 枚**を共有する。レンダラがテクスチャを所有し、各プリミティブに `setCoordTex(tex, unit)` で渡す (2 回アップロードしない)。
- **レンダラ間の共有はしない**。1 分子に CPK と BallStick が付けば座標を 2 枚持つ (Phase 1 と同じ割り切り)。これを 1 枚に集約するのは Phase 2 (`AnimMol` が所有権を持つ、Phase 1 plan §8.4)。Phase 3 では per-renderer 所有を維持し、複雑化しない。

### 4.5 `AID→テクセル index` マップをレンダラが持つ

レンダラが `renderCoordTexImpl` で「テクセル layout に載せる原子リスト (= `m_aidcache`)」と「`AID → index` の逆引きマップ (`std::unordered_map<int,int>` 等)」を構築する。結合/円柱/アスターはこのマップで各原子の index を引く。Phase 2 で `AnimMol::getCrdArrayInd(aid)` が入れば、このマップは不要になる (インターフェースは変えない)。

### 4.6 SimpleRenderer の二重結合: ind_d 方式をシェーダ内計算 + ビュー向きフォールバックで実装

**採用 (実装済み)**: 変位方向を頂点シェーダ (`linevalidx_vert.glsl` の `calcDispDir`) で毎フレーム計算する。焼き込み (v1) は不採用。

- **決定可能なケース**: 参照原子 (distal) の index を `a_val.w` で渡し、シェーダで `d = v2 - ebond·(ebond·v2)` の**面内垂線**を求める。分子が動いても方向が原子に追従する。参照原子が座標テクスチャに無い (選択外) 場合は index を `-1` としてフォールバックへ。
- **決定不能なケース (三重結合の共線・孤立二重結合)**: **ビュー向き垂線**を使う。eye 空間で結合軸に垂直な screen 面内ベクトルを作り `inverse(mat3(MV))` で model 空間へ戻す。旧 `getDblBondDir` の world 固定 `(1,0,0)` を廃止し、常にカメラに開く。
- **決定/不決定の判定**: 距離でなく比率 `length(d) > 0.15·|v2|` (軸から約 8.6° 以上)。わずかに曲がった実アルキンもノイズに乏しい微小垂線を避けて確実にフォールバックへ。
- **符号非依存**: 二重/三重結合は `±m_dCvScl` で軸対称に描くので、垂線の符号 (どちら向きか) は見た目に無関係。合わせるべきは面 (軸) だけ。これにより旧 `getDblBondDir` の quirky な nv1/nv2 選択を完全再現する必要が無い。
- **`MolBond::getDblBondRefAtom`**: 旧 `getDistalAtomID` は **id1 側限定**で、末端側が id1 のとき参照原子を取れず `(1,0,0)` に落ちていた。新ヘルパは id1→id2 の順で重原子隣接を探すので、末端二重結合 (例: C=O) でも参照原子を拾える。

### 4.7 シェーダ body 分割 (Phase 1 の sphere2 と同型)

`linew2_vert.glsl` と円柱シェーダを、Phase 1 の `sphere2_body_vert.glsl` と同じく **共通 body + `#define USE_COORD_TEX` 違いの薄いラッパ 2 ファイル**に分割する。direct 版は `a_vertex1/2` をそのまま、idx 版は `a_p1/2` を `getAtomPos3(int(.w)) + .xyz` で解決。`SHADER_DEPS` / `SHADER_INCLUDE_DIRS` の追記は Phase 1 と同じ手順。実ファイル名 (`linew2_vert.glsl` vs 生成物 `linew_vert.glsl`) は実装時に確認する。

### 4.8 `SelectionRenderer` の `MODE_POINT` はレガシー維持

点スプライト描画は線プリミティブで表せない。当面 `MODE_POINT` はレガシー経路 (即時描画→display-list) のまま残す。将来 `PointIdxGpuPrim` を作るのは別課題。`MODE_STICK` (既定・主用途) を `LineIdxGpuPrim` で direct update 化する。

### 4.9 `BallStickRenderer` の dead valence コードは触らない

`drawVBondType1` / `getDblBondDir` 経路は `isFile() || VBMODE!=OFF` のときだけ生きている。座標テクスチャ化では移植不要。POV-Ray 等のファイル出力経路がまだ使う可能性があるので**削除もしない** (触らない)。

---

## 5. 成果物サマリ

sub-phase ごとに区切って実装・検証・コミットする (Phase 1 と同じく、各段でビルドと目視/性能を確認)。

### Phase 3a: `LineIdxGpuPrim` + シェーダ + SelectionRenderer (MODE_STICK)

| 層 | ファイル | 種別 |
|---|---|---|
| gfx prim | `src/gfx/LineIdxGpuPrim.hpp` / `.cpp` | 新規 |
| gfx build | `src/gfx/CMakeLists.txt` | 変更 |
| shader | 線 body (`linew2_body_vert.glsl` 等) + direct/idx ラッパ | 新規/変更 |
| shader build | `src/gfx/CMakeLists.txt` or 該当 GLSL_SHADER_FILES | 変更 |
| renderer | `src/modules/molstr/SelectionRenderer.hpp` / `.cpp` | 変更 (renderCoordTexImpl/updateCoordTex/objectChanged/display + AID map) |

### Phase 3b: TraceRenderer

| 層 | ファイル | 種別 |
|---|---|---|
| renderer | `src/modules/molstr/TraceRenderer.hpp` / `.cpp` | 変更 (LineIdxGpuPrim 再利用) |

### Phase 3c: `CylinderIdxGpuPrim` + BallStickRenderer

| 層 | ファイル | 種別 |
|---|---|---|
| gfx prim | `src/gfx/CylinderIdxGpuPrim.hpp` / `.cpp` | 新規 |
| gfx build | `src/gfx/CMakeLists.txt` | 変更 |
| shader | 円柱 body + direct/idx ラッパ | 新規/変更 |
| renderer | `src/modules/molvis/BallStickRenderer.hpp` / `.cpp` | 変更 (球=SphereIdxGpuPrim 再利用, 円柱=CylinderIdxGpuPrim, 共有テクスチャ, AID map) |

### Phase 3d: SimpleRenderer (最難関) — 実装済み (commit `0ec02d49`)

§4.6 の v1 静的オフセットではなく、**シェーダ内で変位方向を計算する ind_d 版 + ビュー向きフォールバック**を採用した (下記 §4.6 参照)。valence 平行線を含めて `LineValIdxGpuPrim` 1 本に集約。

| 層 | ファイル | 種別 |
|---|---|---|
| gfx prim | `src/gfx/LineValIdxGpuPrim.hpp` / `.cpp` | 新規 (parametric endpoint + shared 垂線変位) |
| shader | `src/sysdep/ogl_core/linevalidx_vert.glsl` | 新規 (idx 専用, `linew_inc.glsl` 再利用) |
| gfx/shader build | `src/gfx/CMakeLists.txt` / `src/sysdep/CMakeLists.txt` | 変更 |
| core | `MolBond::getDblBondRefAtom` | 新規 (id1→id2 の順で参照原子 index を返す) |
| renderer | `src/modules/molstr/SimpleRenderer*.cpp` / `.hpp` | 変更 (LineValIdxGpuPrim + valence + coord tex 4 点セット) |

**変更しないファイル (重要)**: `MolCoord.*`, `MolAtom.*`, `MorphMol.*`, `AnimMgr.*`, `SphereGpuPrim.*`, `LineGpuPrim.*` (direct 版として残す), `CylinderGpuPrim.*`, `EcBufferRep.*`, Phase 1 の `FloatDataTexture` / `SphereIdxGpuPrim` (再利用のみ)。

---

## 6. 実装手順

Phase 1 の `CPK2Renderer` の実装 (`renderCoordTexImpl` / `updateCoordTex` / `objectChanged` / `display` の 4 点セット + フォールバック) を各レンダラの雛形にする。

### Step 3a-1: `gfx::LineIdxGpuPrim`

`LineGpuPrim` を雛形に新規作成 (§4.2)。per-instance に `a_p1` / `a_p2` (vec4, xyz=offset/w=index) + `a_color1` / `a_color2`。`init()` で idx 版線シェーダをロード、`alloc(pDC, nlines)`、`setData(i, idx1, off1, idx2, off2, col1, col2)`、`setCoordTex(tex, unit)`、`draw()` で coordTex bind + `u_coordTex` uniform。`invalidate()` / `isValid()` / `getSize()`。

### Step 3a-2: 線シェーダの body 分割 (§4.7)

`linew2_vert.glsl` を body + direct/idx ラッパに分割。idx 版は `#include <lib_atoms.glsl>` して端点を `getAtomPos3(int(a_p1.w)) + a_p1.xyz` で解決、その後既存の幅 quad 展開へ。**確認**: `processed_shaders/` に direct 版 (`a_vertex1`) と idx 版 (`u_coordTex` / `texelFetch`) が正しく展開されること。

### Step 3a-3: `SelectionRenderer` の direct update 化

1. `SelectionRenderer.hpp` に `m_lineIdxGpuPrim` / `m_pCoordTex` / `m_coordbuf` / `m_aidcache` / `m_aid2idx` / dirty フラグを追加 (CPK と同型 + AID map)。
2. `renderCoordTexImpl(pdc)`: `AtomIterator` で描画対象原子を列挙し `m_aidcache` / `m_aid2idx` を構築、座標テクスチャに書く。結合 (`BondIterator`) は `m_aid2idx` で index を引いて `setData(i, idx1, 0, idx2, 0, m_color, m_color)`。孤立原子 (非結合) は `drawAster` 相当を 3 本の instance として `setData` (同一 idx + ±軸オフセット)。`createFloatDataTexture()` が `nullptr` ならフォールバック。
3. `updateCoordTex()`: `m_aidcache` の座標だけ再収集して `texSubImage2D`。
4. `objectChanged()`: `atomsMoved` でダーティ + `setUpdateFlag()` + `invalidateHittestCache()`。GL を叩かない。
5. `display()`: `MODE_STICK` かつ座標テクスチャ経路が使えるときに idx 経路、ダーティなら `updateCoordTex()` 1 回 → ドロー。`MODE_POINT` と `isFile()` は従来経路。
6. **tritium で検証**: Phase 1 のテストシーンで再生し、SelectionRenderer 由来の再構築が消えること (§7)。

### Step 3b: `TraceRenderer`

`LineIdxGpuPrim` を再利用。残基 (CA) を列挙して `m_aidcache` / `m_aid2idx` を作り、連続 CA を `setData(i, idxA, 0, idxB, 0, ...)` で結ぶ。valence なしなので Selection より単純。

### Step 3c: `CylinderIdxGpuPrim` + `BallStickRenderer`

1. `CylinderIdxGpuPrim` を `CylinderGpuPrim` 雛形に新規 (§4.3)。円柱シェーダも body 分割。
2. `BallStickRenderer` の `renderShaderImpl` を idx 版に:ボールは `SphereIdxGpuPrim` (Phase 1 の `setData(i, idx, rad, devcode)`)、円柱は `CylinderIdxGpuPrim` (`setData(i, idx1, idx2, bondw, devcode)`)。**1 枚の座標テクスチャを両プリミティブに `setCoordTex`** (§4.4)。`updateCoordTex` は 1 枚を更新。
3. valence は無視 (現 `renderShaderImpl` と同じ、§3.4)。dead コードは触らない。

### Step 3d: `SimpleRenderer` (実装済み)

`LineIdxGpuPrim` ではなく専用の `LineValIdxGpuPrim` を新設し、単結合・二色結合 (mix による中点)・孤立原子アスター・二重/三重結合の平行線をすべて 1 プリミティブ・1 シェーダに集約した。二色中点は静的オフセットでなく `mix(p1,p2,0.5)` でアニメ正確。valence 変位方向は §4.6 のシェーダ内計算 (ind_d + ビュー向きフォールバック) で最初から実装。`display`/`objectChanged`/`invalidateDisplayCache`/`renderCoordTexImpl`/`updateCoordTex` は CPK/Selection と同型の 4 点セット。coord tex 利用不可時は既存 `LineGpuPrim`→legacy にフォールバック。

---

## 7. 受け入れ条件と検証

各 sub-phase で以下を確認する (Phase 1 §7 と同じ枠組み)。

1. 対象レンダラ**単独**のシーンで、変更前後の描画が視覚的に同一 (色・線幅・アスター・二重結合・シルエット)
2. 再生中に `renderCoordTexImpl()` が再実行されない (ログで確認)
3. 座標テクスチャ経路が使えない状況で従来 GpuPrim / 従来経路にフォールバックして正常描画
4. `pdc->isFile()` (レイトレース/ファイル出力) が従来どおり
5. `MolCoord` / `MolAtom` / `MorphMol` / `AnimMgr` / `LineGpuPrim` / `CylinderGpuPrim` / `SphereGpuPrim` / `SphereIdxGpuPrim` に破壊的変更が無いこと (`git diff --stat`)
6. `objectChanged()` から GL 呼び出しが発生しないこと (アップロードは `display()` に遅延)
7. tritium: `pnpm test` の `gfxManagerContract.test.ts` が通ること (peer API を追加した場合)
8. native (Oc 系): `task build_libcuemol2` が通ること (目視はしない)

**性能検証** (Phase 1 §7.4 と同じ): tritium (Release) で `perf.ts` の `PERF_MEASURE=true`。特に **Phase 3a 完了で、Phase 1 のテストシーン (`animtest_molmorph3_frame_cpk.qsc`) の SelectionRenderer 再構築が消え、selection on/off の差が縮まること**を確認する (Phase 1 では床として残っていた)。

---

## 8. 範囲外 / 既知の制限

1. **`SelectionRenderer` の `MODE_POINT`**: 点スプライトはレガシー維持。将来 `PointIdxGpuPrim` (§4.8)。
2. **レンダラ間の座標テクスチャ共有**: Phase 3 は per-renderer 所有。1 分子に複数レンダラが付くと座標が複数枚。集約は Phase 2 (`AnimMol`, Phase 1 plan §8.4)。
3. **`BallStickRenderer` の dead valence**: 移植も削除もしない (§4.9)。
4. **SimpleRenderer の二重結合方向**: シェーダ内計算 (ind_d + ビュー向きフォールバック) で実装済み・アニメ追従。決定可能ケースの参照原子選択は旧 `getDblBondDir` の nv1/nv2 分岐を厳密再現していない (軸対称描画のため見た目は同等)。
5. **AID→index マップのコスト**: `unordered_map` の構築は `renderCoordTexImpl` 時のみ (毎フレームではない)。Phase 2 の `AnimMol::getCrdArrayInd` で不要化。
6. **トポロジ変化の検知**: Phase 1 と同じく `updateCoordTex` は `m_aidcache` の AID で引き直すので、原子削除は `getAtom()` null → 全再構築フォールバック。原子入れ替えは非検知 (`atomsMoved` は座標のみの意味なので実用上問題なし)。

---

## 9. 参照

### 本リポジトリ (develop)

- `docs/plans/260717-cpk-coord-texture-direct-update-plan.md` — Phase 1 plan (基盤・設計方針・rAF/GL タイミング)
- Phase 1 実装 (PR #441 / `8fc30dd0`): `src/gfx/FloatDataTexture.hpp`, `src/gfx/SphereIdxGpuPrim.*`, `src/sysdep/ogl_core/lib_atoms.glsl`, `sphere2_body_vert.glsl`, `CPK2Renderer.*`
- `src/gfx/LineGpuPrim.cpp` — 幅付き線の真インスタンシング + `linew2_vert.glsl` 展開 (Line プリミティブの雛形)
- `src/gfx/CylinderGpuPrim.*` — 円柱の雛形
- `src/gfx/DisplayList.cpp:302` — 即時描画→LineGpuPrim コンパイル
- `src/modules/molstr/SelectionRenderer.cpp` / `TraceRenderer.cpp`, `src/modules/molvis/BallStickRenderer.cpp`, `src/modules/molstr/SimpleRendererGLSL.cpp` — 各対象レンダラの現状
- `tritium/CLAUDE.md` — Worker 内 rAF / GL 規約 (Phase 1 で追記)

### 参照実装 (`/Users/user1/proj64/cuemol2_png`, dev201608)

- `src/modules/molstr/SimpleRendGLSL.{hpp,cpp}`, `simple_vertex.glsl` — 座標テクスチャ線経路 (GL_LINES, `a_ind12` の符号でアスター/結合を分岐)
- `src/modules/molstr/dblbon_vert.glsl` — 二重結合の ind_d 方式 (`getNormalVec` でシェーダ内垂線、アニメ正確)
- `src/modules/molstr/lib_atoms.glsl` — 元の fetch ヘルパ (Phase 1 で移植済み)
