# tube 系 renderer の GPU mesh 化 (残り)

tube / ribbon / cartoon / nucl は `TubeMeshBuilder` + `TubeGpuSupport` で display list を経由せずに
`TrigGpuPrim` を直接構築し、座標 (`atomsMoved`) と色 (coloring の変更) の変化を VBO の
in-place 書き換えで反映するようになった。仕様は `../architecture/tube-gpu-mesh.md`。

ここには未実装の項目だけを置く。

## 1. spline 係数の in-place 再生成 (計測次第)

座標更新のたびに `SplineCoeffSet` を `cleanup()` -> `generate()` している。trajectory 再生で
これがボトルネックになるなら、サイズを保ったまま係数だけ再計算する経路を足す。

## 2. VBO 転送量のさらなる削減 (4b / 4c、計測次第)

- 4b: TrigGpuPrim の VBO を「位置 | 法線 | 色 | hit name」の塊に並べ、変わった塊だけ `bufferSubData` の範囲指定で送る
  (`AbstDrawAttrs` に属性ごとの stride、`AbstDrawElem` に更新範囲)。座標の更新で 1 頂点 32 B -> 24 B
- 4c: 法線を INT_2_10_10_10_REV (4 B) に詰める (shader は `vec4 aNormal` の `.xyz` なので変更不要)。4b と合わせて 16 B

## 3. 再生中だけ詳細度を落とす (4d、方針判断が要る)

trajectory / morph の再生中だけ断面と軸方向の分割を粗くし、止まったら元の細かさで作り直す。頂点数そのものが減るが
見た目が変わるので、入れるかどうかは方針として決める。

## 4. 将来案

- 残基ごとの色 texture: [261017-tube-color-texture-plan.md](261017-tube-color-texture-plan.md)
- GPU raycast (impostor): [261017-tube-raycast-memo-plan.md](261017-tube-raycast-memo-plan.md)
