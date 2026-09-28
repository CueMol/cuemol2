# pymconsole の残り (後日の候補)

Status: **未着手 / 後日**。Phase 3・Phase 4 の計画項目は #642-#649 ですべて実装済みで、これはその後に残った
候補の一覧。着手するときは項目ごとに計画を起こす。
関連: [調査報告](pymconsole-research-260529.md) §Tier 2、[Phase 3](260926-pymconsole-phase3-plan.md)、
[Phase 4](260927-pymconsole-phase4-plan.md)。

判断の原則はこれまでと同じ: PyMOL と**意味が一致するものだけ**を移す。計算やアルゴリズムは TS に書かず、
既存の service か C++ (必要なら `MolCoord` などに機能として足し、GUI からも使えるようにする) に置く。

## 1. MD trajectory 系 (次の候補、後日)

調査報告の Tier 2 では「MD trajectory ブランチの統合待ち」で後回しにしたもの。mdtools
(`src/modules/mdtools/`、GUI は `plugins/mdtools/`) が develop に入ったので着手できる。

| PyMOL | 状況 | 見込み |
|---|---|---|
| `count_states` | 実装済み (`movieCommands.ts`) | - |
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
あるかで可否が決まる (`align` / `super` は Phase 3b で実装済み)。

## 4. 既存コマンドの小さな改善

- `zoom` / `center` / `orient` は、複数分子にまたがる selection では先頭の分子だけを対象にして warn する。
  全体を収めるには複数 object の bbox を合わせる機能 (C++) が要る。
- `state` / `animate` などの引数は受け付けて無視している (warn は出す)。
- `util.chainbow` (chain ごとの rainbow): `RainbowColoring` の `mode=chain` で描ける。
  PyMOL の `spectrum` ではなく `util` の機能なので、`util.*` を扱う方針を決めてから。

## 対象外 (方針)

- 直前の selection 名の省略 (暗黙コンテキスト): PyMOL でも曖昧で、誤操作の元になる。
- MCP / tool catalog の共通化: [260926-mcp-tool-catalog-plan.md](260926-mcp-tool-catalog-plan.md) 側で扱い、
  pymconsole の作業には含めない。
