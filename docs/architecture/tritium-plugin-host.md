# tritium の plugin host (built-in plugin) (日本語)

react-gui の機能を **plugin 単位**で足し外しできるようにする仕組み。
[`docs/plans/260908-tritium-plugin-system-plan.md`](../plans/260908-tritium-plugin-system-plan.md)
の Phase 0 にあたる部分で、**JS/TS レーンのみ**・**ビルド時同梱 (in-tree)** で実装されている。

実行時ロード (別 bundle の `import()` / custom protocol / userData sideload) と
C++ plugin (dlopen) は**未実装**。プラン側の Phase A / A' 以降がその範囲。

---

## 何を解決するか

plugin 化以前、機能を 1 つ足すには閉じたテーブルを複数書き換える必要があった:
`CmdId` + `CommandMap`、`APP_MENU` + `MENU_ACTION_MAP` + `IPC` チャネル定数、
`TOOLBAR_ITEMS`、`ActivityView` union + `VIEW_PANES`、`BottomTabType` union、
`DialogContext` の provider 配列、`ServiceMap` スライス。機能を**外す**ときも同じ数だけ
触ることになり、「この機能をオフにできるか」がコードから読み取れなかった。

plugin host は、これらの受け皿を**実行時に開いた**もの。plugin は 1 ディレクトリに閉じ、
manifest が寄与 (contribution) を宣言し、有効/無効はユーザ設定 1 個で切り替わる。

**既存機能を全部 plugin 化するのが目的ではない**。今後の拡張の置き場所を作るのが本題で、
現状の 3 つは機構の検証のために選んだもの。

---

## ディレクトリ

```
tritium/react-gui/src/
  plugins/                      <- 内蔵 plugin (1 plugin = 1 ディレクトリ)
    index.ts                    #  BUILTIN_PLUGINS: この build が積む plugin
    index.test.ts               #  manifest 整合と worker service 契約の検査
    <id>/
      index.ts                  #  definePlugin(...) -- plugin の宣言
      manifest.ts               #  (任意) 大きい manifest の分離先
      calls.ts                  #  (任意) worker service の呼び出し契約
      renderer/                 #  renderer スレッドで動く部分
      worker/                   #  Web Worker で動く部分 (*.service.ts)
  renderer/plugin-host/         <- host (core 側)
    types.ts                    #  manifest / component / 解決済み contribution の型
    definePlugin.ts             #  宣言点と検証
    pluginSelect.ts             #  dev gate / 有効判定 / contribution の平坦化
    PluginProvider.tsx          #  レジストリ本体 (有効集合と contribution)
    PluginRoots.tsx             #  有効な plugin の Root を mount
    usePluginCommand.ts         #  plugin command の登録
    pluginServices.ts           #  plugin worker service の型付き client
    api.ts                      #  plugin 向けの公開 barrel
    index.ts                    #  core 向けの barrel
```

`src/plugins/<id>/` の形は、将来 `Resources/plugins/<id>/` に実行時ロードするときと
同じ形にしてある (プラン §5.3)。移行はパッケージングの変更であって書き直しではない。

---

## manifest と寄与点

`PluginManifest` は plain data で、`plugin.json` にそのまま書ける形。

```ts
export const getPdbPlugin = /* @__PURE__ */ definePlugin({
  manifest: {
    id: 'getpdb', name: 'Get PDB', version: '1.0.0',
    contributes: {
      commands: [{ id: 'plugin.getpdb.open', title: 'Get PDB...' }],
      menus:    [{ group: 'file', after: 'open-traj', items: [...] }],
      toolbar:  [{ after: 'save-scene', items: [...] }],
    },
  },
  Root: GetPdbRoot,
})
```

| 寄与点 | manifest | 実体 | core 側の受け口 |
|---|---|---|---|
| command | `contributes.commands` | `Root` 内の `useRegisterPluginCommand` | `CommandRegistry` の `registerAny` / `dispatchAny` |
| menu | `contributes.menus` | (command が実体) | `shared/pluginMenu.ts` の `buildAppMenu` |
| toolbar | `contributes.toolbar` | (command が実体) | `shell/Toolbar.tsx` の `buildToolbarItems` |
| activity view + side pane | `contributes.views` | `panes: { <paneId>: Component }` | `shell/ActivityBar.tsx` / `shell/SidePanel.tsx` |
| bottom tab | `contributes.bottomTabs` | `bottomTabs: { <tabId>: Component }` | `shell/BottomPanel.tsx` |
| dialog | (宣言なし) | `Root` が provider を mount | 既存の `createDialogHook` をそのまま使う |
| worker service | (宣言なし) | `worker/*.service.ts` + `calls.ts` | `worker/server/services/index.ts` の plugin glob |

