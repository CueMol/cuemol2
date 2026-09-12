# plugin の書き方 (日本語)

[目次に戻る](_index.md)

最小の plugin を 1 本作り、そこに寄与点を足していく形で説明する。
各フィールドの正確な意味は [contributions.md](contributions.md)、関数のシグネチャは
[api.md](api.md) を参照。

---

## 1. 最小形: command 1 本とメニュー項目

「アクティブなシーンのオブジェクト名一覧をクリップボードにコピーする」だけの
plugin を作る。自前の worker service も dialog も無い、いちばん短い完成形
(core の既存 service を 1 本呼ぶだけ)。

### ファイル 2 つ

```
src/plugins/objlist/
  index.ts
  renderer/ObjlistRoot.tsx
```

**`src/plugins/objlist/index.ts`**

```ts
/**
 * @file plugins/objlist/index.ts
 * @description Copy the active scene's object names to the clipboard.
 */

import { definePlugin } from '@renderer/plugin-host/api'
import type { PluginCommandId } from '@renderer/plugin-host/api'
import { ObjlistRoot } from './renderer/ObjlistRoot'

export const COPY_OBJECT_NAMES: PluginCommandId = 'plugin.objlist.copy'

export const objlistPlugin = /* @__PURE__ */ definePlugin({
  manifest: {
    id: 'objlist',
    name: 'Copy Object Names',
    version: '1.0.0',
    description: "Copy the active scene's object names to the clipboard.",
    contributes: {
      commands: [{ id: COPY_OBJECT_NAMES, title: 'Copy Object Names' }],
      menus: [
        {
          group: 'scene',
          separatorBefore: true,
          items: [
            { id: 'copy-object-names', label: 'Copy Object Names', command: COPY_OBJECT_NAMES },
          ],
        },
      ],
    },
  },
  Root: ObjlistRoot,
})
```

**`src/plugins/objlist/renderer/ObjlistRoot.tsx`**

```tsx
/**
 * @file plugins/objlist/renderer/ObjlistRoot.tsx
 * @description Registers the plugin's command. Renders nothing.
 */

import React from 'react'
import { useActiveScene, useCueMol, useRegisterPluginCommand } from '@renderer/plugin-host/api'
import { COPY_OBJECT_NAMES } from '../index'

void React

export const ObjlistRoot: React.FC = () => {
  const { cm } = useCueMol()
  const { activeSceneId } = useActiveScene()

  useRegisterPluginCommand(COPY_OBJECT_NAMES, () => {
    if (!cm || activeSceneId === undefined) return
    // listSceneObjects is a core service (worker/shared/calls/scene.ts).
    cm.invokeService('listSceneObjects', { sceneId: activeSceneId })
      .then((r) => navigator.clipboard.writeText(r.objects.map((o) => o.name).join('\n')))
      .catch((e: unknown) => console.error('copy object names:', e))
  })

  return null
}
ObjlistRoot.displayName = 'ObjlistRoot'
```

### レジストリに登録

**`src/plugins/index.ts`** に 1 行:

```ts
import { objlistPlugin } from './objlist'

export const BUILTIN_PLUGINS: readonly RendererPlugin[] = [
  getPdbPlugin,
  sequencePlugin,
  catalogPlugin,
  objlistPlugin,
]
```

これで Scene メニューに項目が出て、macOS の native menu にも Windows / Linux の
メニューバーにも反映される。`defaultEnabled` も `alwaysEnabled` も書いていないので、
Settings > Plugins にトグルが出て既定オンになる。

core の service は `cm.invokeService(name, args)` で普通に呼べる。使える名前と
引数・戻り値は `worker/shared/calls/` の各スライスにある。

---

## 2. 独自の worker service を足す

C++ を呼ぶなら worker 側にサービスを置く。renderer から C++ wrapper を何度も呼ぶと
1 回ごとに IPC 往復になるので、**ループは worker 側に畳む**のが原則。

```
src/plugins/objlist/
  calls.ts
  worker/
    stats.ts
    stats.service.ts
```

**`worker/stats.ts`** -- サービス本体。core の service と書き方は完全に同じ。

```ts
/**
 * @file plugins/objlist/worker/stats.ts
 * @description How many objects the scene holds.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver'
import { fail, ok } from '@renderer/worker/shared/result'
import type { Result } from '@renderer/worker/shared/result'

export interface GetSceneStatsArgs {
    sceneId: number
}

export type GetSceneStatsResult = Result<{ objectCount: number }>

export function getSceneStats(
    ctx: WorkerContext,
    args: GetSceneStatsArgs,
): GetSceneStatsResult {
    const scene = getSceneOrNull(ctx, args.sceneId)
    if (!scene) return fail('scene not found', 'not-found')
    // getSceneDataJSON gives [sceneNode, ...objectNodes].
    const nodes = JSON.parse(scene.getSceneDataJSON()) as unknown[]
    return ok({ objectCount: Math.max(0, nodes.length - 1) })
}
```

