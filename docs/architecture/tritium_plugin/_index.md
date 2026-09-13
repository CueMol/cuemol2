# tritium plugin (JS/TS レーン) (日本語)

react-gui の機能を **plugin 単位**で足し外しできるようにする仕組みと、その書き方。

対象は **JS/TS レーンのみ**で、plugin は**ビルド時にアプリへ同梱**される
([`docs/plans/260908-tritium-plugin-system-plan.md`](../../plans/260908-tritium-plugin-system-plan.md)
の Phase 0)。実行時ロード (別 bundle の `import()` / custom protocol / userData
sideload) と **C++ plugin (dlopen) は未実装**。C++ レーンが入るときは
`docs/architecture/` に別ディレクトリを作る。

---

## 読む順番

| | ファイル | 内容 |
|---|---|---|
| 1 | [overview.md](overview.md) | 何を解決するか、ディレクトリ構成、plugin が動くまでの流れ、レイヤ規則。**最初に読む** |
| 2 | [authoring.md](authoring.md) | plugin の書き方。最小の完成例を 1 本通しで作る。テストの書き方も |
| 3 | [contributions.md](contributions.md) | manifest 全フィールドと寄与点 (command / menu / toolbar / view / bottom tab / dialog / worker service) のリファレンス |
| 4 | [api.md](api.md) | `@renderer/plugin-host/api` の API リファレンス。plugin から使える関数と型 |
| 5 | [internals.md](internals.md) | host 自体の実装。**plugin を書くだけなら不要**。寄与点を足す・host を直すときに読む |

plugin を 1 本書きたいだけなら **overview -> authoring** で足りる。書いている途中で
「この寄与点の正確な意味は」となったら contributions、「この関数のシグネチャは」と
なったら api を引く。

---

## 現在の plugin

`tritium/react-gui/src/plugins/` に 5 つある。実物が一番確実なサンプルなので、
近いものを真似るとよい。

| id | 寄与 | 切り替え | 真似るとよい場面 |
|---|---|---|---|
| `getpdb` | command / menu / toolbar / dialog | 常時有効 | メニューやツールバーから開くダイアログ機能 |
| `sequence` | bottom tab / worker service 4 本 | 常時有効 | 下部パネルと、自前の worker service を持つもの |
| `catalog` | activity view + side pane 3 | 既定オフ | サイドパネルの view。worker 通信のない純 UI |
| `agent` | activity view + side pane / worker service 2 / push channel / 設定 5 行 (うち secret 2) | 既定オフ | 長い非同期処理、streaming、自前の設定と資格情報を持つもの |
| `mdtools` | command / menu / dialog / bottom tab / worker service 7 本 | 既定オフ | 機能一式 (開くフロー + パネル + service) を丸ごと 1 ディレクトリに閉じるもの |

最初の 4 つは**その機能専用の C++ クラスを持たない**ことを基準に選んである。

`mdtools` はその例外で、専用の C++ module (`src/modules/mdtools/`、`Trajectory` /
`TrajBlock` と 4 つの reader) を持つ最初の plugin。C++ レーンが無いので module は常時
ロードされたままで、**plugin が gate するのは GUI だけ** (メニュー項目・bottom tab・
dialog・worker service の呼び出し口)。無効にしても、既に読み込まれている `Trajectory`
は描画され続ける。この割り切りができない UI -- `CutByPlane` や `Prot2ndry`、
`SymmOpManager` のように C++ 側の専用機能そのものの interface になっているもの -- は、
C++ とセットでないと意味がないので JS/TS レーンだけでは plugin 化しない。

`agent` ([ai-agent-plugin.md](../ai-agent-plugin.md)) は UXP に無い新機能で、host の
寄与点をひととおり使う: push channel、plugin 自身の設定ページ、OS キーチェーンの資格情報、
undo/redo の一時抑止。似たものを書くときの一番大きい実例。

---

## 関連

- [react-gui のレイヤと import 規則](../react-gui-layering.md) -- `src/plugins/` を含む import 境界
- [キーボードショートカットの所有者](../keyboard-shortcuts.md) -- plugin の accelerator が乗る経路
- [`docs/migration/ui-style-guide.md`](../../migration/ui-style-guide.md) -- plugin の UI が守る規約
- [`docs/plans/260908-tritium-plugin-system-plan.md`](../../plans/260908-tritium-plugin-system-plan.md) --
  全体計画。実行時ロード (Phase A)、C++ レーン (Phase A')、packaging、却下した案
