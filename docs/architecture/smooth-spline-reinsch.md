# cartoon の平滑化 spline (Reinsch 法)

`Ribbon2Renderer` (cartoon) は helix / sheet / coil の軸、helix 幅、binormal を
`molvis::SmoothSpline` / `SmoothSpline1D` (`src/modules/molvis/smospl/`) で平滑化する。
係数の計算は `ReinschSpline` (Reinsch 法、O(n)) で行い、alglib の
`spline1dfitpenalizedw()` (密な正規方程式、O(n^3)) と丸め誤差の範囲で同じ曲線を返す。
alglib の経路は `generateAlglib()` として残っており、Reinsch で再現できない入力の fallback と、
テストの参照実装を兼ねる。

## 解いている問題

パラメータは残基番号 `t_i = t0 + i` (等間隔、h = 1)。重み w_i (`setUseWeight(true)` のとき
`Vector4D::w()`、それ以外は 1) と λ について

    minimize  sum{ w_i^2 (y_i - f(t_i))^2 } + lambda * integral{ f''(t)^2 dt }

の解は、データ点を knot とする自然 3 次 spline。Reinsch 法では、knot 上の値 g と 2 階微分 γ について
`(R + lambda Q^T W^-2 Q) gamma = Q^T y`, `g = y - lambda W^-2 Q gamma` を解く (5 重対角、LDL^T)。
x / y / z は同じ行列を共有するので、分解は 1 回で済む。

## λ の決め方 (alglib と一致させる要点)

alglib はユーザーの rho をそのまま使わず、`pdecay = 10^rho * fdmax / admax` と正規化する
(rho は ±(-log10 eps) ≒ ±15.65 に clamp)。基底の数 M が点の数 N と等しいとき、knot がデータ点の上に
来るので:

- `fdmax` (重み付き基底行列の列ノルム^2 の最大) = `max_i w_i^2`
- `admax` (罰則行列の対角の最大) = `max_i K_ii`、`K = Q R^-1 Q^T`

alglib は t を [-1, 1] に縮めて計算するが、その係数 ((N-1)/2)^3 は pdecay と admax の両方に掛かって
打ち消すので、h = 1 のまま

    lambda = 10^rho * max_i w_i^2 / max_i K_ii

となる。`K_ii` は R^-1 の帯 (対角と 2 本の副対角) だけで決まり、LDL^T からの逆行列漸化式で O(n) に
求める。y を平均と標準偏差で正規化する処理は解が y に線形なので結果に影響しない。alglib が
Cholesky の安定化に足す Tikhonov 項 (相対 1e-15 程度) は再現していない。

λ を簡略化 (例えば `10^rho` をそのまま使う) すると segment の長さごとに滑らかさが変わり、coil が
Cα の近くを通るか大回りするかが変わる。テスト `SmoothSpline.ReinschMatchesAlglibFit` は λ を 2 倍に
しただけで 0.1-0.9 Å のずれとして検出する。

## 出力の形

alglib の補間子と同じ node 配置にしている: データの n 個の knot に加え、両端の外側に 1 区間ずつ
端の傾きでの線形延長を持つ n + 2 node (n + 1 区間)。`interpolate()` と `rewriteCoeff()`
(fix start/end が触る区間番号 1 と n_nodes - 2) は、この配置を前提にしている。

## alglib に fallback する入力

| 条件 | 理由 |
|---|---|
| `SmoothSpline` で n < 4、`SmoothSpline1D` で n < 10 | alglib の基底数が `max(4, n)` / `max(10, n)` で、M > N だと knot がデータ点からずれ、別の問題になる |
| 重みに 0 以下を含む | Reinsch の式が W^-2 を使う |
| LDL^T の pivot が正でない | 数値的に破綻した入力 |

## 効果

4V6X の cartoon 構築が約 31 秒から約 0.5 秒、1AON は約 0.36 秒から約 0.22 秒になった
(`show cartoon` から png 書き出しまで、CLI と書き出しの固定分を引いた概算)。1UBQ / 1AKE / 1AON /
4V6X の描画結果は旧実装とピクセル単位で一致した。
