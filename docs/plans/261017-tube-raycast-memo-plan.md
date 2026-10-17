# tube / ribbon / cartoon の GPU raycast (設計メモ)

**未実装 / 検討メモ。** mesh 方式 (`../architecture/tube-gpu-mesh.md`) の先にある選択肢として残す。

## 背景: dev201608 の GLSLRcTubeRenderer

`origin/dev201608` の `src/modules/molvis/rctube_vert.glsl` / `rctube_frag.glsl`。

- パラメトリック曲面 x(s,t) を screen 空間で逆写像する方式。VBO は `a_rho = (s,t)` だけで、
  vertex shader が係数 texture から少し膨らませた proxy mesh を組み立てる
- fragment shader は補間された `v_st` を初期値に、「x(s,t) の投影 xy = fragment の xy」を
  2 変数 Newton 法 (最大 5 反復) で解き、収束しなければ discard、収束すれば `gl_FragDepth` を書く
- 座標更新は係数 texture の upload だけ。2016 年の GPU で実用的な速度が出ていた

**実用化できなかった理由**: 末端を閉じる処理 (cap)、SSE ごとに違う断面、JctTable による断面の
滑らかな補間 (矢印頭の段差を含む) を表現できなかった。また矩形断面では角で Jacobian が不連続になり、
silhouette 付近では特異になるため、Newton 法が安定に収束しない。

## 案: 掃引パラメータ s についての 1 次元求根 + 断面 SDF

1. 各 s で、軸上の点 f(s) を通り接線 T(s) に垂直な断面平面と ray の交点 p(s) を閉じた式で求める
2. p(s) を局所 frame (e1(s), e2(s)) で 2D 座標 (u, v) に写す
3. g(s) = SDF_section(u, v; 断面パラメータ(s)) の根を探す。区間内でサンプルして符号変化を挟み込み、
   bisection / secant で絞り込む。複数の根があれば ray 上で最も手前を取る

| 当時の問題 | この案での扱い |
|---|---|
| 矩形・角のある断面 | 2D SDF (`sdBox`、rounded box など) は角があっても正確。1 変数の挟み込みなので t の跳びや Jacobian の不連続と無関係 |
| SSE ごとの断面 | s ごとの断面パラメータを texture で渡す |
| JctTable の補間 | 2 つの SDF の mix、またはパラメータの補間 (escl 表を幅関数として texture に置く) |
| 矢印頭の段差 / flat cap | 既知の s0 での平面テスト |
| 球状 cap | 球・楕円体の impostor を併用 |
| 法線 | 2D SDF の勾配を 3D に戻し、∂s*/∂p の寄与を足す (解析的) |

**残る問題**: 断面平面どうしの交差 (fold。曲率半径 < 断面の大きさ)、cartoon の parallel transport
frame は CPU で spline 化して渡す必要、`RibbonRenderer::setupHelper` の frame は接線に直交化していない、
`gl_FragDepth` による early-Z の喪失と overdraw、edge / silhouette 線と半透明の作り直し、ファイル出力には mesh が残る。

## 文献 (abstract・引用レベルで確認)

- Bronsvoort & Klok 1985, "Ray tracing generalized cylinders", ACM TOG 4(4): ray との交差を 2D 曲線と
  輪郭の交差に帰着させ、subdivision で解く。この案の原型
- de Voogt, van der Helm, Bronsvoort 2000, "Ray tracing deformed generalized cylinders", The Visual Computer:
  軌道に沿って輪郭が変化する場合への拡張
- Purdue tech report 1993 (generalized cylinders with space-curve axis): sweeping rule が可逆であることが前提 (fold の制約)
- Reshetov & Luebke 2018, "Phantom Ray-Hair Intersector": 円断面の掃引体を GPU で反復計算。ray と三角形の交差の
  約 2/3 の速度。高曲率では曲線の分割が必要
- Han et al. 2019, "Ray Tracing Generalized Tube Primitives": 半径が変化する tube を球・円錐台の連結で扱う
- Reshetov 2022, "Ray/Ribbon Intersections": 平たい面を bilinear patch として 2 次方程式で解析的に解く
- Tex-Mol (Bajaj 2004) は helix の impostor、Krone et al. 2008 は geometry shader による mesh。
  cartoon 全体を raycast した実用例は少ない

**未検証**: 断面が非円形で、しかも変化する形状を fragment shader で raycast した前例は見つからなかった。

## 推奨構成と進め方

- 円断面の部分は Phantom 型 (または円錐台の連結)、平たい面は bilinear patch による解析解、段差と cap は平面テスト。
  部品ごとに文献のある手法を当てる
- GPU に載せる前に CPU だけの小さな ray caster で、g(s) の求根の安定性と fold の挙動を確かめる
- mesh 方式の spline 係数と `atomsMoved` で係数だけを更新する経路は流用できる。mesh 経路はファイル出力と fallback 用に残る