**`worker/stats.service.ts`** -- 登録エントリ。glob が拾うのはこのファイル名。

```ts
import { getSceneStats } from './stats'

export const services = { getSceneStats }

export type * from './stats'
```

**`calls.ts`** -- 呼び出し契約と client。

```ts
import { definePluginServices } from '@renderer/plugin-host/api'
import type { GetSceneStatsArgs, GetSceneStatsResult } from './worker/stats'

// interface ではなく type。implicit index signature が要るため。
export type ObjlistCalls = {
  getSceneStats: { args: GetSceneStatsArgs; result: GetSceneStatsResult }
}

export const OBJLIST_KEYS = ['getSceneStats'] as const satisfies
  readonly (keyof ObjlistCalls)[]

export const objlistServices = definePluginServices<ObjlistCalls>('objlist')
```

呼び出しは `await objlistServices.invoke(cm, 'getSceneStats', { sceneId })`。
worker 側では `plugin.objlist.getSceneStats` という名前で登録されるが、
**prefix を自分で書く必要はない** (glob が付ける)。

最後に `src/plugins/index.test.ts` の `DECLARED_CALLS` に 1 行:

```ts
const DECLARED_CALLS: Record<string, readonly string[]> = {
  sequence: SEQ_KEYS,
  objlist: OBJLIST_KEYS,
}
```

これで「契約に書いた名前」と「worker が実際に登録した名前」が 1 対 1 か検査される。

---

## 3. サイドパネルを足す

manifest に view を宣言し、`panes` に component を置く。

```ts
contributes: {
  views: [
    {
      id: 'objlist',
      title: 'Scene Info',
      icon: 'activity.explorer',     // AppIconKey から選ぶ
      panes: [{ id: 'stats', defaultSize: 200 }],
    },
  ],
},
```

```ts
// definePlugin の引数に足す
panes: { stats: StatsPane },
```

**`renderer/StatsPane.tsx`**

```tsx
import React from 'react'
import {
  PaneSectionHeader,
  useActiveScene,
  useCueMol,
  useLiveFetch,
} from '@renderer/plugin-host/api'
import type { PaneComponent } from '@renderer/plugin-host/api'
import { SEM_OBJECT, SEM_SCENE, SEM_ANY } from '@renderer/event'
import { EVENT_BURST_DEBOUNCE_MS } from '@renderer/utils/timing'
import { objlistServices } from '../calls'

void React

export const StatsPane: PaneComponent = ({ collapsed, onToggleCollapse }) => {
  const { cm } = useCueMol()
  const { activeSceneId } = useActiveScene()

  // Fetch now, and again whenever the scene gains or loses an object. The
  // engine owns the stale-fetch guard; never hand-roll that.
  const { state: count } = useLiveFetch<number>({
    cm,
    initial: 0,
    fallback: 0,
    fetch: () => {
      if (!cm || activeSceneId === undefined) return null
      return objlistServices
        .invoke(cm, 'getSceneStats', { sceneId: activeSceneId })
        .then((r) => (r.ok ? r.objectCount : 0))
    },
    fetchDeps: [activeSceneId],
    listeners: [
      {
        enabled: activeSceneId !== undefined,
        srcMask: SEM_SCENE | SEM_OBJECT,
        evtMask: SEM_ANY,
        scopeId: activeSceneId ?? SEM_ANY,
        debounceMs: EVENT_BURST_DEBOUNCE_MS,
      },
    ],
  })

  return (
    <div className="side-pane">
      <PaneSectionHeader
        title="Scene Info"
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!collapsed && <div className="type-row">{count} objects</div>}
    </div>
  )
}
```

pane の中身は `@renderer/h3-kit/form` などのカタログ部品で組む。サイズや余白を自分で
書かないこと ([ui-style-guide.md](../../migration/ui-style-guide.md))。

CSS が要るなら plugin ディレクトリに `.css` を置き、**plugin の `index.ts` から
import する** (`app.css` には足さない)。plugin を外せば CSS も一緒に落ちる。

---

## 4. ダイアログを足す

core と同じ `createDialogHook` で provider を作り、`Root` で mount する。

