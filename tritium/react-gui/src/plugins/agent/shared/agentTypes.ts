/**
 * @file plugins/agent/shared/agentTypes.ts
 * @description The contract between the agent panel and the worker that runs
 * a turn for it.
 *
 * Loaded by both halves of the plugin, so it holds wire shapes and constants
 * only -- no React, no C++ wrappers. The OpenAI types it re-uses are type
 * imports, which the SDK ships with no runtime cost.
 */

import type { ResponseInputItem } from 'openai/resources/responses/responses'
import { pluginChannelName } from '@renderer/worker/shared/pluginCalls'
import type { Result } from '@renderer/worker/shared/result'

/** The manifest id. Namespaces this plugin's services, channel and secret. */
export const AGENT_PLUGIN_ID = 'agent'

/**
 * The model a turn runs on unless the user names another.
 *
 * One constant rather than a list, because the catalogue moves faster than
 * this app ships: Settings takes free text, so an id that stops existing is a
 * one-line fix for the user and a 404 they can read in the panel.
 */
export const DEFAULT_AGENT_MODEL = 'gpt-5.6'

/** How hard the model is asked to think before answering. */
export type ReasoningEffort = 'default' | 'low' | 'medium' | 'high'

/** Setting keys this plugin declares. Shared so both halves spell them once. */
export const AGENT_PREF_KEYS = {
  model: 'model',
  reasoningEffort: 'reasoningEffort',
} as const

/** The keychain entry and the environment variable behind it. */
export const AGENT_SECRET_KEY = 'openaiApiKey'
export const AGENT_API_KEY_ENV = 'OPENAI_API_KEY'

/** One item of the OpenAI conversation the panel owns and replays each turn. */
export type AgentInputItem = ResponseInputItem

/** Token counts for one turn, as reported by the API. */
export interface AgentUsage {
  inputTokens: number
  outputTokens: number
  /** Prefix tokens served from the prompt cache. Zero on a first turn. */
  cachedTokens: number
}

/** What the worker streams while a turn runs. Every variant names its turn. */
export type AgentProgressUpdate =
  | { kind: 'status'; turnId: string; phase: 'thinking' | 'calling-tools' | 'writing' }
  | { kind: 'text_delta'; turnId: string; delta: string }
  | { kind: 'tool_call'; turnId: string; callId: string; name: string; input: string }
  | {
      kind: 'tool_result'
      turnId: string
      callId: string
      name: string
      ok: boolean
      /** One line for the transcript. Never the whole payload. */
      summary: string
    }

/** The push channel the worker streams those on. */
export const AGENT_PROGRESS_CHANNEL = pluginChannelName(AGENT_PLUGIN_ID, 'progress')

export interface AgentRunTurnArgs {
  /** Identifies this turn for progress routing and cancellation. */
  turnId: string
  sceneId: number
  viewId: number
  /** What the user typed. */
  userText: string
  /** Every item of the conversation so far, oldest first. */
  history: AgentInputItem[]
  /**
   * The OpenAI key, read at send time and passed straight through. Never
   * logged, and never held in renderer state between turns.
   */
  apiKey: string
  model: string
  reasoningEffort: ReasoningEffort
}

export interface AgentTurnOutcome {
  /**
   * The items to append to the conversation: the user item, everything the
   * model produced, and each tool result. Empty when the turn was cancelled,
   * because the next turn's scene snapshot describes the real state anyway.
   */
  appended: AgentInputItem[]
  /** The assistant's final prose, already streamed as deltas. */
  finalText: string
  usage: AgentUsage
  /** Whether any tool that changes the scene succeeded. Drives the commit. */
  mutated: boolean
  /** How many tool calls ran, across every round. */
  toolCalls: number
  /** True when the model stopped because it hit the round limit. */
  roundLimitHit: boolean
}

/** A cancelled turn comes back as `fail(..., 'canceled')`. */
export type AgentRunTurnResult = Result<AgentTurnOutcome>
