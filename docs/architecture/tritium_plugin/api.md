# API リファレンス (日本語)

[目次に戻る](_index.md)

plugin が使う core の API は **`@renderer/plugin-host/api`** に集めてある。
実体は `tritium/react-gui/src/renderer/plugin-host/api.ts` で、各関数の詳細な
doc comment は実装側にある。

barrel を狭く保つのは意図的で、これが実行時ロード (プラン Phase A) に持ち越せる面。
**ここに無いものを使いたくなったら、まず barrel に足すことを検討する。**

---

## 宣言

### `definePlugin(plugin: RendererPlugin): RendererPlugin`

plugin の宣言点。manifest と実体の食い違いを `console.error` で報告し、plugin を
そのまま返す。呼び出しには pure annotation を付ける ([internals.md](internals.md))。

```ts
export const fooPlugin = /* @__PURE__ */ definePlugin({
  manifest: { id: 'foo', name: 'Foo', version: '1.0.0' },
  Root: FooRoot,
})
```

### `validatePlugin(plugin: RendererPlugin): string[]`

`definePlugin` が内部で使う検査。見つかった問題のメッセージ配列を返す (問題なしなら
空)。`plugins/index.test.ts` が「全 plugin で空であること」を検査している。

検査する内容: id の形式、command id の prefix、command の重複宣言、menu / toolbar が
指す command が宣言されているか、view の pane と bottom tab に component があるか、
settings の key の形式と重複、および `default` の有無 (`secret` は OS キーチェーンに
値があるので `default` を持てず、それ以外の kind は `default` 必須 -- 保存値も既定も
無い行は空欄で描画されるため)。

### 型

| 型 | 用途 |
|---|---|
| `PluginManifest` | manifest ([contributions.md](contributions.md)) |
| `RendererPlugin` | `definePlugin` の引数 |
| `PluginCommandId` | `` `plugin.${string}` `` |
| `PaneComponent` / `PaneComponentProps` | side pane の component と props |
| `BottomTabComponent` / `BottomTabComponentProps` | bottom tab の component と props |
| `PluginSettingDecl` / `PluginSettingControl` | `contributes.settings` の行 |

---

## command レーン

### `useRegisterPluginCommand<TArgs, TResult>(id, handler): void`

```ts
function useRegisterPluginCommand<TArgs = void, TResult = void>(
  id: PluginCommandId,
  handler: (args: TArgs) => TResult | Promise<TResult>,
): void
```

呼び出したコンポーネントが mount されている間だけ command を登録する。handler は ref に
保持されるので、毎 render で作り直しても再登録は起きず、常に最新のクロージャが呼ばれる
(`useRegisterCommand` と同じ契約)。

```ts
useRegisterPluginCommand(FOO_COMMAND, () => {
  showFooDialog().catch((e: unknown) => console.error('foo:', e))
})

// 引数と戻り値に型を付ける場合
useRegisterPluginCommand<{ objId: number }, boolean>(BAR_COMMAND, async (args) => {
  return await doSomething(args.objId)
})
```

### `useCommands()`

command bus 本体。plugin が使うのは主に `dispatchAny` (別の command を呼ぶとき)。

```ts
interface CommandRegistryValue {
  register<K extends CommandKey>(id: K, handler: CommandHandler<K>): () => void
  registerAny(id: PluginCommandId, handler: (args?: unknown) => unknown): () => void
  dispatch<K extends CommandKey>(id: K, ...args): Promise<CommandResult<K>>
  dispatchAny(id: string, args?: unknown): Promise<unknown>
  has(id: string): boolean
}
```

`registerAny` は `useRegisterPluginCommand` が内部で使うので、直接呼ぶ必要は普通ない。
未登録 id への dispatch は reject する。

---

## worker service レーン

### `definePluginServices<M>(pluginId): PluginServiceClient<M>`

```ts
type PluginServiceCalls = Record<string, { args: unknown; result: unknown }>

interface PluginServiceClient<M extends PluginServiceCalls> {
  invoke<K extends keyof M & string>(
    cm: AsyncCueMol,
    name: K,
    args: M[K]['args'],
  ): Promise<M[K]['result']>
}
```

