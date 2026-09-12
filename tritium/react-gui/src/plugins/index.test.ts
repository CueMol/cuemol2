/**
 * @file plugins/index.test.ts
 * @description Whether the shipped plugins are internally consistent.
 *
 * Two joins the type system cannot make. A manifest names panes, tabs and
 * commands that live somewhere else, so it can name one that does not exist;
 * `validatePlugin` finds that, and this asserts it finds nothing. And a
 * plugin's worker services register by string name under a prefix derived
 * from its directory, while its call contract is written by hand -- the same
 * drift `worker/shared/calls/index.test.ts` guards against for the built-ins.
 */

import { describe, expect, it } from 'vitest'
import { validatePlugin } from '@renderer/plugin-host/api'
import { pluginServiceName } from '@renderer/worker/shared/pluginCalls'
import { BUILTIN_PLUGINS } from './index'
import { AGENT_KEYS } from './agent/calls'
import { SEQ_KEYS } from './sequence/calls'

/** Every plugin's declared service keys, keyed by plugin id. */
const DECLARED_CALLS: Record<string, readonly string[]> = {
  agent: AGENT_KEYS,
  sequence: SEQ_KEYS,
}

/** Read exactly as `worker/server/services/index.ts` does. */
const workerModules = import.meta.glob(['./*/worker/*.service.ts'], { eager: true }) as Record<
  string,
  { services?: Record<string, unknown> }
>

/** The (pluginId, serviceName) pairs the worker registry would install. */
function registrations(): { pluginId: string; name: string }[] {
  const out: { pluginId: string; name: string }[] = []
  for (const path of Object.keys(workerModules).sort()) {
    const pluginId = /^\.\/([^/]+)\/worker\//.exec(path)?.[1]
    if (!pluginId) throw new Error(`cannot read a plugin id from ${path}`)
    const services = workerModules[path]?.services
    if (!services) continue
    for (const [name, fn] of Object.entries(services)) {
      if (typeof fn === 'function') out.push({ pluginId, name })
    }
  }
  return out
}

describe('built-in plugins', () => {
  it('declare only contributions they actually provide', () => {
    const problems = BUILTIN_PLUGINS.flatMap((plugin) =>
      validatePlugin(plugin).map((message) => `${plugin.manifest.id}: ${message}`),
    )
    expect(problems).toEqual([])
  })

  it('let the user switch only what is optional', () => {
    // Get PDB and the Sequence panel are entry points, not extras: a switch
    // would only take a working menu item or tab away. The Component Catalog
    // is an internal tool, so it ships in every build but stays off until
    // someone asks for it.
    const byId = Object.fromEntries(BUILTIN_PLUGINS.map((p) => [p.manifest.id, p.manifest]))
    expect(byId.getpdb?.alwaysEnabled).toBe(true)
    expect(byId.sequence?.alwaysEnabled).toBe(true)
    expect(byId.catalog?.alwaysEnabled).toBeUndefined()
    expect(byId.catalog?.defaultEnabled).toBe(false)
    expect(byId.catalog?.devOnly).toBeUndefined()
    // The AI Agent needs an API key the user pays for, so it ships in every
    // build but stays off until someone asks for it.
    expect(byId.agent?.alwaysEnabled).toBeUndefined()
    expect(byId.agent?.defaultEnabled).toBe(false)
  })

  it('use an id at most once', () => {
    const ids = BUILTIN_PLUGINS.map((p) => p.manifest.id)
    expect(ids).toEqual([...new Set(ids)])
  })
})

describe('plugin worker services', () => {
  it('match the call contract the plugin declares, one for one', () => {
    const registered = registrations()
    const byPlugin = new Map<string, string[]>()
    for (const { pluginId, name } of registered) {
      byPlugin.set(pluginId, [...(byPlugin.get(pluginId) ?? []), name])
    }

    for (const [pluginId, names] of byPlugin) {
      const declared = DECLARED_CALLS[pluginId]
      expect(declared, `${pluginId} registers services but declares no contract`).toBeDefined()
      expect([...names].sort()).toEqual([...declared].sort())
    }
  })

  it('register under a name namespaced by the plugin id', () => {
    // The prefix is what keeps a plugin service out of the closed ServiceMap
    // and out of the built-in parity check.
    for (const { pluginId, name } of registrations()) {
      expect(pluginServiceName(pluginId, name)).toBe(`plugin.${pluginId}.${name}`)
    }
  })
})