`definePlugin` は manifest と実体の食い違い (宣言した pane に component が無い、
menu item が宣言していない command を指している、command id が `plugin.<id>.` で
始まっていない) を `console.error` で報告する。`plugins/index.test.ts` が
`validatePlugin` の結果が空であることを検査しているので、CI で落ちる。

---

## 二重化した理由 -- 型付きマップは閉じたまま

core の `CmdId` / `CommandMap` / `ServiceMap` は**閉じたまま**にしてある。plugin の
ために開くと、行の抜けを compile error で捕まえる仕掛け (root `CLAUDE.md` の
「型契約マップ」) をアプリ全体で失うことになるため。

代わりに plugin には**文字列 id の別レーン**を与え、名前空間で衝突を防いでいる:

| | 名前 | 型の出どころ |
|---|---|---|
| command | `plugin.<pluginId>.<name>` | `useRegisterPluginCommand<TArgs, TResult>` の型引数 |
| worker service | `plugin.<pluginId>.<name>` | plugin 側の `calls.ts` (`definePluginServices<M>`) |

worker 側の名前空間化は **登録側が自動で付ける**: `worker/server/services/index.ts` が
`src/plugins/*/worker/*.service.ts` を別 glob で拾い、パスから plugin id を取って
`pluginServiceName()` を通す。したがって `worker/shared/calls/index.test.ts` の
「`ServiceMap` と worker の登録が 1 対 1」という検査は built-in だけを見たままでよく、
plugin 側は `plugins/index.test.ts` が同じ形で検査する。

---

## menu だけ main を経由する

native menu を持つのは main で、main は renderer の plugin レジストリを見られない。
そこで **command id を channel の中に載せる**:

```
plugin の menu item  ->  ipcChannel = 'menu:plugin:<commandId>'
main: buildItem      ->  send(MENU_GENERIC, ch)        (中身は解釈しない)
renderer: useMenuDispatch -> dispatchAny(pluginCommandFromChannel(ch))
```

`PluginProvider` は有効集合が変わるたびに `IPC.MENU_SET_PLUGIN_CONTRIBUTIONS` で
menu 部分だけを main に push し、main は `rebuildApplicationMenu()` する。
window 作成時の menu は renderer より前に建つので plugin 行を持たず、最初の push で
現れる。macOS でアプリ起動直後の一瞬だけ plugin 行が無いのはこのため。

Windows / Linux の React menu bar と keybinding dispatcher は同じ `buildAppMenu()` を
呼ぶので、両プラットフォームで同じメニューになる
([keyboard-shortcuts.md](keyboard-shortcuts.md) の「OS ごとに 1 人のオーナー」は不変)。

---

## 有効 / 無効

- 保存先は `UiState.disabledPlugins: string[]` (electron-store、`UI_LOAD`/`UI_SAVE`)。
  **無効なものだけ**を持つので、後から増えた plugin は既定で有効になる
- UI は Settings > Plugins。行は `features/settings/settings/pluginSettings.ts` が
  レジストリから生成するので、plugin を足せば勝手に出る
- 切り替えは即時。`PluginRoots` が Root を unmount し、command と dialog が一緒に消え、
  menu / toolbar / view / bottom tab も同じ render で消える
- **既知の割り切り**: 無効化は進行中の処理を中断する。Get PDB のダウンロード中に
  Get PDB を無効化すれば、その転送は打ち切られる

### dev-only plugin

`manifest.devOnly` が立っている plugin は release build に入らない。ゲートは二重:

1. `plugins/index.ts` の `...(__DEV_UI__ ? [catalogPlugin] : [])` -- bundler が枝を畳み、
   モジュールごと tree-shake する
2. `selectAvailablePlugins()` -- 実行時の同じ判定。テストが届くのはこちら

**`definePlugin(...)` の呼び出しには pure annotation が要る。** 無いと bundler は
呼び出しに副作用がある前提で plugin モジュールを残すので、(1) の枝を畳んでも本体が
bundle に残る。3 つの built-in plugin が書き方の見本。検証は
`CUEMOL_RELEASE=1 pnpm exec electron-vite build` して bundle に `Component Catalog` が
出ないこと。

---

## レイヤ規則 (ESLint が強制)

`src/plugins/` は 2 層に分かれ、それぞれ core の対応する層と同じ制約を受ける
([react-gui-layering.md](react-gui-layering.md) 参照):

