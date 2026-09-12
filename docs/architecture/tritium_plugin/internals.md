# host の実装 (日本語)

[目次に戻る](_index.md)

**plugin を書くだけなら読む必要はない。** 寄与点を足す、host を直す、挙動が説明できない
ときに読む。

---

## 有効判定の解決順

`plugin-host/pluginSelect.ts` の純関数で決まる。

```
BUILTIN_PLUGINS
  |
  +-- selectAvailablePlugins(plugins, __DEV_UI__)
  |     devOnly && !devUi なら落とす        -> available
  |
  +-- isPluginEnabled(plugin, choices)
        alwaysEnabled          -> true (保存値を見ない)
        choices[id] があれば   -> その値
        なければ               -> manifest.defaultEnabled ?? true
                                                          -> active
```

`choices` は `UiState.pluginEnabled` (electron-store)。**ユーザが明示的に選んだものだけ**
を持ち、id が無い = 未選択。`PluginProvider.setEnabled` は switchable でない plugin への
呼び出しを黙って無視する (古い Settings 行や壊れた保存値から常時有効な plugin が
オフにならないように)。

`collectContributions(active)` が manifest の宣言と `panes` / `bottomTabs` の component を
join して平坦化する。component の無い宣言はここで落ちる (`validatePlugin` が既に
エラーを報告している)。

---

## menu が main を往復する経路

native menu を持つのは main で、main は renderer の plugin レジストリを見られない。
そこで **command id を channel の中に載せる**。

```
manifest の menu item
  |
  v  shared/pluginMenu.ts: buildAppMenu(contribs)
APP_MENU のコピー + 挿入。ipcChannel = 'menu:plugin:<commandId>'
  |
  +-- renderer: MenuBar / useMenuKeyBindings がそのまま描く / 拾う
  |
  +-- IPC.MENU_SET_PLUGIN_CONTRIBUTIONS で menu 部分だけ main へ
        |
        v  main/menu.ts: setPluginMenuContributions -> rebuildApplicationMenu
      buildItem が plugin channel を send(MENU_GENERIC, ch) に流す (中身は解釈しない)
        |
        v  renderer: useMenuDispatch
      isPluginMenuChannel なら dispatchAny(pluginCommandFromChannel(ch))
```

要点:

- **`buildAppMenu` は `APP_MENU` を書き換えない**。寄与が空なら `APP_MENU` をそのまま
  返す (識別子が安定するので呼び出し側が memo できる)。plugin を無効にすれば次の
  build で行が消える
- `PushChannels[MENU_GENERIC]` の型は `MenuActionChannel | PluginMenuChannel`
- **起動直後の一瞬、macOS の native menu に plugin 行が無い**。window 作成時の menu は
  renderer より先に建ち、`PluginProvider` が最初の push をしてから再構築されるため。
  push は保存値の読み込み完了後 (`loaded`) に行う。そうしないとユーザがオフにした
  plugin の行が毎回一瞬出る
- rebuild は modal block 中は deferred される (既存の `menuBlock` の挙動に乗る)

Windows / Linux の React menu bar と keybinding dispatcher も同じ `buildAppMenu()` を
呼ぶので、両プラットフォームで同じメニューになる
([keyboard-shortcuts.md](../keyboard-shortcuts.md) の「OS ごとに 1 人のオーナー」は不変)。

---

## worker service の glob と名前空間

`worker/server/services/index.ts` が **2 つの glob** を持つ。

```ts
// core
import.meta.glob(['./*.service.ts', './*/*.service.ts'], { eager: true })
// plugin
import.meta.glob(['../../../../plugins/*/worker/*.service.ts'], { eager: true })
```

plugin 側はパスから id を取り、`pluginServiceName(id, name)` =
`plugin.<id>.<name>` にして `svc.register` する。**登録側が prefix を付ける**ので、
plugin の `services` に書く名前は素のまま。

2 つを分けているのが要点で、これにより `worker/shared/calls/index.test.ts` の
「`ServiceMap` と worker の登録が 1 対 1」という検査は built-in だけを見たままでよい。
plugin 側は `plugins/index.test.ts` が同じ形で検査する。

`WorkerService.invoke` の dispatch は元々文字列キーなので、名前空間化された名前でも
そのまま届く。renderer 側は `WorkerTransport.invokePluginService` /
`AsyncCueMol.invokePluginService` が同じ `pluginServiceName` を通す。

