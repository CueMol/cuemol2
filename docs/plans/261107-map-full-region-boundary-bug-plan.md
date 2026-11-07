# 地図の全体表示 (full) と分子の境界を併用すると mesh が消える不具合

地図の renderer で、表示範囲を全体 (`region_mode` が `full`。EM の地図の `auto` を含む) にしたまま分子の
境界 (`bndry_molname` / `bndry_sel` / `bndry_rng`) を設定すると、mesh が**全部**消える。表示範囲が box
(中心 +- extent、結晶の地図の `auto`) なら、境界の内側だけが正しく描かれる。

C++ (`src/modules/xtal/`) の不具合。ChX console の `volume zone` は境界を書くだけで表示範囲には触らない
(ChimeraX と同じ。下記「本来の動作」) ので、ChX 側では避けない: 避けると、不具合が見えなくなり、直った後にも
ChimeraX と違う動作が残る。

## 再現 (2026-11-07、ChX console)

```
open 1a0m; open 1a0m from eds
volume #2 region all                  # 全体: mesh が地図全体に出る (正しい)
volume zone #2 near #1:20 range 3     # mesh が全部消える (不具合)
volume unzone #2                      # 全体に戻る
```

box のまま (`region all` を打たずに) `volume zone #2 near #1:20 range 3` とすると、残基 20 の周り 3 A の
mesh だけが出る (正しい)。書き込まれた値は `props` で確かめた: `bndry_molname = 1a0m`、`bndry_sel = resi 20`、
`bndry_rng = 3`、`region_mode = full`。GUI の地図のパネルで全体表示と分子の境界を両方設定しても同じはず
(同じ property)。

## 本来の動作

表示範囲 (box / full) と境界は独立で、境界は「表示範囲の中で、原子から range 以内の部分だけを描く」制限。
full + 境界でも box + 境界でも、原子が表示範囲の中にあれば同じ mesh になる。ChimeraX の `volume zone` も
region を変えず (`minimalBounds true` のときだけ zone の箱まで縮める)、zone と `region all` の順番で見た目は
変わらない。CueMol の `MapRenderer::computeFullRegion` も、full のときは描く範囲を境界の箱 (原子の箱を
`bndry_rng` だけ広げたもの) に切り詰めるが、コメントのとおり効率のためで、見える結果は box と同じになる設計。

## 調べたこと

- full の経路: `MapMeshRenderer::generate` -> `generateFull` (`MapMeshRenderer.cpp` 405 行付近)。
  `computeFullRegion` (`MapRenderer.cpp` 356 行付近) が表示範囲を view の箱と境界の箱
  (`getBndryBBox`、`worldBoxToGrid` で絶対の格子番号) で切り詰め、`lodAlignRange` で step に揃え、
  格子点ごとに `inMolBndry` (map の中の番号を `convToOrth` で直交座標にし、境界の原子との距離を見る) で判定する。
- 静的に読んだ範囲では、絶対の格子番号 (`lo` / `hi`、`worldBoxToGrid`) と map の中の番号
  (`sp.start = rc.start - st`、`inMolBndry` -> `convToOrth` が start を足す) の使い分けに明らかな誤りは
  見つからなかった。境界の箱は `getBndryBBox` で range の分だけ広げてある。
- 境界の設定 (`setupMolBndry`) は `generate` の最初に呼ばれる。`computeFullRegion` は `generateFull` の中と
  view の refine の判定 (`MapRenderer.cpp` 463 行付近) からも呼ばれる。

## 次にやること

1. C++ にログを入れて、full + 境界のときの `computeFullRegion` の `lo` / `hi`、`lodAlignRange` の結果、
   `inMolBndry` が true になる格子点の数を見る (全部 false か、範囲が空か、描画の cache が古いままか)。
2. 原因を直し、`isosurf` (`MapSurfRenderer` の full の経路、`inMolBndry` を使う) も同じ条件で確かめる。
3. gtest に「full + 境界で、境界の内側の格子に mesh ができる」を 1 件足す (box + 境界と同じ結果になる)。