| ディレクトリ | 規則 |
|---|---|
| `src/plugins/*/worker/**` | Web Worker。React / Blueprint / UI ツリー / `worker/client` / 他 plugin の `renderer/` を import しない |
| `src/plugins/**` (worker 以外) | renderer。`worker/server` は型のみ、`@main`/`electron` 禁止、h3-kit は barrel 経由、3 階層以上の相対 import 禁止 |
| `src/renderer/**` | **`@plugins/*/**` を import しない** (`NO_PLUGIN_INTERNALS`) |

最後の 1 行が要。core から plugin の中身へ依存が伸びると、その plugin は外せなくなる。
core が触ってよいのは `@plugins/index` (レジストリ) だけで、それを import するのは
`plugin-host/PluginProvider.tsx` 1 箇所。

plugin が使う core の API は `@renderer/plugin-host/api` に集めてある。今は in-tree
なので `@renderer/**` も import できるが、実行時ロード (Phase A) では不可能になるため、
**api barrel に無いものを使うときは barrel に足すほうを先に検討する**。

---

## 現在の built-in plugin

| id | 何を寄与するか | 選んだ理由 |
|---|---|---|
| `catalog` | activity view 1 + side pane 3 (dev-only) | 依存ゼロ・worker 通信ゼロ。view/pane レーンだけを検証する |
| `getpdb` | command 1 + menu 1 + toolbar 1 + dialog | command / menu / toolbar / dialog の 4 レーン。C++ は generic な `streamLoadFromUrl` / `streamLoadDensityMap` 経由のみ |
| `sequence` | bottom tab 1 + worker service 4 | worker service レーン。C++ は `MolCoord` の chain/residue 走査、`ResidRangeSet`、`mol.sel`、`view.setViewCenter` という generic API のみ |

3 つとも **その機能専用の C++ クラスを持たない**ことを基準に選んでいる。
`CutByPlane` や `Prot2ndry`、`SymmOpManager` のように C++ 側の専用機能の interface に
なっている UI は、C++ とセットでないと切り出せないので対象外
(C++ レーンはプラン Phase A')。

---

## plugin を足す手順

1. `src/plugins/<id>/index.ts` に `definePlugin({ manifest, ... })` を書く
   (pure annotation を付ける)。id は `[a-z][a-z0-9-]*`
2. 寄与するものを manifest の `contributes` に宣言し、実体を用意する
   - command: `Root` の中で `useRegisterPluginCommand('plugin.<id>.<name>', handler)`
   - pane / bottom tab: `panes` / `bottomTabs` に component を並べる
   - dialog: `Root` で `createDialogHook` の Provider を mount し、その内側で command を登録
   - worker service: `worker/<name>.service.ts` に `export const services = {...}`、
     `calls.ts` に `type XxxCalls = {...}` と `definePluginServices<XxxCalls>('<id>')`
3. `src/plugins/index.ts` の `BUILTIN_PLUGINS` に 1 行足す
4. worker service を足したなら `plugins/index.test.ts` の `DECLARED_CALLS` に 1 行足す
5. UI は [ui-style-guide.md](../migration/ui-style-guide.md) の form-kit 規約に従う。
   plugin だからといって例外ではない

### テスト方針

root `CLAUDE.md` の「テスト方針」がそのまま適用される。plugin 機構そのものについて
pin してあるのは以下だけで、これ以上は増やさない:

| ファイル | 契約 |
|---|---|
| `renderer/__test__/commandRegistry.test.tsx` | 文字列 id レーンが同じ bus に載り、未登録 id は reject する |
| `shared/pluginMenu.test.ts` | channel の往復、挿入位置、`APP_MENU` を書き換えないこと |
| `renderer/__test__/menuDispatch.test.tsx` | plugin channel から command id を復号して dispatch する |
| `renderer/plugin-host/PluginProvider.test.tsx` | 保存形式が「無効なものだけ」であること、`devOnly` gate |
| `renderer/__test__/Toolbar.test.tsx` | 寄与ボタンが anchor の直後に出て、plugin command を dispatch する |
| `plugins/index.test.ts` | manifest と実体の整合、worker service 名と契約の 1 対 1 |

plugin 自身の機能テストは、その plugin のディレクトリに置く (移設した Get PDB /
Sequence のテストがその形)。

---

## 関連

- [`docs/plans/260908-tritium-plugin-system-plan.md`](../plans/260908-tritium-plugin-system-plan.md) --
  全体計画。実行時ロード (Phase A)、C++ レーン (Phase A')、packaging、却下した案
- [react-gui のレイヤと import 規則](react-gui-layering.md) -- `src/plugins/` を含む import 境界
- [キーボードショートカットの所有者](keyboard-shortcuts.md) -- plugin の accelerator が乗る経路
- [`docs/migration/ui-style-guide.md`](../migration/ui-style-guide.md) -- plugin の UI が守る規約