glob パターンが相対パスなのは、alias が worker bundle と vitest の双方で解決される
保証を避けたため。`src/plugins/` を動かすときはこのパターンも直す。

---

## dev-only と tree-shaking

`devOnly` の plugin は 2 段で落とす:

1. `plugins/index.ts` で `...(__DEV_UI__ ? [thePlugin] : [])` -- bundler が枝を畳み、
   モジュールごと tree-shake する
2. `selectAvailablePlugins()` -- 実行時の同じ判定。テストが届くのはこちら

**`definePlugin(...)` の呼び出しには pure annotation を付ける。** 無いと bundler は
呼び出しに副作用がある前提でモジュールを残すので、(1) の枝を畳んでも本体が bundle に
残る。実装中にこれで一度 tree-shake が効かなくなった。built-in plugin は 3 つとも
annotation を付けてある (現状どれも `devOnly` ではないので実効は無いが、書き方を
揃えておく)。

検証: `CUEMOL_RELEASE=1 pnpm exec electron-vite build` して、その plugin に固有の
文字列が `out/renderer/assets/*.js` に出ないこと。

`devOnly` を使っている plugin は今は無い。Component Catalog も**入れた上で既定オフ**に
してある。「見せたくない」だけなら `defaultEnabled: false` で足り、build から落とすのは
「配ってはいけない」ときだけ。

---

## 寄与点を足す手順

たとえば「ステータスバーへの寄与」を足すなら:

1. `plugin-host/types.ts` に宣言の型を足す (`PluginContributes` の 1 フィールド)。
   component を伴うなら `RendererPlugin` にもマップを足し、`Resolved*` 型と
   `PluginContributions` にも行を足す
2. `pluginSelect.ts` の `collectContributions` で宣言と component を join する。
   `EMPTY_CONTRIBUTIONS` にも空配列を足す
3. `definePlugin.ts` の `validatePlugin` に「宣言したのに component が無い」検査を足す
4. 描く側 (`shell/StatusBar.tsx`) で `usePluginContributions()` を読み、built-in と
   合成する。位置指定が要るなら `insertAfterId` を使う
5. 無効化でその寄与が消えたときのフォールバックを考える (アクティブだった tab や view が
   消えるなら既定へ戻す。`BottomPanel` / `MainLayout` に前例がある)

**core のどこにも plugin id を特別扱いで書かないこと。** 書いた時点でその plugin は
外せなくなる。

main を経由する寄与 (native menu のようなもの) を足す場合は、型を
`shared/types/pluginContrib.ts` に置き (main と共有するため)、IPC 経由で push する。
`MENU_SET_PLUGIN_CONTRIBUTIONS` が前例。

---

## host のテスト

plugin 機構そのものについて pin してあるのは以下だけ。これ以上は増やさない。

| ファイル | 契約 |
|---|---|
| `renderer/__test__/commandRegistry.test.tsx` | 文字列 id レーンが同じ bus に載り、未登録 id は reject する |
| `shared/pluginMenu.test.ts` | channel の往復、挿入位置、`APP_MENU` を書き換えないこと |
| `renderer/__test__/menuDispatch.test.tsx` | plugin channel から command id を復号して dispatch する |
| `renderer/plugin-host/PluginProvider.test.tsx` | 保存が「明示的な選択だけ」であること、manifest 既定への fallback、`alwaysEnabled` が保存値を無視すること、`devOnly` gate |
| `renderer/__test__/Toolbar.test.tsx` | 寄与ボタンが anchor の直後に出て、plugin command を dispatch する |
| `plugins/index.test.ts` | manifest と実体の整合、同梱 plugin の切り替え方、worker service 名と契約の 1 対 1 |

`devOnly` を宣言している plugin は無いので、その gate は
`PluginProvider.test.tsx` が合成 plugin で検査している。

---

## 型の置き場所

| 型 | 場所 | 理由 |
|---|---|---|
| menu 寄与、`PluginCommandId` | `src/shared/types/pluginContrib.ts` | main が native menu を建てるのに必要 |
| それ以外の manifest、component | `src/renderer/plugin-host/types.ts` | `AppIconKey` と React に依存するので shared に置けない |
| worker service 名の組み立て | `src/renderer/worker/shared/pluginCalls.ts` | 両スレッドが load する |