`pluginId` は manifest の id と一致させる (worker 側の登録名を導くディレクトリ名でも
あるため)。`M` は **`type` で書く** -- `interface` には implicit index signature が
付かず制約を満たさない。

```ts
// calls.ts
export type FooCalls = {
  doThing: { args: DoThingArgs; result: DoThingResult }
}
export const fooServices = definePluginServices<FooCalls>('foo')

// 呼び出し側
const r = await fooServices.invoke(cm, 'doThing', { sceneId })
```

`AsyncCueMol` 型も barrel から取れる。core の service はこの client ではなく
`cm.invokeService('name', args)` で直接呼ぶ。

`invoke` は 4 番目に `opts?: InvokeOptions` を取る。今あるのは `quiet` 1 つで、
`{ quiet: true }` はその呼び出しを busy 計上から外す (StatusBar の Busy pill と wait
cursor に出さない)。**自前で進捗を出す長い呼び出し専用**で、既定のままが正しい。

---

## push channel レーン

### `definePluginChannel<T>(pluginId, name): PluginChannel<T>`

```ts
interface PluginChannel<T> {
  /** wire 名 `plugin-channel.<pluginId>.<name>` */
  channel: string
  subscribe(cm: AsyncCueMol, cb: (payload: T) => void): () => void
}
```

service の戻り値ではなく、**実行中に流したいもの** (進捗・streaming delta) 用。
worker 側は `ctx.svc.pushMessage(pluginChannelName(id, name), payload)` で流す
(`worker/shared/pluginCalls.ts`; worker は `plugin-host/api` を import できない)。

```ts
export const fooProgress = definePluginChannel<FooUpdate>('foo', 'progress')
useEffect(() => {
  if (!cm) return
  return fooProgress.subscribe(cm, (u) => { apply(u) })
}, [cm])
```

prefix が service (`plugin.`) と別なのは意図的 ([contributions.md](contributions.md))。

---

## 設定と secret

### `usePluginPrefs(pluginId): PluginPrefs`

```ts
interface PluginPrefs {
  /** manifest の default に、ユーザーが変えた値を重ねたもの */
  prefs: Readonly<Record<string, string | number | boolean>>
  setPref: (key: string, value: string | number | boolean) => void
  /** 読み込み前は false (その間は default が効く) */
  loaded: boolean
}
```

キーは `contributes.settings` で宣言したもの。**既定値は manifest にだけ**書き、
ここでは補わない (`usePluginPrefs` が merge する)。保存は `UiState.pluginPrefs`。

registry は plugin の Root と pane の両方の上にあるので、どちらからでも読める。

### `definePluginSecret(pluginId, key, opts?): PluginSecret`

```ts
interface PluginSecret {
  get(): Promise<{ value: string | null; source: 'stored' | 'env' | 'none' }>
  set(value: string): Promise<{ ok: boolean; error?: string }>
  clear(): Promise<{ ok: boolean; error?: string }>
  status(): Promise<{ source; last4: string | null; encryptionAvailable: boolean }>
}
```

`opts.envVar` を書くと、保存値が無いときその環境変数にフォールバックする。

値は OS のキーチェーン (`safeStorage`) にあり、設定ファイルには入らない。**使う直前に
`get()` し、そのまま渡す** -- React state・ログ・エラーメッセージに残さない。
暗号化できない環境では `set()` が `ok: false` を返す (平文では保存しない)。

---

## undo/redo を止める

### `useSuppressUndoRedo(active: boolean): void`

`active` の間、Undo / Redo を**実行できなくする** (Edit メニュー・Cmd+Z・ツールバー・
履歴 dropdown の全部)。複数の保持者を数えていて、unmount で必ず解放される。

要るのは「複数の変更を 1 つの undo txn に包んでいる最中」だけ。C++ の `UndoManager` は
入れ子の txn を最外側に吸収するので、外側の txn が開いている間に undo を実行すると
ユーザーが見ていない中途半端な状態に戻ってしまう。

**編集そのものは止まらない** (実行中のユーザー操作は同じ txn に入る)。

---

