# console PyMOL dialect の残り (後日の候補)

Status: **未着手 / 後日**。PyMOL dialect にまだ無いコマンドと、既存コマンドの改善の候補一覧。
着手するときは項目ごとに計画を起こす。実装済みの仕様は
[console PyMOL dialect](../architecture/console-pymol-dialect.md)。
関連: [調査報告](pymconsole-research-260529.md) §Tier 2。

判断の原則はこれまでと同じ: PyMOL と**意味が一致するものだけ**を移す。計算やアルゴリズムは TS に書かず、
既存の service か C++ (必要なら `MolCoord` などに機能として足し、GUI からも使えるようにする) に置く。

## 1. MD trajectory 系 (次の候補、後日)

調査報告の Tier 2 では「MD trajectory ブランチの統合待ち」で後回しにしたもの。mdtools
(`src/modules/mdtools/`、GUI は `plugins/mdtools/`) が develop に入ったので着手できる。
`count_states` は実装済み。

| PyMOL | 状況 | 見込み |
|---|---|---|
| `load_traj` | 未実装 | mdtools の開くフロー (`docs/architecture/md-trajectory-open-dialog.md`) の headless 版 |
| `intra_fit` | 未実装 | frame ごとの重ね合わせ。C++ 側に同等機能があるか要調査 |
| `smooth` | 未実装 | frame の移動平均。同上 |
| `split_states` / `join_states` | 未実装 | CueMol の trajectory / multi-model の持ち方との対応を要調査 |
| `mset` / `mdo` / `mappend` | 未実装 | movie の frame 指定。AnimMgr の timeline との対応を要調査 |
| `alter_state` | 未実装 | frame ごとの座標書き換え。trajectory の座標は frame data 由来で編集不可 (`MolCoord::isCoordEditable`) なので対象になるか要検討 |

## 2. picking・編集モード依存

`edit` / `drag` / `mask` / `protect` / `invert` / `remove_picked` / `unpick`。GUI の picking
(`docs/architecture/gpu-id-picking.md`) とコンソールの状態をどう結ぶかの設計が先に要る。

## 3. 重量級アルゴリズム

`h_add` / `protonate` / `map_new` / `set_symmetry` / `cealign`。CueMol に同等の C++ 機能が
あるかで可否が決まる (CE アルゴリズムは無い)。`usalign` / `tmalign` は、C++ の
US-align (`MolAnlManager.superposeUSalign1` / `superposeUSalignJSON`) を使えば足せる (`align` / `super` は既に
US-align で動く。`../architecture/usalign-superpose.md`)。psico 互換で TM-score を表示する形が候補。

## 4. 既存コマンドの小さな改善

- `zoom` / `center` / `orient` は、複数分子にまたがる selection では先頭の分子だけを対象にして warn する。
  全体を収めるには複数 object の bbox を合わせる機能 (C++) が要る。
- `state` / `animate` などの引数は受け付けて無視している (warn は出す)。
- `save` の `.cif` / `.pse`: 今は理由付きで拒否。mmCIF writer が C++ に無い。`.pse` は PyMOL 固有形式。
- trajectory の `mplay`: 再生ループが renderer 側にあり、worker から回すには mdtools 側の設計変更が要る。
- `spectrum` の selection 単位の部分着色: paint の residue ごとのエントリで偽装すると大量のエントリになる。
- `util.chainbow` (chain ごとの rainbow): `RainbowColoring` の `mode=chain` で描ける。
  PyMOL の `spectrum` ではなく `util` の機能なので、`util.*` を扱う方針を決めてから。

## 対象外 (方針)

- 直前の selection 名の省略 (暗黙コンテキスト): PyMOL でも曖昧で、誤操作の元になる。
- PyMOL dialect で native の生成コマンドを再利用すること (引数と文言が PyMOL 固有のため。
  [op catalog](../architecture/op-catalog.md))。
- PyMOL の `volume` / `isodot`。
