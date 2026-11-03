/**
 * @file mcpBridge.ts
 * @description `tritium_cli mcp`: the MCP stdio transport, relayed to the
 * app's HTTP MCP endpoint (`/mcp`, local-api-server.md).
 *
 * One JSON-RPC message (or batch) per stdin line goes out as one POST; the
 * answer comes back as one stdout line. The app's endpoint is stateless, so
 * nothing is kept per session beyond the protocol version the client
 * negotiated.
 *
 * Request ids are rewritten. The endpoint keeps the calls in flight by
 * request id for every client together, and `notifications/cancelled` names
 * one by id, so two bridges whose clients both count from 1 would cancel each
 * other's calls. Each bridge sends `<prefix><n>` instead, with a prefix of
 * its own, puts the client's id back on the answer, and rewrites the id a
 * cancel names the same way.
 *
 * Requests are not serialised: a cancel has to reach a call still running.
 * Nothing but JSON-RPC is ever written to stdout.
 */

/** A JSON-RPC id as the client sent it. */
type RpcId = string | number

interface RpcMessage {
  jsonrpc?: string
  id?: RpcId | null
  method?: string
  params?: Record<string, unknown>
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

/** One POST to `/mcp`: the status and the body as text. */
export type McpPost = (body: unknown, headers: Record<string, string>) => Promise<{ status: number; text: string }>

export interface McpBridgeOptions {
  post: McpPost
  /** Writes one line to stdout (the newline is added). */
  write: (line: string) => void
  /** Unique to this bridge, e.g. `tcli-<pid>-<random>-`. */
  prefix: string
}

const isRequest = (m: RpcMessage): boolean => typeof m.method === 'string' && m.id !== undefined && m.id !== null

/** The JSON-RPC messages in an answer body: JSON, or the `data:` lines of an event stream. */
function parseAnswer(text: string): RpcMessage[] {
  const trimmed = text.trim()
  if (trimmed === '') return []
  try {
    const v = JSON.parse(trimmed) as RpcMessage | RpcMessage[]
    return Array.isArray(v) ? v : [v]
  } catch {
    const out: RpcMessage[] = []
    for (const line of trimmed.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue
      try {
        const v = JSON.parse(line.slice(5).trim()) as RpcMessage | RpcMessage[]
        out.push(...(Array.isArray(v) ? v : [v]))
      } catch {
        // Not a message.
      }
    }
    return out
  }
}

export interface McpBridge {
  /** Handle one stdin line; resolves when its answer has been written. */
  handleLine(line: string): Promise<void>
}

export function createMcpBridge({ post, write, prefix }: McpBridgeOptions): McpBridge {
  let seq = 0
  /** Outgoing id -> the client's. */
  const toClient = new Map<string, RpcId>()
  /** The client's id (JSON, so 1 and "1" differ) -> outgoing. */
  const toApp = new Map<string, string>()
  let protocolVersion: string | null = null

  const emit = (m: RpcMessage | RpcMessage[]) => write(JSON.stringify(m))
  const errorFor = (id: RpcId | null, message: string, code = -32000): RpcMessage => ({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  })

  /** Rewrite a client message for the app; null drops it. */
  const outgoing = (m: RpcMessage): RpcMessage | null => {
    if (isRequest(m)) {
      const out = `${prefix}${++seq}`
      toClient.set(out, m.id as RpcId)
      toApp.set(JSON.stringify(m.id), out)
      return { ...m, id: out }
    }
    if (m.method === 'notifications/cancelled') {
      const out = toApp.get(JSON.stringify(m.params?.requestId))
      // Unknown: that request has already been answered.
      if (out === undefined) return null
      return { ...m, params: { ...m.params, requestId: out } }
    }
    return m
  }

  /** Forget an outgoing id; returns the client's. */
  const settle = (out: string): RpcId | undefined => {
    const id = toClient.get(out)
    if (id === undefined) return undefined
    toClient.delete(out)
    toApp.delete(JSON.stringify(id))
    return id
  }

  async function handleLine(line: string): Promise<void> {
    if (line.trim() === '') return
    let parsed: RpcMessage | RpcMessage[]
    try {
      parsed = JSON.parse(line) as RpcMessage | RpcMessage[]
    } catch {
      emit(errorFor(null, 'Parse error', -32700))
      return
    }
    const batch = Array.isArray(parsed)
    const messages: RpcMessage[] = Array.isArray(parsed) ? parsed : [parsed]
    const sent = messages.map(outgoing).filter((m): m is RpcMessage => m !== null)
    if (sent.length === 0) return
    const pending = sent.filter(isRequest).map((m) => m.id as string)
    const isInit = sent.some((m) => m.method === 'initialize')

    const headers: Record<string, string> = {}
    if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion
    let answers: RpcMessage[]
    let failure: string | null = null
    try {
      const res = await post(batch ? sent : sent[0], headers)
      if (res.status === 202) answers = []
      else {
        answers = parseAnswer(res.text)
        if (answers.length === 0 && (res.status < 200 || res.status >= 300)) {
          failure = `CueMol answered ${res.status}.`
        }
      }
    } catch (e) {
      answers = []
      failure = (e as Error).message
    }

    const out: RpcMessage[] = []
    for (const a of answers) {
      const id = typeof a.id === 'string' ? settle(a.id) : undefined
      if (id !== undefined) {
        if (isInit && typeof a.result?.protocolVersion === 'string') protocolVersion = a.result.protocolVersion
        out.push({ ...a, id })
      } else if ((a.id === null || a.id === undefined) && a.error) {
        // An error about the whole body (bad request): it answers every request in it.
        failure = a.error.message
      } else out.push(a)
    }
    // Every request gets an answer, whatever happened to the POST.
    for (const p of pending) {
      const id = settle(p)
      if (id !== undefined) out.push(errorFor(id, failure ?? 'CueMol did not answer this request.'))
    }
    if (out.length > 0) emit(batch ? out : out.length === 1 ? out[0] : out)
  }

  return { handleLine }
}
