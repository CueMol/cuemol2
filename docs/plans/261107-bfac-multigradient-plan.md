# B-factor の多色グラデーション: 残り

`BfacColoring` の多色グラデーション (`multi_grad`) の残り。実装済みの仕様は
[`../architecture/bfac-multigradient.md`](../architecture/bfac-multigradient.md) (C++、`set_multigrad_nodes` の
`gradient` / `targetKind`、AlphaFold の pLDDT の style と取得、Color pane の B-factor の deck)。

---

## 1. (任意) PyMOL dialect の `spectrum b` の多色 palette

PyMOL dialect の `spectrum b` / `q` は、2 色の palette だけを `BfacColoring` (`lowcol` / `highcol`) で塗り、
3 色以上の palette (`rainbow` など) は断っている (`docs/architecture/console-pymol-dialect.md`)。`BfacColoring` が
多色のグラデーションを持てるようになったので、3 色以上の palette を、`minimum` / `maximum` の間に等間隔に
並べた node として `set_multigrad_nodes ... gradient=coloring` で塗れる。
