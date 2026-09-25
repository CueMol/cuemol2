# MolCoord の原子プールを std::map から vector へ置き換える (今後の課題)

状態: **未実装 / 今後の課題**。GRO 巨大系読み込みの高速化 (ブランチ `perf/gro-load`) の検討中に出た案。
今回は最小の変更 (索引 vector の併設) で止めており、本書の置き換えは着手していない。

## 現状 (perf/gro-load 時点)

`MolCoord::AtomPool` (`src/modules/molstr/MolCoord.hpp`) は `std::map<int, MolAtomPtr>` を public 継承し、
横に `std::vector<const MolAtomPtr *> m_index` を持つ。

- key は `put()` が 0 から連番で振る。削除後も key は再利用しない (`clear()` 後も同じ)
- `m_index[id]` は map の要素へのポインタで、削除した枠は null。`getAtom(id)` はこれで O(1)
- 原子の所有 (参照カウント) は map の値 `MolAtomPtr` が持つ
- `MolCoord::AtomIter` (`beginAtom()` / `endAtom()`) は map の const_iterator そのもの。
  テストを除いて約 40 箇所 (molstr 9 ファイル、mdtools `Trajectory.cpp` など) が
  `iter->first` (ID) / `iter->second` (原子) で ID 昇順に走査している
- `getAtomSize()` / `isEmpty()` は map の size / empty

## 案

map をやめて `std::vector<MolAtomPtr>` に所有させる。

- 生存原子数は別カウンタで持つ (`getAtomSize()` 用)
- `AtomIter` は null 枠を飛ばしながら `->first` / `->second` を返す自前の forward iterator にし、
  呼び出し側は書き換えない
- `put` / `remove` / `clear` の key 規則は現状のまま (連番、再利用しない)

## 見込み (推定、未計測)

- メモリ: map ノード分 (原子あたり約 50-60 bytes) が消える。a4tail (394 万原子, 読込ピーク約 4.19 GB) で
  約 200-250 MB (5-6%)
- 速度: 読み込み時の木への挿入とノードごとの malloc が消える。破棄も軽くなるが、破棄時間の大半は
  MolAtom 本体の解放と思われるので削減は一部

## 着手時に確認すること

- 約 40 箇所の `AtomIter` 利用を洗い出し、`(*iter).second` や map 固有の操作
  (find、iterator の比較以外の使い方) が無いか。あれば互換 iterator で足りるか
- `QdfMolWriter` (friend) が `m_atomPool` を直接触る箇所
- 大量削除後 (`loadsel` で水を除いた場合など) の走査: 全枠を舐めるため、394 万枠で 1 回数 ms の見込み。
  必要なら末尾の null 枠の切り詰めを検討 (途中の穴は ID を再利用しないため詰められない)
- 検証: GRO 読み込みのハッシュ (全原子の名前・残基・座標・元素、全残基の二次構造、結合数) が
  置き換え前と一致すること、`task run_gtest` 全件、読み込み時間とピークメモリの before/after
