# plugin host の設計 (日本語)

[目次に戻る](_index.md)

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

## ディレクトリ構成

```
tritium/react-gui/src/
  plugins/                      <- plugin (1 plugin = 1 ディレクトリ)
    index.ts                    #  BUILTIN_PLUGINS: この build が積む plugin
    index.test.ts               #  manifest 整合と worker service 契約の検査
    <id>/
      index.ts                  #  definePlugin(...) -- plugin の宣言
      manifest.ts               #  (任意) manifest が大きいときの分離先
      calls.ts                  #  (任意) worker service の呼び出し契約
      renderer/                 #  renderer スレッドで動く部分
      worker/                   #  Web Worker で動く部分 (*.service.ts)
  renderer/plugin-host/         <- host (core 側)
    types.ts                    #  manifest / component / 解決済み contribution の型
    definePlugin.ts             #  宣言点と検証
    pluginSelect.ts             #  有効判定 / dev gate / contribution の平坦化
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

## plugin が動くまで

```
plugins/index.ts の BUILTIN_PLUGINS
        |
        v
PluginProvider  ... 有効判定 (manifest 既定 + ユーザの選択)
        |
        +--> active: 有効な plugin の配列
        |         |
        |         +--> PluginRoots が各 plugin の Root を mount
        |         |        -> Root 内で command 登録 / dialog provider mount
        |         |
        |         +--> contributions (menu / toolbar / view / bottom tab)
        |                  -> ActivityBar / SidePanel / BottomPanel / Toolbar /
        |                     MenuBar / keybinding dispatcher が読んで描く
        |                  -> menu 部分だけ IPC で main に push -> native menu 再構築
        |
        v
worker 側は独立: worker/server/services/index.ts が
src/plugins/*/worker/*.service.ts を起動時に glob して登録する
```

renderer 側 (`BUILTIN_PLUGINS`) と worker 側 (glob) は**別経路**で、互いを知らない。
plugin を無効にしても worker service は登録されたままだが、呼ぶ側の UI が消えるので
到達しない。

`PluginProvider` は `renderer/index.tsx` の `CommandProvider` 直下、`PluginRoots` は
`App.tsx` の `AppCommands` の隣 (アプリ状態と dialog provider の内側) に置いてある。

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
| push channel | `plugin-channel.<pluginId>.<name>` | `definePluginChannel<T>` の型引数 |
| 設定値 | `pluginPrefs[<pluginId>][<key>]` | manifest の `contributes.settings` |
| secret | `<pluginId>.<key>` (OS キーチェーン) | `definePluginSecret` |

つまり **plugin が失うのは「マップ行を忘れたら compile error」だけ**で、型そのものは
失わない。plugin は自分の契約を自分で書き、その範囲で型が効く。

worker 側の名前空間化は **登録側が自動で付ける**ので、plugin の `services` に書く名前は
素のままでよい (詳細は [internals.md](internals.md))。

push channel の prefix が service と別なのは、service の reply も
`['plugin.<id>.<name>', seqno, ok, result]` という形で同じ `onmessage` に届くため。
secret の namespace も host が plugin id を入れるので、plugin が他の plugin の entry を
指すことはできない。

---

## レイヤ規則 (ESLint が強制)

`src/plugins/` は 2 層に分かれ、それぞれ core の対応する層と同じ制約を受ける
([react-gui-layering.md](../react-gui-layering.md) 参照):

| ディレクトリ | 規則 |
|---|---|
| `src/plugins/*/worker/**` | Web Worker。React / Blueprint / UI ツリー / `worker/client` / 他 plugin の `renderer/` を import しない |
| `src/plugins/**` (worker 以外) | renderer。`worker/server` は型のみ、`@main`/`electron` 禁止、h3-kit は barrel 経由、3 階層以上の相対 import 禁止 |
| `src/renderer/**` | **`@plugins/*/**` を import しない** (`NO_PLUGIN_INTERNALS`) |

最後の 1 行が要。core から plugin の中身へ依存が伸びると、その plugin は外せなくなる。
core が触ってよいのは `@plugins/index` (レジストリ) だけで、それを import するのは
`plugin-host/PluginProvider.tsx` 1 箇所。

plugin が使う core の API は `@renderer/plugin-host/api` に集めてある ([api.md](api.md))。
今は同梱なので `@renderer/**` も import できるが、実行時ロード (プラン Phase A) では
不可能になるため、**api barrel に無いものを使うときは barrel に足すほうを先に検討する**。

---

## UI 規約

plugin だからといって例外はない。[`docs/migration/ui-style-guide.md`](../../migration/ui-style-guide.md)
の form-kit 規約 (label+control は `h3-kit/form` のカタログで組む、サイズを consumer で
指定しない、色・余白はトークン経由) がそのまま適用される。stylelint と ESLint も
`src/plugins/` を走査する。

新しい UI を書く前に Component Catalog (plugin `catalog`、Settings > Plugins でオン) で
既存部品を探すのも同じ。
