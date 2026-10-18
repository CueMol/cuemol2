# cartoon の平滑化 spline (Reinsch 法)

`Ribbon2Renderer` (cartoon) は helix / sheet / coil の軸、helix 幅、binormal を
`molvis::SmoothSpline` / `SmoothSpline1D` (`src/modules/molvis/smospl/`) で平滑化する。
係数は 2 つの自前実装で計算する。外部ライブラリには依存しない。

- `ReinschSpline`: Reinsch 法 (5 重対角、O(n))。長い segment を受け持つ。
- `PenalizedSpline`: 基底数 M の密な正規方程式 (O(M^3))。短い segment と、Reinsch で扱えない入力を受け持つ。
  `generateDense()` からも呼べ、テストでは Reinsch 側の参照実装になる。

どちらも以前使っていた ALGLIB の `spline1dfitpenalizedw()` (GPL のため削除済み) と同じ問題・同じ
正規化を解く。結果は ALGLIB と丸め誤差の範囲で一致し、1UBQ / 1AKE / 1AON / 4V6X の cartoon は
ALGLIB 版とピクセル単位で同じ描画になる。

## 解いている問題

パラメータは残基番号 `t_i = t0 + i` (等間隔、h = 1)。重み w_i (`setUseWeight(true)` のとき
`Vector4D::w()`、それ以外は 1) について

    minimize  sum{ w_i^2 (y_i - f(t_i))^2 } + lambda * integral{ f''(t)^2 dt }

を、区間 [t_0, t_{n-1}] 上の M 個の等間隔 knot を持つ自然 3 次 spline の中で解く。M は
`SmoothSpline` で `max(4, n)`、`SmoothSpline1D` で `max(10, n)`。

| 経路 | 条件 | 方法 |
|---|---|---|
| Reinsch | M = n (3D は n >= 4、1D は n >= 10)、重みに 0 を含まない | knot がデータ点の上に来るので、問題は古典的な平滑化 spline になる。値 g と 2 階微分 γ について `(R + lambda Q^T W^-2 Q) gamma = Q^T y`, `g = y - lambda W^-2 Q gamma` を LDL^T で解く。x / y / z は分解を共有する |
| dense | それ以外 (短い segment、重み 0) | 基底値行列 F、罰則行列 A を作り、`F^T W^2 F + pdecay A + tdecay I` を Cholesky で解く (ALGLIB と同じ手順) |

重みは 2 乗でしか効かないので、負の重みは正と同じに扱う。重みが全部 0 だと正規行列が正定値でなくなり、
`generate()` は false を返す (ALGLIB 版は失敗コードを見ずに空の結果を読んでいた)。

## λ の決め方

ユーザーの rho はそのまま使わず、`pdecay = 10^rho * fdmax / admax` と正規化する (rho は
±(-log10 eps) ≒ ±15.65 に clamp)。dense 経路は t を [-1, 1]、y を [平均, 平均+標準偏差] → [0, 1]
にスケールし、重みを max|w| で割ってから、fdmax (重み付き基底行列の列ノルム^2 の最大) と admax
(罰則行列の対角の最大) を求める。

Reinsch 経路は同じ λ を閉じた式で出す。knot がデータ点の上にあると fdmax = max w_i^2 (重みを
max|w| で割った後なら 1)、admax = max diag(K)、`K = Q R^-1 Q^T` になる。t のスケールの係数
((n-1)/2)^3 は pdecay と admax の両方に掛かって打ち消すので、h = 1 のまま

    lambda = 10^rho * max_i w_i^2 / max_i K_ii

となる。`K_ii` は R^-1 の帯 (対角と 2 本の副対角) だけで決まり、LDL^T からの逆行列漸化式で O(n) に
求める。y のスケールは解が y に線形なので結果に影響しない。dense 経路が足す Tikhonov 項
(`tdecay`、相対 1e-15 程度) は Reinsch 経路では省いている。

λ を簡略化 (例えば `10^rho` をそのまま使う) すると segment の長さごとに滑らかさが変わり、coil が
Cα の近くを通るか大回りするかが変わる。テスト `SmoothSpline.ReinschMatchesDenseFit` は λ を 2 倍に
しただけで 0.1-0.9 Å のずれとして検出する。

## 出力の形

どちらの経路も同じ node 配置にしている: M 個の knot に加え、両端の外側に 1 区間ずつ端の傾きでの
線形延長を持つ M + 2 node (M + 1 区間)。`interpolate()` と `rewriteCoeff()` (fix start/end が触る
区間番号 1 と n_nodes - 2) は、この配置を前提にしている。

## 悪条件の入力

基底数が点数より多く (短い segment) かつ rho が非常に小さい場合 (coil の binormal spline は
rho = -10)、または重み 0 の点がある場合は、データで決まらない方向が tdecay だけで決まる悪条件の
問題になり、結果は丸め誤差に左右される。ALGLIB 版との差はこの領域でだけ出て、実際の coil binormal
(重みなし、n = 2, 3) で位置 3-4e-5 Å。n = 2 では厳密解 (2 点を通る直線) からのずれが ALGLIB 2.0e-5 Å、
dense 経路 8.8e-6 Å で、dense 経路の方が厳密解に近い。条件の良い短い segment の値は、ALGLIB の出力を
`ShortSegmentKeepsAlglibFit` テストに固定値として残している。

## 効果

4V6X の cartoon 構築が約 31 秒から約 0.5 秒、1AON は約 0.36 秒から約 0.22 秒になった
(`show cartoon` から png 書き出しまで、CLI と書き出しの固定分を引いた概算)。
