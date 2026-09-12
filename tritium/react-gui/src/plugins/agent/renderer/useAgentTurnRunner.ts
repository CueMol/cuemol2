/**
 * @file plugins/agent/renderer/useAgentTurnRunner.ts
 * @description Runs a turn and keeps the session in step with it.
 *
 * Lives in the plugin's Root rather than in the pane, because a side pane
 * unmounts whenever the user switches activity view and a turn takes minutes.
 * The pane reaches these handlers through the session store.
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  useCueMol,
  useEnsureActiveScene,
  usePluginPrefs,
  useSuppressUndoRedo,
} from '@renderer/plugin-host/api'
import { agentApiKey, agentProgress, agentServices } from '../calls'
import {
  AGENT_PLUGIN_ID,
  AGENT_PREF_KEYS,
  DEFAULT_AGENT_MODEL,
} from '../shared/agentTypes'
import type { ReasoningEffort } from '../shared/agentTypes'
import { agentSession, getAgentSession, useAgentSession } from './agentSessionStore'

/** A fresh turn id. `crypto.randomUUID` is missing on some older hosts. */
function makeTurnId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const EFFORTS: ReasoningEffort[] = ['default', 'low', 'medium', 'high']

/** Read the stored effort, falling back when the value is not one we know. */
function toEffort(value: unknown): ReasoningEffort {
  return EFFORTS.includes(value as ReasoningEffort) ? (value as ReasoningEffort) : 'low'
}

export function useAgentTurnRunner(): void {
  const { cm } = useCueMol()
  const { running } = useAgentSession()
  const { prefs } = usePluginPrefs(AGENT_PLUGIN_ID)
  const ensureActiveScene = useEnsureActiveScene()

  // The turn reads these when it starts, not when this hook last rendered.
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  // While a turn is running its edits are one open transaction; undoing into
  // the middle of it would revert a state the user never saw.
  useSuppressUndoRedo(running)

  const send = useCallback(
    (text: string) => {
      if (!cm || getAgentSession().running) return
      const turnId = makeTurnId()
      agentSession.beginTurn(turnId, text)

      void (async () => {
        try {
          // Resolve the scene AFTER the user has committed to the message, so
          // an empty tab is never left behind by a message never sent.
          const target = await ensureActiveScene()
          if (!target) {
            agentSession.failTurn('There is no scene to work on.')
            return
          }
          const key = await agentApiKey.get()
          if (!key.value) {
            agentSession.failTurn(
              'No OpenAI API key is set. Add one in Settings, or set the OPENAI_API_KEY environment variable.',
              { needsApiKey: true },
            )
            return
          }

          const result = await agentServices.invoke(
            cm,
            'runTurn',
            {
              turnId,
              sceneId: target.scene_uid,
              viewId: target.view_id,
              userText: text,
              history: getAgentSession().history,
              apiKey: key.value,
              model: String(prefsRef.current[AGENT_PREF_KEYS.model] ?? DEFAULT_AGENT_MODEL),
              reasoningEffort: toEffort(prefsRef.current[AGENT_PREF_KEYS.reasoningEffort]),
            },
            // A turn takes tens of seconds to minutes and reports its own
            // progress in the panel; counting it would pin the status-bar
            // Busy pill and the wait cursor for the whole conversation.
            { quiet: true },
          )

          if (!result.ok) {
            if (result.code === 'canceled') agentSession.cancelTurn()
            else agentSession.failTurn(result.error)
            return
          }
          agentSession.endTurn([...getAgentSession().history, ...result.appended])
          if (result.roundLimitHit) {
            agentSession.notice('Stopped after the maximum number of steps. Ask again to continue.')
          }
        } catch (e) {
          // A rejection here means the worker itself failed, not the model.
          agentSession.failTurn(e instanceof Error ? e.message : 'The turn could not be run.')
        }
      })()
    },
    [cm, ensureActiveScene],
  )

  const stop = useCallback(() => {
    const { turnId } = getAgentSession()
    if (!cm || !turnId) return
    void agentServices
      .invoke(cm, 'cancelTurn', { turnId })
      .catch((e: unknown) => { console.warn('agent cancelTurn:', e) })
  }, [cm])

  // Publish the handlers for the pane, and take them away with this Root: a
  // pane that outlived it would hold a send() into a dead turn runner.
  useEffect(() => {
    agentSession.setRunner({ send, stop })
    return () => { agentSession.setRunner(null) }
  }, [send, stop])

  // Progress from the running turn. The store drops updates from any turn
  // other than the current one.
  useEffect(() => {
    if (!cm) return
    return agentProgress.subscribe(cm, (update) => { agentSession.applyProgress(update) })
  }, [cm])

  // Switching the plugin off unmounts this Root mid-turn. Stop the turn
  // rather than leaving it running with nothing listening, and clear the
  // conversation, since the panel it belonged to is gone.
  useEffect(() => {
    return () => {
      const { turnId } = getAgentSession()
      if (turnId && cm) {
        void cm
          .invokePluginService(AGENT_PLUGIN_ID, 'cancelTurn', { turnId })
          .catch(() => { /* the worker may already be gone */ })
      }
      agentSession.reset()
    }
  }, [cm])
}