## アプリ状態

### `useCueMol(): { cueMolReady: boolean; cm: AsyncCueMol | null }`

worker へのハンドル。`cm` は起動直後は `null` なので、必ず `if (!cm) return` する。

### `useActiveScene(): { activeSceneId?: number; activeMolViewId?: number; hasScene: boolean }`

いま前面にある molview タブのシーンとビュー。Settings タブや、タブが 1 つも無いときは
両方 `undefined`。

bottom tab の component には同じ値が props で届くので、そちらでは呼ばなくてよい。

### `useEnsureActiveScene(): () => Promise<{ scene_uid: number; view_id: number } | undefined>`

読み込み先のシーンを解決し、**無ければ新しいシーンとタブを作る**。返るのは解決した ids
で、作成に失敗したときだけ `undefined`。

ファイルや構造を読み込む plugin は必ずこれを通す。tritium には暗黙のシーンが無いため、
タブが 1 つも無い状態では `useActiveScene()` が `undefined` を返し、何も起きずに終わって
しまう。

**ダイアログを確定した後に呼ぶ**こと。先に呼ぶと、ユーザがキャンセルしたときに空のタブ
だけが残る。

### `useCueMolEventListener(opts): void`

C++ 側の変更 (オブジェクト追加、プロパティ変更、シーン読み込み) を購読する。

```ts
interface UseCueMolEventListenerOptions {
  cm: AsyncCueMol | null
  enabled?: boolean          // false か cm が null なら no-op。既定 true
  category: string           // 'log' など。source uid で絞るなら ''
  srcMask: number            // SEM_SCENE | SEM_OBJECT | ... の OR
  evtMask: number            // SEM_ADDED / SEM_PROPCHG / ... か SEM_ANY
  scopeId: number            // scene.uid など。全体なら SEM_ANY
  handler: (args: unknown) => void
  debounceMs?: number        // バースト合流。lib/timing.ts の EVENT_BURST_DEBOUNCE_MS を使う
  filter?: (args: unknown) => boolean   // debounce の前に適用される
}
```

定数 (`SEM_ANY` / `SEM_SCENE` / `SEM_OBJECT` / `SEM_RENDERER` / `SEM_VIEW` / `SEM_CAMERA` /
`SEM_STYLE` / `SEM_ANIM` / `SEM_ADDED` / `SEM_REMOVING` / `SEM_PROPCHG` / `SEM_CHANGED`) は
`@renderer/event` から。barrel には入れていない。

購読解除とアンマウント時の競合は hook が面倒を見る。1 回の操作で多数のイベントが飛ぶので、
再取得をつなぐなら `debounceMs` を付ける (詳細は `tritium/CLAUDE.md` の event framework 節)。

---

## pane の部品

### `PaneSectionHeader`

side pane の見出し。`PaneComponent` の props をそのまま渡すのが定型。

```tsx
interface SectionHeaderProps {
  title: string
  icon?: AppIconKey
  actions?: React.ReactNode      // 右端のボタン類
  collapsed?: boolean
  onToggleCollapse?: () => void
  alwaysShowChevron?: boolean
  titleClassName?: string        // weight や letter-spacing の再指定には使わない
}
```

```tsx
export const FooPane: PaneComponent = ({ collapsed, onToggleCollapse }) => (
  <div className="side-pane">
    <PaneSectionHeader title="Foo" collapsed={collapsed} onToggleCollapse={onToggleCollapse} />
    {!collapsed && <FooBody />}
  </div>
)
```

中身のフォームは `@renderer/h3-kit/form` から組む (barrel 経由必須)。

---

## dialog

### `createDialogHook<TArgs, TResult>(options): { Provider, useShow }`

render-prop のダイアログを `show(args) => Promise<result>` に変える。

```ts
interface CreateDialogHookOptions<TArgs, TResult> {
  render: (props: { visible: boolean; args: TArgs | undefined; resolve: (r: TResult) => void }) => React.ReactNode
  name?: string             // エラーメッセージと displayName に使う
  supersededResult?: TResult  // 開いている最中に再度 show されたとき、前の呼び出しに返す値
}
```

