# AI Agent Prompt Panel を tritium plugin として実装するプラン (260912)

作成日: 2026-09-12。**実装済み** (P0-P5)。実装の所在は
`tritium/react-gui/src/plugins/agent/` と、そこから使う plugin host の拡張。
仕様の説明は [`../architecture/ai-agent-plugin.md`](../architecture/ai-agent-plugin.md)。
本書は着手前の計画として残す。実装中に変えた点は末尾の「11. 実装時の差分」にまとめた。

---

## 1. Context (背景と目的)

`docs/plans/260911-ai-agent-prompt-panel-plan.md` (以下「原プラン」) は、LLM (OpenAI Responses API) が
既存 worker service を tool として呼ぶチャット UI を **core 直書き**で設計していた
(`ActivityView` union / `VIEW_PANES` / `state/AppStateProviders` / `settingsConfig.ts` / agent 専用 IPC 3 本)。
その後 plugin host Phase 0 (`docs/architecture/tritium_plugin/`, PR #614) が入り、機能は
`src/plugins/<id>/` に閉じて manifest で寄与を宣言する形が正になった。

本プランは **原プランの agent 内部設計 (worker 内 loop、1 turn = 1 undo txn、tool 19 本、system prompt、
scene snapshot、toolOutput 正規化) をそのまま採用し、置き場所と core への到達経路だけを plugin 機構に
載せ替える**。plugin 化のために core に足りない受け皿は、agent 専用ではなく **どの plugin も使える汎用の
plugin API 拡張**として追加する (core に `agent` という id を一切書かない)。

### ユーザー決定 (2026-09-12)

| 項目 | 決定 |
|---|---|
| Settings の置き場所 | **Settings タブに寄与点 `contributes.settings` を追加** (pane 内設定ではない) |
| 既定の有効/無効 | **既定オフ (`defaultEnabled: false`, opt-in)** — catalog と同じ扱い |
| plugin API | **必要なら拡張してよい** (汎用性を保ち、plugin id を core に書かない) |
| 原プランの決定 | OpenAI API / worker 内 loop + 1 指示 = 1 undo txn / API キーは main の `safeStorage` / `quiet: true` で呼ぶ、はそのまま |

### 調査で確定した事実 (plugin 化に効くもの)

- **Root と pane は別 subtree**: `PluginRoots` は `renderer/App.tsx:25` で `AppShell` の兄弟、pane は
  `shell/SidePanel.tsx:169-176` が描く。plugin `Root` に置いた React Context は pane に届かない
  → チャット状態は plugin 内の module store (`useSyncExternalStore`) にする。
- **worker → renderer の push channel は全て手配線** (`WorkerTransport.ts:171-253`、`'stream-progress'` /
  `ANIM_PROGRESS_CHANNEL` / `RENDER_PROGRESS_CHANNEL` / `APBS_PROGRESS_CHANNEL` の文字列一致)。それ以外は
  L240-252 で call reply とみなされ、未知 channel は `orphanReplies++` で**黙って捨てられる**。plugin 用レーン無し。
  plugin service の reply も `['plugin.<id>.<name>', seqno, ok, result]` (`WorkerService.ts:227-236`) で届くので、
  push channel の prefix は `plugin.` と**別にする**必要がある。
- `PluginServiceClient.invoke(cm, name, args)` (`plugin-host/pluginServices.ts:33-57`) は `opts` を受けないが、
  `AsyncCueMol.invokePluginService(..., opts?: InvokeOptions)` (`AsyncCueMol.ts:129-136`) と
  `WorkerTransport.invokePluginService` (`:519-529`) は `{ quiet }` を受ける (`invokeService` と同じ busy 計上経路)。
- **Settings に plugin 寄与点は無い**: `PluginContributes` は commands/menus/toolbar/views/bottomTabs のみ
  (`plugin-host/types.ts:76-82`)。Settings は `settingsConfig.ts` の静的 `CATEGORY_TREE` (Plugins は
  `children: []` の leaf, L75-77) + `ALL_LEAF_IDS` (L81-85、`SettingsPane.tsx:234` と `useSettingsPaneNav.ts` が参照)、
  `SettingControl` は select|number|toggle|color|path の 5 種 (L89-94)。Plugins ページの toggle 行は
  `settings/pluginSettings.ts` が registry から生成 (key `plugins.<id>`) — 「生成行」の唯一の先例。
  `SettingsPane.handleChange` (L142-200) は routing table の if-chain、値解決は三項演算子 chain (L339-378)。
  `SettingRow.tsx:89` の `case 'path'` が `window.electronAPI.invoke` を直呼びしている (main に話す control の先例)。
- **plugin 用 prefs は無い**: `UiState` (`shared/types/uiPrefs.ts`) は flat で additive-only、`pluginEnabled?` のみ。
  `PluginProvider.tsx:94-109` が `UI_LOAD` を 1 回読み、`:133-148` で `UI_SAVE { pluginEnabled: next }`。
  `main/stateStore.ts saveUi` は **top-level key の shallow merge**。`PluginProvider.test.tsx:122` は
  `UI_SAVE` payload を `{ pluginEnabled: {...} }` 完全一致で pin している (prefs 保存は別呼び出しにする)。
- **secrets 機構は無い**: `safeStorage` 使用 0 件、`StoreSchema` (`main/stateStore.ts:31-38`) に secrets 無し。
  plugin → main の汎用 channel の先例は `IPC.MENU_SET_PLUGIN_CONTRIBUTIONS` (`main/handlers/menuState.ts:18-20`)。
  plugin renderer から `window.electronAPI.invoke(IPC.X)` を呼ぶことは合法 (`@main` / `electron` import のみ禁止)。
- **undo/redo 抑止機構は無い**: `hooks/useUndoRedoState.ts` が `MENU_UPDATE_STATE {undo,redo}` の唯一の writer
  (`syncNativeMenu` L81-88、`applyState` L90-96)、scene event ごとに再 push (L146-161)。Edit > Undo / Toolbar /
  履歴 dropdown / Cmd+Z は全て `pickUndo` / `pickRedo` (L113-127) に集まる。`ModalOpenCounterContext.tsx`
  (ref-count inc/dec) が最も近い先例。`renderer/index.tsx:63-65` で `AppStateProviders` (UndoRedoProvider を含む) を
  包める位置がある。
- ESLint (`eslint.config.mjs`): plugin worker (`:293-310`) は `@plugins/*/renderer/**` と UI tree を禁止するが
  **同 plugin の `../shared/*` は可**。plugin renderer (`:312-330`) は `@renderer/**` を自由に import できる
  (`api.ts` barrel は「意図」で強制ではない)。`@renderer/dialogs/**` は worker の ban list に無い (2026-08 の
  `components/` → `dialogs/` リネームで抜けた穴)。
- `plugins/getpdb/renderer/pdbUrls.ts` の RCSB URL builder は `./GetPdbDialog` (React ファイル) から型を import して
  おり、plugin worker からは import 不可 → core `worker/shared/` へ移す。原プランが参照していた
  `useSceneCommands.ts:450-456` の URL 直書きは既に存在しない。
- headless な `FileOpenOptions` 組み立てに要る純関数 (`formatKindForReader` / `mapReaderDefaultsToFormatOptions` /
  `getDefaultRendererOptions` / `buildDefaultFormatOptions`) は `renderer/dialogs/fopen-opt-dlgs/types.ts`
  (runtime import ゼロ) にある → `worker/shared/fileOpenDefaults.ts` へ移設し re-export。
- `h3-kit/form` に `TextAreaField` は無く、`TextField` に `password` prop も無い。`appIcons.ts` に AI 系アイコン無し
  (`activity.*` は L128-132)。
- `openai` は未導入。worker bundle は IIFE で、plugin worker から import した npm 依存は inline される
  (`@plugins` alias は `rendererAlias` 経由で worker でも解決)。
- worker test harness: `makeWorkerCtx({ extra: { svc: { pushMessage: vi.fn() } } })`、`fakeScene().undo`
  (`{ started, committed, rolledBack, open }`)。`src/main/*.test.ts` も vitest 対象 (`textContextMenu.test.ts:27` が
  `vi.mock('electron', ...)` の先例)。
- `plugins/index.test.ts:53-64` は既存 3 plugin の切り替え方針を個別に pin している。

---

## 2. アーキテクチャ概要

```
renderer                                          Web Worker                            main
+-- src/plugins/agent/renderer -----------+  invokePluginService  +-- plugins/agent/worker -----+  IPC  +-- main --------------+
| AgentRoot (PluginRoots 配下, UI なし)     | --------------------> | plugin.agent.runTurn        |       | SECRET_GET/SET/STATUS|
|  useAgentTurnRunner                     |  {quiet:true}         |  turnLoop (Responses API)   |       |  secretStore         |
|   - agentProgress.subscribe(cm, ...)    | <-------------------- |  tools/* -> core service 直呼|       |  (safeStorage)       |
|   - useSuppressUndoRedo(running)        |  [plugin-channel.     |  1 turn = 1 undo txn        |       |  StoreSchema.secrets |
|   - agentApiKey.get() (IPC)             |   agent.progress, u]  |  ctx.svc.pushMessage(...)   |       +----------------------+
|   - usePluginPrefs('agent')             |                       |  plugin.agent.cancelTurn    |       | UI_LOAD / UI_SAVE    |
| agentSessionStore (module store)        |                       +-----------------------------+       |  UiState.pluginPrefs |
| AgentChatPane (SidePanel 配下)          |                                                             +----------------------+
+-----------------------------------------+
```

- core が得る**汎用**拡張は 6 つ (A1〜A6): plugin push channel レーン / `invoke` の `opts` / plugin prefs /
  settings 寄与点 / 汎用 secrets IPC / undo-redo lock。
- agent 固有物は `src/plugins/agent/` に閉じる。core 側で agent のために触るのは、アイコン 1 キー、form-kit 部品 2 つ、
  `pdbUrls` / `fileOpenDefaults` の shared 化、`plugins/index.ts` + `index.test.ts` の登録行、`package.json` の `openai`。

---

## 3. 設計判断 A: plugin host API 拡張 (汎用)

### A1. plugin push channel レーン (worker → renderer)

`renderer/worker/shared/pluginCalls.ts` (`isPluginServiceName` の後):
```ts
/** Prefix of a push channel a plugin worker service streams on. Distinct from
 *  PLUGIN_SERVICE_PREFIX: a service reply also arrives as
 *  ['plugin.<id>.<name>', seqno, ok, result] and must keep reaching the reply path. */
export const PLUGIN_CHANNEL_PREFIX = 'plugin-channel.'
export function pluginChannelName(pluginId: string, name: string): string  // `plugin-channel.<id>.<name>`
export function isPluginChannel(method: unknown): method is string
```

`renderer/worker/client/WorkerTransport.ts`:
- L132 の後: `private _pluginChannelListeners = new Map<string, Set<PluginChannelListener>>()`
  (`export type PluginChannelListener = (payload: unknown) => void`)
- **APBS 分岐 (L231-238) の直後、reply fallback (L240) の直前**に分岐を 1 つ追加:
  wire は `['plugin-channel.<id>.<name>', payload]`、listener 各呼び出しは try/catch で `log.warn`。
- `subscribeApbsProgress` (L293-296) の後: `subscribePluginChannel(channel, cb): () => void`
  (Set を lazily 作り、unsubscribe で空になれば Map から削除)。
- `renderer/worker/client/AsyncCueMol.ts` L95-97 の隣に facade `subscribePluginChannel(channel, cb)`。

`renderer/plugin-host/pluginChannels.ts` (新):
```ts
export interface PluginChannel<T> {
  /** Wire name, `plugin-channel.<pluginId>.<name>`. The worker half pushes on it via ctx.svc.pushMessage. */
  channel: string
  subscribe(cm: AsyncCueMol, cb: (payload: T) => void): () => void
}
export function definePluginChannel<T>(pluginId: string, name: string): PluginChannel<T>
```
`api.ts` に `// --- The push-channel lane ---` 節として `definePluginChannel` / `type PluginChannel` を export。

worker 側 (plugin) は `plugin-host/api` を import できないので、`worker/shared/pluginCalls.ts` の
`pluginChannelName()` で同じ名前を導出し `ctx.svc.pushMessage(channel, update)` する。

### A2. `PluginServiceClient.invoke` に `opts?: InvokeOptions`

`plugin-host/pluginServices.ts:32-38` (interface) と `:45-57` (実装) に第 4 引数を足し、
`cm.invokePluginService(pluginId, name, args, opts)` へ渡す。`api.ts` に
`export type { InvokeOptions } from '@renderer/worker/client/WorkerTransport'`。テスト不要 (型で保証)。

### A3. plugin prefs (`UiState.pluginPrefs` + `usePluginPrefs`)

`shared/types/uiPrefs.ts` `UiState` 末尾 (`pluginEnabled?` の直後、additive):
```ts
export type PluginPrefValue = string | number | boolean
/** Per-plugin preferences: plugin id -> (key declared in contributes.settings -> value).
 *  The whole map is rewritten on every change; main's saveUi merges top-level keys only. */
pluginPrefs?: Record<string, Record<string, PluginPrefValue>>
```

`plugin-host/PluginProvider.tsx`:
- `PluginContextValue` (L43-55) に `prefs: PluginPrefsMap; prefsLoaded: boolean; setPref(pluginId, key, value): void`。
  `EMPTY_VALUE` (L67-74) に `prefs: {}`, `prefsLoaded: false`, `setPref: noop`。
- `useState<PluginPrefsMap>(NO_PREFS)` を追加し、既存 load effect (L93-109) の L102 の次に
  `if (ui?.pluginPrefs) setPrefs(ui.pluginPrefs)`。`loaded` を `prefsLoaded` として公開。
- `setPref` は `setEnabled` (L133-148) と同型: updater 内で `next = { ...prev, [pluginId]: { ...prev[pluginId], [key]: value } }`、
  同値なら `prev` を返し、変わった時だけ **`UI_SAVE { pluginPrefs: next }` (map 全体、`pluginEnabled` と混ぜない)**。
- `value` memo (L150-160) の deps に追加。

`plugin-host/usePluginPrefs.ts` (新):
```ts
export interface PluginPrefs {
  /** Stored values merged over the defaults the plugin's manifest declares in contributes.settings. */
  prefs: Readonly<Record<string, PluginPrefValue>>
  setPref: (key: string, value: PluginPrefValue) => void
  loaded: boolean
}
export function usePluginPrefs(pluginId: string): PluginPrefs
```
`available.find(id)?.manifest.contributes?.settings` の `default` を下敷きにして merge するので、
**既定値は manifest の 1 箇所**で済む (plugin 側で defaults を二重に持たない)。
`api.ts` に `usePluginPrefs` / `type PluginPrefs` / `type PluginPrefValue` を export。
PluginProvider は `renderer/index.tsx:45` で Root と pane の両方の上にあるので、どちらからでも読める。

### A4. settings 寄与点 (`contributes.settings`)

**型の置き場**: 新 `renderer/features/settings/settings/settingControl.ts` に `SettingControl` を移し
(現 `settingsConfig.ts:89-94`)、2 kind を追加:
```ts
export type SettingControl =
  | { kind: 'select'; options: string[]; renderInOwnFont?: boolean }
  | { kind: 'number'; min: number; max: number; step: number; unit?: string }
  | { kind: 'toggle' }
  | { kind: 'color' }
  | { kind: 'path'; directory?: boolean }
  | { kind: 'text'; placeholder?: string; mono?: boolean }
  | { kind: 'secret'; namespace: string; envVar?: string }
/** What a plugin writes: 'secret' without namespace (the resolver fills in the plugin id). */
export type PluginSettingControl =
  | Exclude<SettingControl, { kind: 'secret' }>
  | { kind: 'secret'; envVar?: string }
```
`settingsConfig.ts` は `export type { SettingControl } from './settingControl'` で既存 importer を維持。
`plugin-host/types.ts` は `import type { PluginSettingControl }` を settingControl.ts から取る
(`settingsConfig.ts` は contexts / worker 型を import する重いモジュールなので名指ししない)。

`plugin-host/types.ts`:
```ts
export interface PluginSettingDecl {
  /** [a-zA-Z][a-zA-Z0-9]*, no dots. Becomes the key under UiState.pluginPrefs[pluginId]. */
  key: string
  label: string
  description: string
  control: PluginSettingControl
  /** Required unless control.kind === 'secret' (secrets never live in prefs). */
  default?: PluginPrefValue
}
// PluginContributes (L76-82): settings?: PluginSettingDecl[]
export interface ResolvedPluginSetting extends Omit<PluginSettingDecl, 'control'> {
  pluginId: string
  pluginName: string
  control: SettingControl   // secret には namespace が入っている
}
// PluginContributions (L167-172): settings: ResolvedPluginSetting[]
```
- `pluginSelect.ts`: `EMPTY_CONTRIBUTIONS` (L65-70) に `settings: []`、`collectContributions` (L79-108) で
  `settings` を pluginId / pluginName 付きで push (secret は `namespace: manifest.id` を補う)。
- `definePlugin.ts validatePlugin` (L57-68 の後): key 形式・重複、`secret` に `default` あり / 非 secret に `default` 無し、をエラーに。

**Settings 側の消費 (汎用)** — `features/settings/settings/pluginSettings.ts` に追加:
```ts
export const PLUGINS_CATEGORY = 'plugins.installed'     // 旧 'plugins' (toggle 行の leaf)
export const PLUGIN_PREF_SETTING_PREFIX = 'plugin.'      // 寄与 setting 行の key `plugin.<id>.<key>` (command/service レーンと同形)
export function pluginPrefFromSettingKey(key: string): { pluginId: string; prefKey: string } | null
export function pluginPrefSettingDefs(settings: readonly ResolvedPluginSetting[]): SettingDef[]  // category `plugins.<id>`
export function buildCategoryTree(switchable: readonly RendererPlugin[], settings: readonly ResolvedPluginSetting[]): CategoryNode[]
```
- `buildCategoryTree` は `CATEGORY_TREE` をコピーし、`plugins` 親ノードの children を
  `[Installed leaf (switchable > 0 のとき), ...settings を pluginId で group した leaf { id: 'plugins.<id>', label: pluginName }]`
  に差し替え、children が空なら `plugins` ノードを落とす (現 `SettingsPane.tsx:115-121` の filter を吸収)。
- 既存 toggle key `plugins.<id>` (`PLUGIN_SETTING_PREFIX = 'plugins.'`) と寄与 key `plugin.<id>.<key>` は prefix が違い衝突しない。
- 有効な plugin の寄与だけが `contributions` に入るので「有効中だけ leaf を表示」は自動。

`settingsConfig.ts`: `CATEGORY_TREE` L75-77 を `{ id: 'plugins', ..., children: [{ id: 'plugins.installed', label: 'Installed', icon: 'settings.plugins', children: [] }] }` に。
`ALL_LEAF_IDS` を `export function leafIds(tree)` に括り出し (`ALL_LEAF_IDS = leafIds(CATEGORY_TREE)` は
`useSettingsPaneNav` の既定用に残す)。`buildLabelMap` (L292) を export。`SettingDef.default?: PluginPrefValue` を optional 追加。

`SettingsPane.tsx`:
- L107: `usePlugins()` から `prefs` / `setPref` も取り、`usePluginContributions().settings` を読む。
- L108-111: `allSettings = [...SETTINGS, ...pluginSettingDefs(switchable), ...pluginPrefSettingDefs(pluginSettings)]`。
- L115-121: `categoryTree = buildCategoryTree(...)`、`allLeafIds = leafIds(categoryTree)`、`labels = buildLabelMap(categoryTree)`
  (L234 の `ALL_LEAF_IDS`、L336 の `CATEGORY_LABELS` を差し替え)。
- `handleChange` (L142-200): L185 の toggle 分岐の**前**に
  `const pref = pluginPrefFromSettingKey(key); if (pref) { setPref(pref.pluginId, pref.prefKey, value); return }`。
- 値解決 (L351-378): pref 行は `secret ? '' : prefs[pluginId]?.[prefKey] ?? def.default`。

`SettingRow.tsx` (switch L40-107) に 2 case:
- `case 'text'`: `<TextField value onChange placeholder mono />` (keystroke ごとに永続化。`ApbsConfigContext.tsx:98-102` と同じ)。
- `case 'secret'`: 新 `settings/SecretSettingControl.tsx` — mount 時 `IPC.SECRET_STATUS` → 状態行
  ("Stored (....ab12)" / "Using OPENAI_API_KEY" / "Not set" / 暗号化不可なら "Encryption unavailable; set <ENV> instead")、
  `TextField password` の draft、Save (Enter / blur、空は無視) → `SECRET_SET`、`FormButton Clear` → `SECRET_SET { value: '' }`。
  レイアウトは `.config-setting-path-row` (`config-pane.css`) を共用。`window.electronAPI.invoke` 直呼びは `case 'path'` と同じ流儀。

`plugin-host/index.ts` (core barrel) に `ResolvedPluginSetting`、`api.ts` に `PluginSettingDecl` / `PluginSettingControl` を export。

### A5. 汎用 secrets IPC (renderer ↔ main)

`shared/types/secrets.ts` (新):
```ts
export type SecretSource = 'stored' | 'env' | 'none'
export interface SecretRef { namespace: string; key: string; envVar?: string }
export interface SecretSetReq extends SecretRef { /** '' clears */ value: string }
export interface SecretGetRes { value: string | null; source: SecretSource }
export interface SecretSetRes { ok: boolean; error?: string }
export interface SecretStatusRes { source: SecretSource; last4: string | null; encryptionAvailable: boolean }
```
- `shared/ipcChannels.ts` L36 の後: `SECRET_GET: 'secret:get'`, `SECRET_SET: 'secret:set'`, `SECRET_STATUS: 'secret:status'`。
  `shared/ipcContract.ts InvokeChannels` L88 の後に 3 行。
- `main/stateStore.ts`: `StoreSchema` (L31-38) に `secrets?: Record<string, string>` (safeStorage 暗号化 + base64、
  key `${namespace}.${key}`)、`loadSecretEnc(id)` / `saveSecretEnc(id, enc | null)`。
- `main/secretStore.ts` (新): `secretId(ref)`、純関数 `resolveSecret({ stored, env }): SecretGetRes` (stored > env > none)、
  `encryptSecret(plain): string | null` (`!safeStorage.isEncryptionAvailable()` → null)、`decryptSecret(b64): string | null`
  (壊れた値は none 扱い)、`getSecret(ref)` / `setSecret(req)` / `secretStatus(ref)`。
  `setSecret`: `value === ''` → 削除。暗号化不可 → `{ ok: false, error: 'Encryption is not available on this system; set the environment variable instead.' }`
  (**平文保存しない**)。`envVar` 未指定なら env を見ない。復号したキー文字列はログに出さない。
- `main/handlers/secrets.ts` (新) `registerSecretHandlers()` (`menuState.ts:13-21` と同型、`handleInvoke` 3 本)。
  `main/ipcHandlers.ts` の登録集約点 (L37-46) に 1 行。
- `plugin-host/pluginSecrets.ts` (新):
  ```ts
  export interface PluginSecret {
    get(): Promise<SecretGetRes>; set(value: string): Promise<SecretSetRes>
    clear(): Promise<SecretSetRes>; status(): Promise<SecretStatusRes>
  }
  export function definePluginSecret(pluginId: string, key: string, opts?: { envVar?: string }): PluginSecret
  ```
  中身は `window.electronAPI?.invoke(IPC.SECRET_*, { namespace: pluginId, key, envVar })`。`electronAPI` 不在 (Vite dev)
  は `{ value: null, source: 'none' }` 等に落とす。`api.ts` に `// --- Secrets ---` 節で export。
- 設計メモ: renderer は信頼境界内 (remote content を読み込まない) なので、`envVar` を renderer から指定する形で問題ない。

### A6. undo/redo 抑止 (`useSuppressUndoRedo`)

`renderer/contexts/UndoRedoLockContext.tsx` (新): `ModalOpenCounterContext.tsx:32-69` と同じ ref-count だが
**count を `useState` に置き** consumer を再 render させる。
```ts
export const UndoRedoLockProvider: React.FC<{ children: React.ReactNode }>
export function useUndoRedoLocked(): boolean                 // provider 外は false
export function useSuppressUndoRedo(active: boolean): void   // useEffect: active なら acquire、cleanup で release
```
- mount: `renderer/index.tsx:63-65` を `<UndoRedoLockProvider><AppStateProviders><App /></AppStateProviders></UndoRedoLockProvider>` に
  (UndoRedoProvider は `AppStateProviders` 内、plugin Root は `App.tsx:25`、pane は AppShell 配下 — いずれも内側)。
- `hooks/useUndoRedoState.ts`:
  - `const locked = useUndoRedoLocked()`、`lockedRef = useLatestRef(locked)`、`rawRef = useRef(EMPTY)`。
  - `applyState` (L90-96): `rawRef.current = s` を保存し、`u = s.canUndo && !lockedRef.current` / `r = s.canRedo && !lockedRef.current`
    で state と `syncNativeMenu(u, r)` を更新。
  - 新 effect `useEffect(() => { applyState(rawRef.current) }, [locked, applyState])` — lock 変化時に `MENU_UPDATE_STATE` を再 push。
  - `pickUndo` / `pickRedo` (L113-127) 先頭に `if (lockedRef.current) return` — `CmdId.Undo/Redo` handler、Toolbar、
    履歴 dropdown、Cmd+Z を **1 箇所で**無効化。
- `api.ts` に `useSuppressUndoRedo` を export。

---

## 4. 設計判断 B: agent plugin (`src/plugins/agent/`)

### 4.1 ディレクトリ構成

```
src/plugins/agent/
  index.ts                       definePlugin (pure annotation)。manifest: views + settings。import './renderer/agent-chat.css'
  calls.ts                       AgentCalls (type) / AGENT_KEYS / agentServices / agentProgress / agentApiKey
  shared/agentTypes.ts           AGENT_PLUGIN_ID = 'agent', AGENT_PROGRESS_CHANNEL = pluginChannelName(AGENT_PLUGIN_ID, 'progress'),
                                 AgentProgressUpdate union, AgentRunTurnArgs / AgentRunTurnResult, AgentUsage,
                                 AgentInputItem (openai の型を type import), DEFAULT_AGENT_MODEL, ReasoningEffort,
                                 AGENT_SETTINGS (manifest の settings 配列の元: key / default の唯一の定義)
  worker/agent.service.ts        export const services = { runTurn, cancelTurn }; export type * from '../shared/agentTypes'
  worker/turnLoop.ts             loop 本体・txn・activeTurns Map<turnId, AbortController>・progress push・deps.createClient DI
  worker/openaiClient.ts         createOpenAIClient(apiKey) (dangerouslyAllowBrowser: true, maxRetries: 2)
  worker/toolOutput.ts           3 方言正規化 + JSON 直列化 (truncate / 8 KB cap)
  worker/sceneSnapshot.ts
  worker/prompt/systemPrompt.ts, prompt/selectionCheatSheet.ts
  worker/tools/types.ts, index.ts (AGENT_TOOLS name 昇順, toOpenAIFunctionTools),
               {scene,selection,renderer,file,analysis}Tools.ts, defaultFileOpenOptions.ts   (*.service.ts と命名しない)
  renderer/agentSessionStore.ts  module store + useAgentSession() (useSyncExternalStore)
  renderer/useAgentTurnRunner.ts Root 専用 hook: send / stop を store に登録、progress 購読、useSuppressUndoRedo(running)
  renderer/AgentRoot.tsx         UI なし。useAgentTurnRunner() のみ
  renderer/AgentChatPane.tsx / AgentTranscript.tsx / agent-chat.css
```
- `worker/` → `../shared/agentTypes` の import は可 (ban は `@plugins/*/renderer/**` のみ、相対 2 階層は `NO_DEEP_RELATIVE` にも触れない)。
  `shared/agentTypes.ts` は `openai` の型と `@renderer/worker/shared/*` だけを import する (React 禁止)。
- **`calls.ts`**:
  ```ts
  export type AgentCalls = {
    runTurn:    { args: AgentRunTurnArgs;   result: AgentRunTurnResult }
    cancelTurn: { args: { turnId: string }; result: Result }
  }
  export const AGENT_KEYS = ['runTurn', 'cancelTurn'] as const satisfies readonly (keyof AgentCalls)[]
  export const agentServices = definePluginServices<AgentCalls>(AGENT_PLUGIN_ID)
  export const agentProgress = definePluginChannel<AgentProgressUpdate>(AGENT_PLUGIN_ID, 'progress')  // .channel === AGENT_PROGRESS_CHANNEL
  export const agentApiKey  = definePluginSecret(AGENT_PLUGIN_ID, 'openaiApiKey', { envVar: 'OPENAI_API_KEY' })
  ```
- **manifest**:
  ```ts
  manifest: {
    id: 'agent', name: 'AI Agent (OpenAI)', version: '1.0.0',
    description: 'Chat panel that drives the scene through an OpenAI model calling the worker services.',
    defaultEnabled: false,
    contributes: {
      views: [{ id: 'agent', title: 'AI Agent', icon: 'activity.agent', panes: [{ id: 'chat', defaultSize: 600 }] }],
      settings: [
        { key: 'model', label: 'Model', description: 'OpenAI model id used for each turn.',
          control: { kind: 'text', mono: true }, default: DEFAULT_AGENT_MODEL },
        { key: 'reasoningEffort', label: 'Reasoning effort', description: '...',
          control: { kind: 'select', options: ['default', 'low', 'medium', 'high'] }, default: 'low' },
        { key: 'openaiApiKey', label: 'OpenAI API key',
          description: 'Stored encrypted with the OS keychain (safeStorage). Falls back to OPENAI_API_KEY.',
          control: { kind: 'secret', envVar: 'OPENAI_API_KEY' } },
      ],
    },
  },
  Root: AgentRoot, panes: { chat: AgentChatPane },
  ```
  `plugins/index.test.ts:53-64` に `expect(byId.agent?.alwaysEnabled).toBeUndefined(); expect(byId.agent?.defaultEnabled).toBe(false)` を追加。

### 4.2 Root / pane / store の役割

- `agentSessionStore.ts` は module-level store: `{ transcript, history (OpenAI input items), running, turnId, runner: { send, stop } | null }`
  と reducer (`text_delta` は streaming 中の assistant 行へ追記、`tool_call` / `tool_result` は `callId` で対応付け)。
  `useAgentSession()` は `useSyncExternalStore` で読む。
- `useAgentTurnRunner` (Root):
  1. `agentProgress.subscribe(cm, (u) => u.turnId === current && store.applyProgress(u))`。
  2. `send(text)`: `useEnsureActiveScene()` で `{ scene_uid, view_id }` を確保 → `agentApiKey.get()` → `value === null` なら
     error 行 + 「Open Settings」ボタン (`useCommands().dispatch(CmdId.UiSettingsTab)`; `CmdId` は `@renderer/commands/ids`。
     barrel 外なので api.md「barrel に無いもの」に 1 行追記) → `agentServices.invoke(cm, 'runTurn', { turnId, sceneId, viewId,
     userText, history, apiKey, model, reasoningEffort }, { quiet: true })` (A2)。model / effort は `usePluginPrefs('agent').prefs`。
     結果 `appended` を history へ、`fail` は error 行、`code === 'canceled'` は "Stopped"。
  3. `stop()`: `agentServices.invoke(cm, 'cancelTurn', { turnId })`。
  4. `useSuppressUndoRedo(running)` (A6)。
  5. effect cleanup (= plugin 無効化 mid-turn、`contributions.md:64-67` の警告) で `stop()` と `store.reset()`。
- `AgentChatPane` (`PaneComponent`): `PaneSectionHeader` + transcript + composer (`TextAreaField`、Enter 送信 / Shift+Enter 改行、
  Send / Stop は `FormButton`)。active scene 無し → composer 無効。auto-scroll は `LogPanel.tsx:55-61` 方式。

### 4.3 worker 側 (原プラン §3.1〜3.4 を踏襲、差分のみ)

- progress push: `ctx.svc.pushMessage(AGENT_PROGRESS_CHANNEL, update)` (`renderjob/jobRegistry.ts:36-39` と同型)。
- `fetch_pdb` の URL: `@renderer/worker/shared/pdbUrls.ts` (§4.4 で移設) の `pickCoordUrl(pdbId, format === 'pdb' ? 'RCSB_PDB' : 'RCSB_CIF')`。
  `reqId = ${turnId}:${callId}`、cancel は `ac.abort()` + `cancelStream(reqId)` (`helpers/streamFetchToReader.ts:94-99`)。
- headless `FileOpenOptions`: `worker/tools/defaultFileOpenOptions.ts`
  ```ts
  export function buildHeadlessFileOpenOptions(ctx, a: { readerName; objectName; rendererType: string | null; selection: string | null }): FileOpenOptions {
    const kind = formatKindForReader(a.readerName)
    const d = getReaderDefaultOptions(ctx, { nickname: a.readerName })          // core service を直呼び
    const format = d.ok ? mapReaderDefaultsToFormatOptions(kind, d.values) : buildDefaultFormatOptions(kind)
    const renderer = { ...getDefaultRendererOptions(a.objectName, a.rendererType ?? undefined),
                       objectName: a.objectName, selectionEnabled: a.selection !== null, selection: a.selection ?? '*' }
    return { format, renderer }
  }
  ```
  純関数は `@renderer/worker/shared/fileOpenDefaults.ts` (§4.4) から import。

### 4.4 core 側で agent が正当に必要とする編集

| 対象 | 変更 |
|---|---|
| `renderer/h3-kit/primitives/appIcons.ts` | Phosphor import に `Sparkle`、`activity.*` block (L128-132) に `"activity.agent": { lib: "phosphor", Comp: Sparkle }` |
| `renderer/h3-kit/form/TextAreaField.tsx` (新) + `form/index.ts` + `styles/_form-kit.css` | props `value, onChange, placeholder?, disabled?, mono?, minRows?, maxRows?, onKeyDown?, autoFocus?`。1〜6 行 auto-grow。サイズは `.h3-form-textarea` に 1 定義 (`--field-*` トークン) |
| `renderer/h3-kit/form/TextField.tsx` (L12-33 / L50-66) | `password?: boolean` → `InputGroup type="password"` (サイズ不変) |
| `plugins/catalog/renderer/CatalogPane1.tsx` | `TextAreaField` 1 例 + `TextField password` 1 例 |
| `docs/migration/ui-style-guide.md` form-kit 表 | `TextAreaField` 行、`TextField` 行に `password` 注記 |
| `renderer/worker/shared/pdbUrls.ts` (新) | `CoordServerType` / `CoordUrlSpec` / `pickCoordUrl` を `plugins/getpdb/renderer/pdbUrls.ts:13-36` から移設。getpdb 側は re-export (`pickMapUrl` は残置)、`GetPdbDialog.tsx` の `CoordServerType` は shared から re-export (`useGetPdbCommand.ts` 無変更) |
| `renderer/worker/shared/fileOpenDefaults.ts` (新) | `formatKindForReader` / `mapReaderDefaultsToFormatOptions` / `getDefaultRendererOptions` / `buildDefaultFormatOptions` を `dialogs/fopen-opt-dlgs/types.ts` から移設し、同ファイルは re-export (同ファイル冒頭が `fileOpenTypes` について記録している移設パターン) |
| `eslint.config.mjs` (任意 hardening) | worker/server と plugin worker の ban list に `'@renderer/dialogs/**', '**/dialogs/**'` (既存違反が無いことを `npm run lint` で確認) |
| `package.json` | `devDependencies` に `openai` (`cd tritium/react-gui && pnpm add -D openai`)。worker IIFE に inline。Rollup が `node:*` 未解決を警告した名前だけ `electron.vite.config.ts` の `workerExternal` / `workerGlobals` へ |
| `plugins/index.ts` (L24-28) | `agentPlugin` 追加 |
| `plugins/index.test.ts` (L20-22, L53-64) | `DECLARED_CALLS.agent = AGENT_KEYS` (無いと parity test が落ちる)、switchability 2 行 |

---

## 5. 追加する契約行 (型契約マップ)

| 境界 | マップ | 追加行 |
|---|---|---|
| renderer ↔ worker (plugin service) | `plugins/agent/calls.ts` `AgentCalls` + `AGENT_KEYS`; `plugins/index.test.ts DECLARED_CALLS.agent` | `runTurn: { args: AgentRunTurnArgs; result: AgentRunTurnResult }`, `cancelTurn: { args: { turnId }; result: Result }` (wire 名 `plugin.agent.runTurn` / `plugin.agent.cancelTurn`) |
| worker → renderer push (汎用レーン) | `worker/shared/pluginCalls.ts` | `PLUGIN_CHANNEL_PREFIX = 'plugin-channel.'`, `pluginChannelName()`, `isPluginChannel()`; wire `[channel, payload]` |
| worker → renderer push (agent) | `plugins/agent/shared/agentTypes.ts` | `AGENT_PROGRESS_CHANNEL`, `AgentProgressUpdate` union (`status {phase}` / `text_delta {delta}` / `tool_call {callId,name,input}` / `tool_result {callId,name,ok,mutates,summary}`、全て `turnId`) |
| plugin → host (client) | `plugin-host/pluginServices.ts` | `invoke(cm, name, args, opts?: InvokeOptions)` |
| manifest 寄与点 | `plugin-host/types.ts` `PluginContributes` / `PluginContributions` | `settings?: PluginSettingDecl[]` / `settings: ResolvedPluginSetting[]` |
| settings 描画 | `features/settings/settings/settingControl.ts` | `{ kind: 'text'; placeholder?; mono? }`, `{ kind: 'secret'; namespace; envVar? }`; `SettingDef.default?` |
| 設定永続化 | `shared/types/uiPrefs.ts UiState` | `pluginPrefs?: Record<string, Record<string, PluginPrefValue>>` (additive) |
| renderer ↔ main | `shared/ipcChannels.ts` + `shared/ipcContract.ts InvokeChannels` + `shared/types/secrets.ts` | `SECRET_GET { req: SecretRef; res: SecretGetRes }`, `SECRET_SET { req: SecretSetReq; res: SecretSetRes }`, `SECRET_STATUS { req: SecretRef; res: SecretStatusRes }` |
| main store | `main/stateStore.ts StoreSchema` | `secrets?: Record<string, string>` (base64 encrypted, key `${namespace}.${key}`) |
| renderer ↔ main (既存) | `MENU_UPDATE_STATE { undo, redo }` | 行追加なし。lock 中は `enabled: false` を push し、解除時に再 push (挙動追加) |
| api barrel | `plugin-host/api.ts` | `definePluginChannel`, `PluginChannel`, `InvokeOptions`, `usePluginPrefs`, `PluginPrefs`, `PluginPrefValue`, `PluginSettingDecl`, `PluginSettingControl`, `definePluginSecret`, `PluginSecret`, `useSuppressUndoRedo` |
| コマンド | `commands/ids.ts` / `CommandMap.ts` | **追加しない** (原プラン踏襲。Settings を開くのは既存 `CmdId.UiSettingsTab`) |

---

## 6. ファイル一覧 (`tritium/react-gui/src/` 相対。(新) = 新規、(改) = 変更)

### host (plugin-host / transport / settings / undo / h3-kit / shared 移設)
- (改) `renderer/worker/shared/pluginCalls.ts` — channel prefix + `pluginChannelName` / `isPluginChannel`
- (改) `renderer/worker/client/WorkerTransport.ts` — listener Map、分岐 (L238-240 間)、`subscribePluginChannel`
- (改) `renderer/worker/client/AsyncCueMol.ts` — `subscribePluginChannel` facade
- (改) `renderer/plugin-host/pluginServices.ts` — `opts?: InvokeOptions`
- (新) `renderer/plugin-host/pluginChannels.ts`, `pluginSecrets.ts`, `usePluginPrefs.ts`
- (改) `renderer/plugin-host/types.ts`, `pluginSelect.ts`, `definePlugin.ts`, `PluginProvider.tsx`, `api.ts`, `index.ts`
- (新) `renderer/features/settings/settings/settingControl.ts`; (改) `settingsConfig.ts` (tree / `leafIds` / `buildLabelMap` export / `SettingControl` re-export / `SettingDef.default?`)
- (改) `renderer/features/settings/settings/pluginSettings.ts` — `PLUGINS_CATEGORY = 'plugins.installed'`, `PLUGIN_PREF_SETTING_PREFIX`, `pluginPrefFromSettingKey`, `pluginPrefSettingDefs`, `buildCategoryTree`
- (改) `renderer/features/settings/SettingsPane.tsx`, `settings/SettingRow.tsx`; (新) `settings/SecretSettingControl.tsx`; (改) `config-pane.css` (secret 行が path-row を共用できなければ 1 定義)
- (新) `renderer/contexts/UndoRedoLockContext.tsx`; (改) `renderer/hooks/useUndoRedoState.ts`, `renderer/index.tsx`
- (改) `renderer/h3-kit/primitives/appIcons.ts`, `h3-kit/form/TextField.tsx`, `h3-kit/form/index.ts`, `styles/_form-kit.css`; (新) `h3-kit/form/TextAreaField.tsx`
- (新) `renderer/worker/shared/pdbUrls.ts`, `renderer/worker/shared/fileOpenDefaults.ts`; (改) `renderer/dialogs/fopen-opt-dlgs/types.ts` (re-export 化)
- (改, 任意) `eslint.config.mjs` — worker ban list に `dialogs/**`

### plugin (`src/plugins/`)
- (新) `agent/` 一式 (§4.1)
- (改) `plugins/index.ts`, `plugins/index.test.ts`
- (改) `getpdb/renderer/pdbUrls.ts`, `getpdb/renderer/GetPdbDialog.tsx` (`CoordServerType` の出所)
- (改) `catalog/renderer/CatalogPane1.tsx` (`TextAreaField` / `password` の例)

### main / shared
- (改) `shared/ipcChannels.ts`, `shared/ipcContract.ts`, `shared/types/uiPrefs.ts`; (新) `shared/types/secrets.ts`
- (新) `main/secretStore.ts`, `main/handlers/secrets.ts`; (改) `main/ipcHandlers.ts`, `main/stateStore.ts`
- (改) `package.json` (`openai`)、必要なら `electron.vite.config.ts` の worker externals

### docs
- (新) `docs/plans/260912-ai-agent-plugin-plan.md` (本書の複写); (改) `docs/plans/_index.md` — 260912 行追加、260911 行を
  「**260912 に置き換え (superseded)**。agent 内部設計は有効、配置は plugin 化」に
- (改) `tritium/CLAUDE.md` — Built-in plugins 節に `agent`、AsyncCueMol dispatch 表の `quiet` 行に
  「`plugin.agent.runTurn` (数分の turn、panel が進捗を出す)」注記
- (改) `docs/migration/ui-style-guide.md` — form-kit 表
- 実装完了後: (改) `docs/architecture/tritium_plugin/contributions.md` (settings 寄与点 + prefs)、`api.md` (channel / prefs /
  secret / `useSuppressUndoRedo` / `InvokeOptions`、「barrel に無いもの」に `CmdId`)、`internals.md` (push レーン、secrets IPC、
  prefs、undo lock、「寄与点を足す手順」の settings 実例)、`overview.md` のレーン表に channel 行、`_index.md` の plugin 表に `agent` 行;
  (新) `docs/architecture/ai-agent-plugin.md` + `docs/architecture/_index.md` 1 項目

---

## 7. 実装フェーズ

### P0: host API 拡張 + 契約 (ビルドが通る状態)
1. A1 (`pluginCalls` / `WorkerTransport` / `AsyncCueMol` / `pluginChannels.ts`)、A2、A3 (`uiPrefs` / `PluginProvider` / `usePluginPrefs`)、
   A4 の型と resolver (`types.ts` / `pluginSelect.ts` / `definePlugin.ts` / `settingControl.ts`)、A5 の型 + IPC 行 + main handler、
   A6 (`UndoRedoLockContext` / `useUndoRedoState` / `index.tsx`)、`api.ts` export。
2. `pnpm add -D openai`; `task build_tritium` で worker chunk に束なることを確認
   (`grep -c OpenAI out/renderer/assets/worker_launcher-*.js` が 1 以上、`require("openai")` 無し)。
3. `worker/shared/pdbUrls.ts`, `worker/shared/fileOpenDefaults.ts` 移設 + getpdb / dialogs の re-export。
4. `plugins/agent/` 骨組み: `index.ts` (manifest + 空 pane)、`calls.ts`、`shared/agentTypes.ts`、`worker/agent.service.ts` は
   `fail('not implemented', 'unsupported')`。`plugins/index.ts` / `index.test.ts` 更新 → `npm test -- plugins/index` が通る。
5. `npx tsc -p tsconfig.web.json --noEmit` / `tsconfig.node.json`、`npm run lint`。

### P1: worker agent core + 最小 tool 5 件 (原プラン P1)
1. `openaiClient.ts`、`toolOutput.ts`、`sceneSnapshot.ts`、`prompt/*`、`turnLoop.ts` (全 await を try 内、`for await` を途中 break しない、
   `response.status === 'incomplete'` で終了)。progress は `ctx.svc.pushMessage(AGENT_PROGRESS_CHANNEL, u)`。
2. tools: `get_scene_state`, `check_selection`, `get_renderer_types`, `set_mol_selection`, `create_renderer`。
3. 検証: dev console から `cm.subscribePluginChannel(...)` + `cm.invokePluginService('agent', 'runTurn', {...})`
   (`OPENAI_API_KEY` env → `SECRET_GET` の env fallback を先に通す)。Toolbar の undo 履歴に `AI: ...` が **1 件**。
   `client.models.list()` で `DEFAULT_AGENT_MODEL` を確認し必要なら定数を直す。

### P2: pane UI
1. form-kit `TextAreaField` / `TextField password` (+ `_form-kit.css`、CatalogPane1 例、ui-style-guide 表)。`appIcons` `activity.agent`。
2. `agentSessionStore` / `useAgentTurnRunner` / `AgentRoot` / `AgentChatPane` / `AgentTranscript` / `agent-chat.css`。
3. **ユーザー目視確認 (E2E)**: Settings > Plugins > Installed で ON → ActivityBar に出る。dark/light。実行中に Edit > Undo / Toolbar Undo が無効。

### P3: settings / secret
1. A4 の描画側 (`pluginSettings.ts` / `SettingsPane` / `SettingRow` / `SecretSettingControl`)、agent manifest の `settings` 宣言、
   pane の「Open Settings」導線。
2. **目視確認**: キー保存 → 再起動後も `source: 'stored'`、Clear で `env` / `none`、model 変更が `pluginPrefs.agent.model` に残る。

### P4: 残りの tool 14 件 + prompt 調整 (原プラン P4)
`fetch_pdb` は `pickCoordUrl` + `buildHeadlessFileOpenOptions` + `reqId = ${turnId}:${callId}`。実シナリオで prompt 調整、
`usage.cachedTokens` が 2 回目以降 > 0 を確認。

### P5: テスト / lint / docs (目視確認で挙動確定後)
§8 のテスト、`npm test`、`npx tsc` x2、`npm run lint`、`task lint_tritium_style`、`npm run lint:comments`、§6 docs。

---

## 8. テスト (最小集合、契約のみ。合計 9 件)

| # | ファイル | pin する契約 |
|---|---|---|
| T1 | `renderer/plugin-host/pluginChannels.test.ts` | `['plugin-channel.x.p', payload]` が `subscribePluginChannel` の listener に届く / `['plugin.x.svc', seqno, true, r]` (reply) は届かない / unsubscribe 後は届かない (`asyncCueMolInvoke.test.ts` の MockWorker 流用、1 `it`) |
| T2-T4 | `plugins/agent/worker/turnLoop.test.ts` | fake client 注入 (round 1: function_call → round 2: text) で (a) mutating 成功 → `scene.undo.committed` に `AI: ...` 1 件、(b) read-only のみ → rollback で committed 0、(c) abort → `code: 'canceled'` かつ mutating 済みなら commit。`makeWorkerCtx({ extra: { svc: { pushMessage: vi.fn() } } })` + `fakeScene` |
| T5 | `plugins/agent/worker/toolOutput.test.ts` | `it.each` で 3 方言 → `ok:false` + 文言、長大配列 truncate |
| T6 | `plugins/agent/worker/tools/index.test.ts` | 全 tool: 名前一意・昇順、`additionalProperties === false`、`required` = `Object.keys(properties)` (再帰)、件数 < 20; cheat sheet が `KEYWORDS` の全 emit と named selection 9 種を含む |
| T7 | `src/main/secretStore.test.ts` | `resolveSecret`: stored > env > none; `setSecret('')` = clear; 暗号化不可なら `ok: false` (electron mock) |
| P1 | `renderer/plugin-host/PluginProvider.test.tsx` (+1 `it`) | `UI_LOAD.pluginPrefs` の読み込み; `setPref` が `UI_SAVE { pluginPrefs: <map 全体> }` で呼ばれる |
| L1 | `renderer/contexts/UndoRedoLockContext.test.tsx` | lock 取得で `MENU_UPDATE_STATE { undo: { enabled: false }, redo: { enabled: false } }` が push され `canUndo === false`、解除で復帰 |
| — | (既存) `plugins/index.test.ts` | `DECLARED_CALLS.agent` 追加で service 契約と `validatePlugin` (settings 検査含む) が自動で効く |

書かないもの: Settings 行の描画、`invoke` / `definePluginSecret` の転送、各 tool の service 転送、UI の見た目。

---

## 9. 検証手順 (E2E)

1. `cd build_scripts && task build_tritium` — bundler エラー無し、worker chunk に `openai` が inline、`require("openai")` 無し。
2. `task run_tritium` → `launch worker OK` → `CueMol2 nodejs add-on : INITIALIZED` → `bindCanvas` → `shader program created OK`。
3. Settings > Plugins > Installed で "AI Agent (OpenAI)" を ON → 左ツリーに `Plugins > AI Agent (OpenAI)` leaf が現れ、
   Model / Reasoning effort / OpenAI API key の 3 行。キー保存 → 状態行 "Stored (....ab12)"。OFF で leaf と ActivityBar icon が同時に消える。
4. ActivityBar の Sparkle → 「1CRN を読み込んで cartoon で表示して」 → streaming + tool 行 (`fetch_pdb`, `create_renderer`) → 3D 反映 →
   Toolbar undo 履歴に `AI: 1CRN を...` が **1 件**。Cmd+Z で一括で戻る。
5. read-only 質問 → undo 履歴が増えず redo も消えない。
6. 実行中: Edit > Undo / Toolbar Undo / Cmd+Z が無効。Stop → "Stopped"、変更済みなら履歴 1 件残る (revert されない)。
7. 実行中に Settings で plugin を OFF → turn が cancel され、worker は生存 (`__worker_crash__` 無し)。
8. 誤ったキー → 「Invalid API key (401)」行、キー文字列は表示されない。
9. 再起動 → `pluginPrefs.agent.model` と secret の `source: 'stored'` が残る。Clear → `env` (`OPENAI_API_KEY` あり) / `none`。
10. dark / light 両テーマ、`task lint_tritium_style` のベースライン件数が増えない。

---

## 10. 既知の制約と後続候補

- turn 実行中の手動編集が agent の undo txn に吸収される (原プラン §3.1)。A6 の lock は Undo/Redo **実行**を止めるだけで、編集は止めない。
- `activeView` は `MainLayout.tsx:31` のローカル state で、command / menu から AI Agent view を開けない (別タスク: `LayoutProvider` へ移して api に `useActivityView` を足す)。
- 会話履歴はセッション内のみ (module store; plugin OFF/ON で reset)。
- plugin が無効のときは Settings に設定 leaf が出ない (有効化 → 設定、の順)。既定 OFF なので初回導線は Settings > Plugins > Installed。
- `text` kind は keystroke ごとに `UI_SAVE` (ApbsConfig と同じ)。
- `worker/` から `@renderer/dialogs/**` を import できてしまう ESLint の穴は `fileOpenDefaults.ts` 移設で踏まない設計にした。ban list 追加は任意項目。
- `CmdId.UiSettingsTab` を plugin が `@renderer/commands/ids` から直接 import する (barrel 外)。Phase A (実行時ロード) 前に barrel へ足す候補。
- Markdown 表示なし、provider 中立層なし、model id は `DEFAULT_AGENT_MODEL` 1 箇所 + Settings 自由入力 (原プラン踏襲)。


---

## 11. 実装時の差分 (計画 -> 実装)

プランどおりに入った部分は省き、変えた判断だけ残す。

- **`usePlugins` を `pluginContext.ts` へ分離した (計画に無し)**。`api.ts` から
  `usePluginPrefs` を export した時点で
  plugin -> `plugin-host/api` -> `PluginProvider` -> `@plugins/index` -> plugin という
  循環ができ、`createDialogHook` が undefined になって 5 テストが落ちた。registry の
  *読み取り*だけを provider から切り離して解決。以後 api barrel に何かを足すときは、
  それが `@plugins/index` へ辿り着かないか確認する。
- **`AgentOpenAIClient` を SDK の `Pick<OpenAI, 'responses'>` ではなく自前の狭い interface に
  した**。`create` が `stream` フラグでオーバーロードされていて、型引数経由では streaming
  の分岐に解決できなかった。結果として test fake が数行で済む形になった。
- **ツールのストリーム cancel を `TurnContext.noteStream()` にした**。計画は turnLoop 側で
  reqId を推測する形だったが、reqId を組み立てるのはツール自身なので、ツールが登録する
  ほうが素直。
- **`SettingDef.default?` を足した**。plugin の寄与行は既定値が manifest 側にあるので、
  core の `DEFAULTS` map には載らない。
- **`PLUGINS_CATEGORY` を `'plugins'` -> `'plugins.installed'` に変更**し、`'plugins'` は
  親ノードにした。`CATEGORY_TREE` / `ALL_LEAF_IDS` は静的なまま残し
  (nav store の初期値が使う)、pane が描くツリーは `buildCategoryTree()` /
  `leafIds()` / `buildLabelMap()` でその場で導く形にした。
- **ESLint の `dialogs/**` ban list 追加は見送った** (§4.4 の任意項目)。`fileOpenDefaults.ts`
  の移設で踏まない設計になっており、既存コードへの影響を確認する手間に見合わない。
- **tool は 19 本すべて P4 まで待たずに入れた**。ツール間で共有する形 (schema ヘルパ、
  `normalizeServiceResult`) が先に決まったため、分割する意味が薄かった。
- テストは計画どおり 9 件 (T1 / T2-T4 / T5 / T6 / T7 / prefs / undo lock)。
