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
エラーを報告している)。`settings` もここで plugin id / 表示名を付けて平坦化され、
`secret` control には `namespace = manifest.id` が入る (plugin は namespace を書かない)。

読み取り側 (`usePlugins` / `usePluginContributions` / `usePluginPrefs`) は
**`pluginContext.ts`** にあり、`PluginProvider.tsx` には無い。provider は
`@plugins/index` を import し、plugin は `plugin-host/api` を import するので、
api barrel から provider を辿れると plugin -> api -> provider -> registry -> plugin の
循環になる。実際これで `createDialogHook` が undefined になった。**api barrel に何かを
足すときは、それが `@plugins/index` へ辿り着かないか確認する。**

`UiState.pluginPrefs` も provider が持つ。保存は `pluginEnabled` とは**別の `UI_SAVE`
呼び出し**で、かつ map 全体を書く: main の `saveUi` は top-level キーの shallow merge
なので、部分的な `pluginPrefs` は他 plugin の設定を消す。

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

## push channel のレーン

`WorkerTransport` の `onmessage` は built-in の 4 channel を文字列一致で手配線していて、
それ以外は call reply とみなす (`makeMethodSeq` で pending を引き、無ければ
`orphanReplies++` して黙って捨てる)。plugin は分岐を足せないので、名前空間付きの
channel 名を 1 分岐で受ける:

```
event.data = ['plugin-channel.<id>.<name>', payload]
        |
        v  isPluginChannel(method) -- APBS 分岐の直後、reply fallback の直前
_pluginChannelListeners.get(channel) -> 各 cb(payload)
```

**prefix が service (`plugin.`) と別なのが肝**。service の reply も
`['plugin.<id>.<name>', seqno, ok, result]` で届くので、同じ prefix にすると push が
reply として捨てられるか、reply が push として配られる。分岐位置も同じ理由で
reply fallback より前に置く。

名前は両スレッドが `worker/shared/pluginCalls.ts` の `pluginChannelName()` から作る
(renderer 側は `definePluginChannel` がそれを呼ぶ)。

---

## secret の経路

値は electron-store ではなく OS のキーチェーンに入る。main が持ち、renderer は
namespace + key で引く:

```
plugin: definePluginSecret('foo', 'apiKey', { envVar: 'FOO_API_KEY' })
        |
        v  window.electronAPI.invoke(IPC.SECRET_GET, { namespace, key, envVar })
main/handlers/secrets.ts -> main/secretStore.ts
        |
        +-- stored: StoreSchema.secrets['<namespace>.<key>'] (safeStorage 暗号化 + base64)
        +-- env:    process.env[envVar]
        +-- none
```

`menu:set-plugin-contributions` と同じ形で、**main は namespace が何なのかを知らない**。
plugin id を namespace に入れるのは host (`definePluginSecret`) 側なので、plugin が
他の plugin の entry を指すことはできない。

`safeStorage.isEncryptionAvailable()` が false のときは保存を**拒否**して環境変数を
案内する。平文で書くくらいなら保存しないほうがよい、という判断。

---

## undo/redo の抑止

`UndoRedoLockContext` は `ModalOpenCounterContext` と同じ参照カウントだが、count を
**React state** に置く (`useUndoRedoState` が再 render して toolbar を落とし、native menu
へ再 push する必要があるため。ref だとどちらも起きない)。

`useUndoRedoState` 側は 2 箇所で見る: `applyState` が flags を false にして
`MENU_UPDATE_STATE` を送り、`pickUndo` / `pickRedo` が実行を拒否する。**両方要る** --
macOS は native menu が Cmd+Z を握るが、Windows / Linux の keybinding dispatcher は
command bus に直接届くため。lock の取得・解放で `MENU_UPDATE_STATE` を送り直すのは、
scene event が来ないと flags が更新されないから。

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
3. `definePlugin.ts` の `validatePlugin` に「宣言したのに実体が無い」検査を足す
4. 描く側 (`shell/StatusBar.tsx`) で `usePluginContributions()` を読み、built-in と
   合成する。位置指定が要るなら `insertAfterId` を使う
5. 無効化でその寄与が消えたときのフォールバックを考える (アクティブだった tab や view が
   消えるなら既定へ戻す。`BottomPanel` / `MainLayout` に前例がある)

`settings` 寄与が直近の実例。core 側は `SettingsPane` が `pluginPrefSettingDefs()` で行を
生成し `buildCategoryTree()` でツリーに枝を足すだけで、plugin id はどこにも書かれない
(既存の「Plugins ページの toggle 行を registry から生成する」と同じ形)。静的だった
`CATEGORY_TREE` / `ALL_LEAF_IDS` は、pane が描くツリーを `leafIds()` / `buildLabelMap()` で
その場で導くように変えた (nav store の初期値だけは静的なままでよい)。

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
| `renderer/plugin-host/pluginChannels.test.ts` | push が listener に届き、service の reply は届かないこと |
| `renderer/contexts/UndoRedoLockContext.test.tsx` | lock で flags が false + `MENU_UPDATE_STATE` 再 push、`pickUndo` が拒否 |
| `src/main/secretStore.test.ts` | stored > env > none、空文字 = clear、暗号化不可なら保存拒否 |

`devOnly` を宣言している plugin は無いので、その gate は
`PluginProvider.test.tsx` が合成 plugin で検査している。

---

## 型の置き場所

| 型 | 場所 | 理由 |
|---|---|---|
| menu 寄与、`PluginCommandId` | `src/shared/types/pluginContrib.ts` | main が native menu を建てるのに必要 |
| secret の req / res | `src/shared/types/secrets.ts` | main が実装を持つ |
| それ以外の manifest、component | `src/renderer/plugin-host/types.ts` | `AppIconKey` と React に依存するので shared に置けない |
| 設定 control の kind | `src/renderer/features/settings/settings/settingControl.ts` | `settingsConfig.ts` は contexts と worker DTO を引くので、plugin-host から名指ししたくない |
| worker service / channel 名の組み立て | `src/renderer/worker/shared/pluginCalls.ts` | 両スレッドが load する |
| registry の読み取り (`usePlugins` ほか) | `src/renderer/plugin-host/pluginContext.ts` | provider (= `@plugins/index`) を巻き込まずに読むため |
