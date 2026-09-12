/**
 * @file plugin-host/pluginChannels.ts
 * @description Typed access to a plugin's own worker push channel.
 *
 * The service lane (`definePluginServices`) covers request / reply. A worker
 * service that streams -- progress, deltas, anything arriving before it
 * returns -- needs the other direction, and `WorkerTransport` hard-wires one
 * branch per built-in channel. A plugin cannot add a branch, so it pushes on
 * a namespaced channel name instead and the transport routes by that name.
 *
 * Both halves derive the name from `pluginChannelName`, so they cannot drift:
 * the worker half imports it from `worker/shared/pluginCalls` (it may not
 * import this module, which lives on the renderer side), and this end gets it
 * through `definePluginChannel`.
 *
 * Usage, from a plugin:
 *
 *   // calls.ts (renderer side)
 *   export const fooProgress = definePluginChannel<FooUpdate>('foo', 'progress')
 *   // ...
 *   useEffect(() => fooProgress.subscribe(cm, (u) => apply(u)), [cm])
 *
 *   // worker/foo.ts
 *   ctx.svc.pushMessage(pluginChannelName('foo', 'progress'), update)
 */

import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import { pluginChannelName } from '@renderer/worker/shared/pluginCalls'

/** A typed subscriber for one push channel of one plugin. */
export interface PluginChannel<T> {
  /**
   * The wire name, `plugin-channel.<pluginId>.<name>`. The worker half pushes
   * on it with `ctx.svc.pushMessage(channel, payload)`.
   */
  channel: string
  /**
   * Listen until the returned function is called.
   *
   * @param cm - the worker handle; a caller holding `null` has nothing to
   *   subscribe to and should skip the effect.
   */
  subscribe(cm: AsyncCueMol, cb: (payload: T) => void): () => void
}

/**
 * A subscriber for the `name` push channel of `pluginId`.
 *
 * @param pluginId - must equal the manifest id, which is also the directory
 *   name the worker registry derives the service prefix from.
 * @param name - bare channel name; the prefix is applied here.
 */
export function definePluginChannel<T>(pluginId: string, name: string): PluginChannel<T> {
  const channel = pluginChannelName(pluginId, name)
  return {
    channel,
    subscribe(cm: AsyncCueMol, cb: (payload: T) => void): () => void {
      return cm.subscribePluginChannel(channel, (payload: unknown) => {
        cb(payload as T)
      })
    },
  }
}
