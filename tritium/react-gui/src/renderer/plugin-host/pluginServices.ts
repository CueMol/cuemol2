/**
 * @file plugin-host/pluginServices.ts
 * @description Typed access to a plugin's own worker services.
 *
 * A plugin cannot add a row to `ServiceMap` -- that map is closed, and the
 * parity tests depend on it staying closed -- so it declares its own call
 * contract in the same `{ args; result }` shape and gets a client from here.
 * The name is namespaced on the wire (`plugin.<id>.<name>`) by
 * `pluginServiceName`, which the worker registry applies on the other side,
 * so the two halves cannot drift on the prefix.
 *
 * Usage, from a plugin:
 *
 *   export type SeqCalls = {
 *     getSeqPanelData: { args: GetSeqPanelDataArgs; result: GetSeqPanelDataResult }
 *   }
 *   export const seqServices = definePluginServices<SeqCalls>('sequence')
 *   // ...
 *   const rows = await seqServices.invoke(cm, 'getSeqPanelData', { sceneId })
 */

import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { InvokeOptions } from '@renderer/worker/client/WorkerTransport'

/**
 * The shape a plugin's call contract has to have: one row per service.
 *
 * Declare it as a `type`, not an `interface`: only a type alias of an object
 * literal gets the implicit index signature this constraint needs.
 */
export type PluginServiceCalls = Record<string, { args: unknown; result: unknown }>

/** A typed caller for one plugin's services. */
export interface PluginServiceClient<M extends PluginServiceCalls> {
  /**
   * @param opts - same per-call options the built-in `invokeService` takes.
   *   `{ quiet: true }` keeps a long call out of the busy indicator, for a
   *   plugin that shows its own progress.
   */
  invoke<K extends keyof M & string>(
    cm: AsyncCueMol,
    name: K,
    args: M[K]['args'],
    opts?: InvokeOptions,
  ): Promise<M[K]['result']>
}

/**
 * A caller for the services `pluginId` registers.
 *
 * @param pluginId - must equal the manifest id, which is also the directory
 *   name the worker registry derives the wire prefix from.
 */
export function definePluginServices<M extends PluginServiceCalls>(
  pluginId: string,
): PluginServiceClient<M> {
  return {
    invoke<K extends keyof M & string>(
      cm: AsyncCueMol,
      name: K,
      args: M[K]['args'],
      opts?: InvokeOptions,
    ): Promise<M[K]['result']> {
      return cm.invokePluginService(pluginId, name, args, opts) as Promise<M[K]['result']>
    },
  }
}