```tsx
// renderer/StatsDialogProvider.tsx
export const { Provider: StatsDialogProvider, useShow: useShowStatsDialog } =
  createDialogHook<void, void>({
    name: 'StatsDialog',
    render: ({ visible, resolve }) => (
      <StatsDialog visible={visible} onClose={() => resolve()} />
    ),
  })
```

```tsx
// renderer/ObjlistRoot.tsx
export const ObjlistRoot: React.FC = () => (
  <StatsDialogProvider>
    <ObjlistCommands />
  </StatsDialogProvider>
)
```

**command の登録は provider の内側**に置くこと。`useShowStatsDialog()` はその provider
に対して解決するため。ダイアログ本体は `DialogShell` で組む ([api.md](api.md))。

`useShowErrorAlert` / `useShowFileOpenOptionDialog` / `useStreamProgressDialog` など
core のダイアログは、core 側が常時 mount しているので plugin は何もせず呼べる。

---

## 5. ツールバーボタンを足す

```ts
toolbar: [
  {
    after: 'save-scene',
    items: [
      {
        id: 'copy-object-names',
        icon: 'toolbar.saveScene',
        text: 'Copy Names',
        command: COPY_OBJECT_NAMES,
        requiresScene: true,
      },
    ],
  },
],
```

ブロックの前には自動で divider が入る。

---

## テスト

root `CLAUDE.md` の「テスト方針」がそのまま適用される。**contribution の配線そのものは
テストしない** -- manifest と実体の整合は `plugins/index.test.ts` が全 plugin まとめて
検査しており、寄与点が描かれる経路は host 側のテストが pin している。

plugin 側で書くのは**その plugin の機能の契約**だけ:

| 書くもの | 例 |
|---|---|
| worker service の契約 | 入力に対して何を返すか、undo txn の粒度、失敗時に `fail` を返すこと |
| UI の wire | クリックがどの service をどの引数で呼ぶか |
| 純粋なロジック | URL 組み立て、履歴の LRU、パース |

テストは plugin のディレクトリに置く (`worker/stats.test.ts`、
`renderer/StatsPane.test.tsx`)。worker service のテストは plugin の
`*.service.ts` から `services` を import する:

```ts
import { services } from './stats.service'
const { getSceneStats } = services
```

worker のテストハーネス (`@renderer/worker/testing` の `fakeScene` /
`makeWorkerCtx` など) は plugin からも使える。renderer 側は
`@renderer/__test__/helpers/testHarness` の `makeRenderHook` / `mountTree`。

**plugin service を呼ぶ UI のテストでは、モック `cm` に `invokePluginService` を
生やす** (`invokeService` ではない)。`(pluginId, name, args)` の 3 引数で呼ばれる:

```ts
const cm = {
  invokePluginService: vi.fn(() => Promise.resolve({ ok: true, objectCount: 3 })),
}
// 呼ばれた (name, args) を読む
const calls = cm.invokePluginService.mock.calls.map((c) => [c[1], c[2]])
```

---

## 確認のしかた

root `CLAUDE.md` の検証チェーンどおり:

1. `cd build_scripts && task build_tritium`
2. `cd build_scripts && task run_tritium` -- 起動ログが `launch worker OK` ->
   `INITIALIZED` -> `bindCanvas` -> `shader program created OK` まで進むこと
3. **実機で目視確認**。寄与点が期待の位置に出るか、Settings > Plugins のトグルで
   消える・戻るか
4. 挙動が確定してから `npm test` / `npx tsc -p tsconfig.web.json --noEmit` /
   `pnpm run lint` / `task lint_tritium_style` / `pnpm run lint:comments`

`task run_tritium FRESH=1` で userData を消して起動すると、既定値から始まる状態を
確認できる (`defaultEnabled: false` の plugin を試すときに有用)。

---

## よくある詰まり

| 症状 | 原因 |
|---|---|
| メニュー項目が出ない | `contributes.commands` に宣言していない command を指している。起動時のコンソールに `definePlugin` のエラーが出る |
| 起動直後だけ macOS のメニューに出ない | 仕様。native menu は renderer より先に建ち、寄与が push された時点で再構築される |
| pane が空 | `contributes.views` の `panes[].id` と `panes` のキーが一致していない |
| worker service が「unknown method」 | `*.service.ts` というファイル名になっていない、`export const services` が無い、または名前に自分で `plugin.` を付けている |
| `definePluginServices` が型エラー | 契約を `interface` で書いている。`type` にする |
| dialog の `useShow*` が throw | command の登録が provider の外にある |
| core から plugin を import して ESLint エラー | 正しい挙動。core は plugin の中身を知ってはいけない。共有したいものは core 側へ移す |
