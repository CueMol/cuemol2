/**
 * @file plugin-host/pluginSecrets.ts
 * @description Typed access to one credential belonging to one plugin.
 *
 * A plugin that talks to a paid API needs somewhere to keep the key that is
 * not the preferences file. Main owns that store (`main/secretStore.ts`,
 * backed by `safeStorage`); this is the plugin-facing end of it.
 *
 * The namespace is fixed here to the plugin id the caller declares, so the
 * channels stay generic -- main never learns which plugin or which key it is
 * holding -- while a plugin can still only reach its own entries.
 *
 * Read the value at the moment it is used and pass it straight on; do not put
 * it in React state, a log line, or an error message.
 *
 * Usage, from a plugin:
 *
 *   export const fooKey = definePluginSecret('foo', 'apiKey', { envVar: 'FOO_API_KEY' })
 *   // ...
 *   const { value } = await fooKey.get()
 */

import { IPC } from '@shared/ipcChannels'
import type { SecretGetRes, SecretSetRes, SecretStatusRes } from '@shared/types/secrets'

/** One plugin's credential. */
export interface PluginSecret {
  /** The value, from the store or the environment fallback. */
  get(): Promise<SecretGetRes>
  /** Store a value. An empty string clears the entry, like `clear`. */
  set(value: string): Promise<SecretSetRes>
  /** Forget the stored value. The environment fallback, if any, still applies. */
  clear(): Promise<SecretSetRes>
  /** Enough to describe the entry in the UI without revealing it. */
  status(): Promise<SecretStatusRes>
}

/** What each call answers when Electron is not there (the Vite dev server). */
const NO_ELECTRON = {
  get: { value: null, source: 'none' } as SecretGetRes,
  set: { ok: false, error: 'Not running in the app.' } as SecretSetRes,
  status: { source: 'none', last4: null, encryptionAvailable: false } as SecretStatusRes,
}

/**
 * The `key` credential of `pluginId`.
 *
 * @param pluginId - must equal the manifest id; it becomes the namespace.
 * @param opts.envVar - environment variable read when nothing is stored.
 */
export function definePluginSecret(
  pluginId: string,
  key: string,
  opts: { envVar?: string } = {},
): PluginSecret {
  const ref = { namespace: pluginId, key, envVar: opts.envVar }
  return {
    async get() {
      return (await window.electronAPI?.invoke(IPC.SECRET_GET, ref)) ?? NO_ELECTRON.get
    },
    async set(value: string) {
      return (await window.electronAPI?.invoke(IPC.SECRET_SET, { ...ref, value })) ?? NO_ELECTRON.set
    },
    async clear() {
      return (await window.electronAPI?.invoke(IPC.SECRET_SET, { ...ref, value: '' })) ?? NO_ELECTRON.set
    },
    async status() {
      return (await window.electronAPI?.invoke(IPC.SECRET_STATUS, ref)) ?? NO_ELECTRON.status
    },
  }
}