```tsx
export const { Provider: FooDialogProvider, useShow: useShowFooDialog } =
  createDialogHook<void, FooResult | null>({
    name: 'FooDialog',
    render: ({ visible, resolve }) => (
      <FooDialog visible={visible} onConfirm={(r) => resolve(r)} onCancel={() => resolve(null)} />
    ),
  })
```

### `createConfirmCancelDialog<TArgs, TResult>(options): { Provider, useShow }`

confirm / cancel 型の定型ラッパ。`show` の引数がそのまま component の props に spread
され、`onConfirm(r)` が `r` で、`onCancel()` が `null` で resolve する。

```ts
createConfirmCancelDialog<FooArgs, FooResult>({ component: FooDialog, name: 'FooDialog' })
```

### `DialogShell`

ダイアログの外枠。テーマ由来の portal class、背景クリックで閉じない設定、body の
ラッパ、エラー行、Cancel / OK フッタ、フレーム幅を持つ。

主な props: `visible`, `title`, `onCancel`, `onOk`, `width` (`'xs'`..`'6xl'`, 既定 `'lg'`),
`okLabel`, `okIntent`, `okDisabled`, `submitting`, `errorMsg`, `children`,
`footerActions` (フッタごと差し替え), `extra` (portal 兄弟), `canEscapeKeyClose`。

幅は px ではなく rung で選ぶ (`--dialog-w-*` トークンに対応)。

### 既存ダイアログの呼び出し

| hook | 返る関数 |
|---|---|
| `useShowErrorAlert()` | `(args: { title, message }) => Promise<void>` |
| `useShowFileOpenOptionDialog()` | `(args: { filePath, sceneId, rendererTypes?, presetTypes?, objType?, readerName? }) => Promise<FileOpenOptions \| null>` |
| `useStreamProgressDialog()` | `StreamProgressApi` |

```ts
interface StreamProgressApi {
  show: (opts: { title: string; onCancel: () => void }) => void
  update: (bytesReceived: number) => void
  setCanceling: () => void
  hide: () => void
}
```

これらは core 側の provider が `DialogContext` で常時 mount されているので、plugin は
`Root` で何も mount せずに `useShow*` を呼べる。

---

## barrel に無いもの

| 使いたいもの | 取り方 |
|---|---|
| フォーム部品・リスト・アイコン | `@renderer/h3-kit/form` / `/list` / `/primitives` などの barrel から直接 |
| イベント定数 (`SEM_*`) | `@renderer/event` |
| core の worker service | `cm.invokeService('name', args)` |
| worker service の DTO 型 | `import type` で `@renderer/worker/server/...` から (値の import は禁止) |
| `Result` / `ok` / `fail` | `@renderer/worker/shared/result` |
| core の command id (`CmdId.UiSettingsTab` など) | `@renderer/commands/ids` |
| IPC channel 定数 | `@shared/ipcChannels` (`window.electronAPI.invoke` 経由。`@main` は禁止) |

---

## worker 側で使うもの

plugin の `worker/` は renderer とは別レイヤなので、barrel ではなく core の worker
ヘルパを直接使う。

| | |
|---|---|
| `WorkerContext` 型 | `@renderer/worker/server/types/WorkerContext` |
| シーン / オブジェクト解決 | `@renderer/worker/server/services/helpers/sceneResolver` の `getSceneOrNull` / `getViewSceneObjOrNull` |
| 選択文字列のコンパイル | `@renderer/worker/server/services/helpers/makeSel` |
| undo トランザクション | `@renderer/worker/server/services/withUndoTxn` の `withUndoTxn` / `undoTxnResult` |
| push channel 名 | `@renderer/worker/shared/pluginCalls` の `pluginChannelName` |
| 戻り値 | `@renderer/worker/shared/result` の `ok` / `fail` / `failFrom` |
| C++ wrapper の型 | `@cuemol/core/src/wrappers/<Class>` (型のみ) |

service の書き方 (同期呼び出し、`Result` を返して例外を投げない、undo txn の粒度) は
core の service と完全に同じ。`tritium/CLAUDE.md` の worker 関連の節がそのまま適用される。
