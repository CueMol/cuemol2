/**
 * @file plugins/agent/renderer/useAvailableModels.ts
 * @description The suggested models the keys that are set can run.
 *
 * Two filters, cheapest first. A provider with no key is dropped from the
 * key's status alone, which reveals nothing and needs no network. A provider
 * with a key is asked for its model list, and only the suggestions on it are
 * kept (`availableChoices`).
 *
 * A list that cannot be fetched -- offline, a proxy, a provider outage --
 * falls back to all of that provider's suggestions: the key is set, so hiding
 * the provider would be the worse guess.
 *
 * The lists are cached for the session by key fingerprint, so a pane that
 * remounts on every activity switch asks the network again only after the
 * key has changed.
 */

import { useCallback, useEffect, useState } from 'react'
import { onPluginSecretChanged, useCueMol } from '@renderer/plugin-host/api'
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard'
import { agentApiKeys, agentServices } from '../calls'
import { AGENT_PLUGIN_ID } from '../shared/agentTypes'
import { MODEL_CHOICES, availableChoices } from '../shared/modelCatalog'
import type { ModelChoice } from '../shared/modelCatalog'
import { PROVIDERS } from '../shared/modelSpec'
import type { Provider } from '../shared/modelSpec'

/**
 * Listed ids per provider, under the key they were fetched with.
 *
 * The fingerprint is the key's source and last four characters -- what the
 * status call already exposes -- so the key itself is never held here. Only
 * successful lists are kept: a failure is retried on the next refresh.
 */
const listedCache = new Map<Provider, { fingerprint: string; ids: string[] }>()

/** What one provider contributes to the picker. */
async function choicesFor(
  cm: NonNullable<ReturnType<typeof useCueMol>['cm']>,
  provider: Provider,
): Promise<ModelChoice[]> {
  const status = await agentApiKeys[provider].status()
  if (status.source === 'none') return []

  const fingerprint = `${status.source}:${status.last4 ?? ''}`
  const cached = listedCache.get(provider)
  if (cached?.fingerprint === fingerprint) {
    return availableChoices(MODEL_CHOICES[provider], cached.ids)
  }

  const key = await agentApiKeys[provider].get()
  if (!key.value) return []
  const res = await agentServices.invoke(
    cm,
    'listModels',
    { provider, apiKey: key.value },
    // A background lookup; the status-bar Busy pill is for what the user asked for.
    { quiet: true },
  )
  if (!res.ok) {
    console.warn(`agent listModels(${provider}):`, res.error)
    return MODEL_CHOICES[provider]
  }
  listedCache.set(provider, { fingerprint, ids: res.ids })
  return availableChoices(MODEL_CHOICES[provider], res.ids)
}

/**
 * The picker's choices, provider by provider in declaration order.
 *
 * Refreshed on mount and whenever one of this plugin's keys is stored or
 * cleared.
 *
 * @returns the choices, and `loading` until the first answer is in.
 */
export function useAvailableModels(): { choices: ModelChoice[]; loading: boolean } {
  const { cm } = useCueMol()
  const guard = useStaleGuard()
  const [choices, setChoices] = useState<ModelChoice[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    if (!cm) return
    const token = guard.next()
    void (async () => {
      try {
        const perProvider = await Promise.all(PROVIDERS.map((p) => choicesFor(cm, p)))
        if (guard.isCurrent(token)) setChoices(perProvider.flat())
      } catch (e) {
        // Only the IPC to main can throw here; the worker call returns a Result.
        console.warn('agent model picker:', e)
      } finally {
        if (guard.isCurrent(token)) setLoading(false)
      }
    })()
  }, [cm, guard])

  useEffect(() => {
    refresh()
    const unsubscribe = onPluginSecretChanged(AGENT_PLUGIN_ID, refresh)
    return () => {
      unsubscribe()
      guard.invalidate()
    }
  }, [refresh, guard])

  return { choices, loading }
}
