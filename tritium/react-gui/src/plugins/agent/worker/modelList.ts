/**
 * @file plugins/agent/worker/modelList.ts
 * @description The model ids a key may call, as each provider lists them.
 *
 * Plain REST rather than the AI SDK: the SDK's providers expose no model
 * listing. Runs in the worker for the same reason a turn does -- the key
 * arrives as a call argument and goes no further than this request.
 *
 * Only the ids are returned. Which of them the panel offers is decided
 * against the suggestions (`shared/modelCatalog.ts`), not here.
 */

import { fail, ok } from '@renderer/worker/shared/result'
import type { Result } from '@renderer/worker/shared/result'
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'
import type { Provider } from '../shared/modelSpec'
import type { AgentListModelsArgs } from '../shared/agentTypes'

/** One provider's list endpoint and how to read a page of it. */
interface Lister {
  label: string
  /** The URL of the page after `cursor`; `cursor` is null for the first. */
  url(cursor: string | null): string
  headers(apiKey: string): Record<string, string>
  /** The bare ids on one page, and the cursor for the next if there is one. */
  read(body: unknown): { ids: string[]; next: string | null }
}

/** Loose accessors: the bodies are external JSON, checked field by field. */
function arrayOf(body: unknown, key: string): Record<string, unknown>[] {
  const v = (body as Record<string, unknown> | null)?.[key]
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : []
}

function stringOf(body: unknown, key: string): string | null {
  const v = (body as Record<string, unknown> | null)?.[key]
  return typeof v === 'string' && v !== '' ? v : null
}

const LISTERS: Record<Provider, Lister> = {
  openai: {
    label: 'OpenAI',
    // Not paginated: one response has every model the key can see.
    url: () => 'https://api.openai.com/v1/models',
    headers: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    read: (body) => ({
      ids: arrayOf(body, 'data').flatMap((m) => (typeof m.id === 'string' ? [m.id] : [])),
      next: null,
    }),
  },
  anthropic: {
    label: 'Anthropic',
    url: (cursor) =>
      'https://api.anthropic.com/v1/models?limit=1000' +
      (cursor ? `&after_id=${encodeURIComponent(cursor)}` : ''),
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Refused from a browser origin without it; the worker is one.
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    read: (body) => ({
      ids: arrayOf(body, 'data').flatMap((m) => (typeof m.id === 'string' ? [m.id] : [])),
      next: (body as { has_more?: unknown } | null)?.has_more === true
        ? stringOf(body, 'last_id')
        : null,
    }),
  },
  google: {
    label: 'Google',
    url: (cursor) =>
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000' +
      (cursor ? `&pageToken=${encodeURIComponent(cursor)}` : ''),
    headers: (apiKey) => ({ 'x-goog-api-key': apiKey }),
    read: (body) => ({
      // Listed as `models/<id>`; the id a request takes is the part after.
      ids: arrayOf(body, 'models').flatMap((m) =>
        typeof m.name === 'string' ? [m.name.replace(/^models\//, '')] : [],
      ),
      next: stringOf(body, 'nextPageToken'),
    }),
  },
}

/** A runaway cursor would otherwise loop for as long as the provider answers. */
const MAX_PAGES = 10

/** How `listModels` reaches the network. Overridden in tests. */
export type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<Response>

/**
 * Every model id the key may call.
 *
 * @returns the ids, or a failure the panel treats as "cannot tell" -- it
 *   then offers that provider's suggestions unfiltered rather than none.
 */
export async function listModels(
  _ctx: WorkerContext,
  args: AgentListModelsArgs,
  doFetch: Fetch = (url, init) => fetch(url, init),
): Promise<Result<{ ids: string[] }>> {
  const lister = LISTERS[args.provider]
  if (!lister) return fail(`Unknown provider "${String(args.provider)}".`, 'invalid-args')
  if (args.apiKey === '') return fail('No API key is set.', 'invalid-args')

  const ids: string[] = []
  let cursor: string | null = null
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await doFetch(lister.url(cursor), { headers: lister.headers(args.apiKey) })
      if (!res.ok) {
        return fail(`${lister.label} model list failed (${res.status}).`, 'io')
      }
      const { ids: pageIds, next } = lister.read(await res.json())
      ids.push(...pageIds)
      if (next === null) break
      cursor = next
    }
  } catch (e) {
    // The message only: a network error never carries the key, but the
    // request headers are not worth the risk of echoing.
    return fail(`${lister.label} model list failed: ${e instanceof Error ? e.message : 'network error'}`, 'io')
  }
  return ok({ ids })
}
