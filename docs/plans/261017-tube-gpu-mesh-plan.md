# tube 系 renderer の GPU mesh 化 (残り)

tube / ribbon / cartoon は `TubeMeshBuilder` + `TubeGpuSupport` で display list を経由せずに
`TrigGpuPrim` を直接構築し、座標 (`atomsMoved`) と色 (coloring の変更) の変化を VBO の
in-place 書き換えで反映するようになった。仕様は `../architecture/tube-gpu-mesh.md`。

ここには未実装の項目だけを置く。

## 1. spline 係数の in-place 再生成 (計測次第)

座標更新のたびに `SplineCoeffSet` を `cleanup()` -> `generate()` している。trajectory 再生で
これがボトルネックになるなら、サイズを保ったまま係数だけ再計算する経路を足す。

## 2. NARenderer

base pair・糖・埋め込みの ball & stick を同じ `pdl` に描くので、`tgIsEnabled()` を false にして
display list 経路のまま残している。GPU 化するならそれらを別の prim に分ける必要がある。

## 3. 将来案

- 残基ごとの色 texture: [261017-tube-color-texture-plan.md](261017-tube-color-texture-plan.md)
- GPU raycast (impostor): [261017-tube-raycast-memo-plan.md](261017-tube-raycast-memo-plan.md)
