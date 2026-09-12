# manifest と寄与点のリファレンス (日本語)

[目次に戻る](_index.md)

型の定義は `tritium/react-gui/src/renderer/plugin-host/types.ts` と
`src/shared/types/pluginContrib.ts` (main と共有する menu 部分)。

---

## RendererPlugin

`definePlugin()` に渡すもの。

```ts
interface RendererPlugin {
  manifest: PluginManifest
  /** 有効中 mount される。UI は描かない。command 登録と dialog provider の置き場 */
  Root?: React.ComponentType
  /** contributes.views で宣言した pane id -> component */
  panes?: Record<string, PaneComponent>
  /** contributes.bottomTabs で宣言した tab id -> component */
  bottomTabs?: Record<string, BottomTabComponent>
}
```

`Root` は「有効な間だけ生きていてほしいもの」の置き場。unmount されると
`useRegisterPluginCommand` が登録解除し、`createDialogHook` の Provider も消える。

---

## PluginManifest

```ts
interface PluginManifest {
  id: string                 // [a-z][a-z0-9-]* 。command と service の名前空間になる
  name: string               // Settings に出る表示名
  version: string
  description?: string       // Settings の説明文
  devOnly?: boolean
  alwaysEnabled?: boolean
  defaultEnabled?: boolean
  contributes?: PluginContributes
}
```

### 切り替え可否

| 書き方 | 意味 | 現状の該当 |
|---|---|---|
| `alwaysEnabled: true` | 常時有効。Settings に行が出ず、保存値も無視される | `getpdb`, `sequence` |
| `defaultEnabled: false` | 既定オフ。ユーザが Settings で opt-in する | `catalog` |
| どちらも書かない | 既定オン、ユーザがオフにできる | 今のところ無し |

**外す意味が無いなら `alwaysEnabled` にする。** `getpdb` / `sequence` がそうで、
「1 ディレクトリに閉じる」ために plugin にしたのであって「外せるようにする」ためでは
ない。File メニュー項目や bottom tab を消しても得るものが無く、動かない switch を
見せるほうが害になる。

保存先は `UiState.pluginEnabled?: Record<string, boolean>` (electron-store)。
**ユーザが明示的に選んだものだけ**を持つので、id が無い = 未選択で manifest の既定に
従う。「結果の状態」ではなく「選択」を保存するので、plugin 側が後から既定を変えても
未選択のユーザにそれが届く。

切り替えは即時。`PluginRoots` が Root を unmount し、command と dialog が一緒に消え、
menu / toolbar / view / bottom tab も同じ render で消える。
**無効化は進行中の処理を中断する**ので、長い処理を持つ switchable な plugin ではそこを
考慮すること。

### devOnly (現状は該当なし)

**そもそも build に入れたくない** plugin 用。`plugins/index.ts` で
`...(__DEV_UI__ ? [thePlugin] : [])` として列挙し、`definePlugin` の呼び出しに
pure annotation を付ける (詳細は [internals.md](internals.md))。

「見せたくない」だけなら `defaultEnabled: false` で足りる。Component Catalog も
**全ビルドに入れて既定オフ**にしてある。

---

## contributes

```ts
interface PluginContributes {
  commands?: PluginCommandDecl[]
  menus?: PluginMenuContribution[]
  toolbar?: PluginToolbarContribution[]
  views?: PluginViewContribution[]
  bottomTabs?: PluginBottomTab[]
}
```

dialog と worker service は `contributes` に書かない。前者は `Root` が provider を
mount するだけ、後者はファイル配置で自動登録されるため。

---

### commands

```ts
interface PluginCommandDecl {
  id: PluginCommandId    // `plugin.${string}` -- 実際には plugin.<manifest.id>.<name>
  title: string          // 人間向けラベル。今はどこにも出ない (command palette 用)
}
```

宣言は「この plugin はこの command を持つ」という表明で、実体は `Root` の中の
`useRegisterPluginCommand` です。**menu / toolbar が指す command は宣言必須** で、
宣言されていない command を指すと `definePlugin` がエラーを報告します。

id が `plugin.<manifest.id>.` で始まらない場合もエラーになります。

---

### menus

```ts
interface PluginMenuContribution {
  group: 'file' | 'edit' | 'rendering' | 'scene' | 'view' | 'tools' | 'window' | 'help'
  after?: string              // この id の item の直後に挿入。無ければ group 末尾
  separatorBefore?: boolean   // ブロックの前に separator を 1 本置く
  items: PluginMenuItem[]
}

interface PluginMenuItem {
  id: string                  // メニュー全体で一意にする (main が id で item を引く)
  label: string
  command: PluginCommandId
  accelerator?: string        // 'CmdOrCtrl+S' 形式
  acceleratorMac?: string     // macOS だけ別にしたいとき
}
```

`group` は `APP_MENU` のグループラベルを小文字にしたもの。存在しない group を指すと
`console.warn` して無視されます。

**macOS の native menu にも Windows / Linux の React menu bar にも同じものが出ます。**
accelerator も両方で効きます (Windows / Linux は renderer の keybinding dispatcher、
macOS は native menu が拾う。[keyboard-shortcuts.md](../keyboard-shortcuts.md))。

注意: **アプリ起動直後の一瞬だけ macOS の native menu に plugin 行がありません。**
native menu は renderer より先に建つので、renderer から menu 寄与が push されて
再構築されるまでの間だけ built-in のみになります。

例 (`plugins/getpdb/manifest.ts`):

```ts
menus: [
  {
    group: 'file',
    after: 'open-traj',
    items: [{ id: 'get-pdb', label: 'Get PDB...', command: GET_PDB_COMMAND }],
  },
],
```

---

### toolbar

```ts
interface PluginToolbarContribution {
  after?: string              // この id の built-in item の直後。無ければ末尾
  items: PluginToolbarItem[]
}

interface PluginToolbarItem {
  id: string
  icon: AppIconKey            // h3-kit/primitives の APP_ICONS のキー
  text: string
  command: PluginCommandId
  requiresScene?: boolean     // molview タブが無い間は disabled
}
```

**ブロックの前には必ず divider が入ります** (built-in のグループ分けと同じ見え方に
するため)。`separatorBefore` のような制御はありません。

`icon` は既存の `AppIconKey` から選びます。plugin が独自アイコンを持つ経路はまだ
ありません。新しいキーが要るなら `h3-kit/primitives/appIcons.ts` に足します。

---

### views (activity view + side pane)

```ts
interface PluginViewContribution {
  id: string                  // activity view の id。永続レイアウトのキーにもなる
  title: string               // side panel のヘッダ
  icon: AppIconKey            // activity bar のアイコン
  panes: { id: string; defaultSize: number }[]
}
```

`panes[].id` ごとに `RendererPlugin.panes` に component が要ります。無ければ
`definePlugin` がエラーを報告し、その pane は描かれません。

built-in view (explorer / selection / crystal) の後ろに、登録順で並びます。位置指定は
ありません。

pane の分割位置と折りたたみ状態は `LayoutState.viewSizes` / `viewCollapsed` に view id
文字列をキーにして保存されるので、plugin 側で何もしなくても永続します。plugin を
無効にしてその view がアクティブだった場合は Explorer に戻ります。

component は `PaneComponent`:

```ts
type PaneComponent = React.ComponentType<{
  collapsed: boolean
  onToggleCollapse: () => void
}>
```

この 2 つを `PaneSectionHeader` にそのまま渡すのが定型です ([api.md](api.md))。

---

### bottomTabs

```ts
interface PluginBottomTab {
  id: string
  label: string
  icon: AppIconKey
  after?: string              // この id の built-in tab の直後。無ければ末尾
}
```

built-in tab は `output` / `animation` / `trajectory`。

component は `BottomTabComponent` で、アクティブなシーンが props で届きます:

```ts
type BottomTabComponent = React.ComponentType<{
  cm: AsyncCueMol | null
  activeSceneId?: number
  activeMolViewId?: number
}>
```

無効化でそのタブが消えたとき、アクティブだったなら `output` に戻ります。

---

## dialog (宣言なし)

`contributes` には書きません。`Root` が provider を mount し、その内側で command を
登録するだけです。

```tsx
export const FooRoot: React.FC = () => (
  <FooDialogProvider>
    <FooCommands />
  </FooDialogProvider>
)
```

provider は core と同じ `createDialogHook` で作ります ([api.md](api.md))。
`ModalOpenCounterContext` にも自動で参加するので、dialog が開いている間のメニュー
ブロックも built-in と同じに効きます。

---

## worker service (宣言なし)

ファイル配置で決まります。

```
src/plugins/<id>/worker/<何か>.service.ts   -> export const services = { ... }
src/plugins/<id>/calls.ts                   -> 呼び出し契約と typed client
```

`worker/server/services/index.ts` が `src/plugins/*/worker/*.service.ts` を glob して
**`plugin.<id>.<name>` に自動で名前空間化**して登録します。`services` に書く名前は
素のままでよく、prefix を自分で付けてはいけません。

呼び出し側は `calls.ts` の client を使います:

```ts
export type FooCalls = {
  doThing: { args: DoThingArgs; result: DoThingResult }
}
export const FOO_KEYS = ['doThing'] as const satisfies readonly (keyof FooCalls)[]
export const fooServices = definePluginServices<FooCalls>('foo')

// 呼び出し
const r = await fooServices.invoke(cm, 'doThing', { sceneId })
```

`FooCalls` は **`interface` ではなく `type`** で書きます。`interface` には implicit
index signature が付かないので `PluginServiceCalls` 制約を満たしません。

`FOO_KEYS` は `plugins/index.test.ts` が「宣言した契約」と「worker が実際に登録した
名前」を突き合わせるために使います。worker service を持つ plugin を足したら、その
テストの `DECLARED_CALLS` に 1 行足してください。

core の service (`selectObjectMol` など `ServiceMap` にあるもの) はそのまま
`cm.invokeService(...)` で呼べます。plugin 用の client は自分の service 専用です。
