/**
 * @file plugins/console/renderer/ConsolePanel.tsx
 * @description The console tab: a transcript with a prompt under it.
 *
 * The prompt is a `TextAreaField`, not a `TextField`, for two reasons. Only
 * the textarea has an IME-safe `onSubmit` -- typing Japanese into a field
 * with a hand-rolled Enter handler sends the line on every conversion. And a
 * console is where people paste multi-line scripts, which a single-line input
 * cannot hold. With `submitKey="enter"` it still behaves like a prompt:
 * Enter runs, Shift+Enter makes a new line.
 *
 * Up and Down walk the history, but only when the caret is on the first or
 * last line, so they keep meaning "move the caret" inside a pasted script.
 * Tab completes, the way PyMOL's command line does. What a Tab lists goes in
 * a strip just above the prompt, not the transcript: each Tab replaces it,
 * and typing, Enter or Esc clears it, so it always shows the latest Tab's
 * candidates and the transcript keeps only what ran.
 *
 * The console speaks one dialect at a time: native (CueMol's own commands,
 * generated from the op catalogue) or PyMOL. The switch in the toolbar, or
 * typing just `native` or `pymol`, changes it; the choice is a plugin
 * preference, and each dialect keeps its own history.
 */

import React, { useCallback, useRef, useState } from 'react'
import { AppIcon } from '@renderer/h3-kit/primitives'
import { FormButton, SegmentField, TextAreaField, isImeKey } from '@renderer/h3-kit/form'
import { usePluginPrefs } from '@renderer/plugin-host/api'
import type { BottomTabComponent } from '@renderer/plugin-host/api'
import { IDLE, recallDown, recallUp } from '@renderer/utils/commandRecall'
import type { RecallState } from '@renderer/utils/commandRecall'
import { consoleServices } from '../calls'
import {
  CONSOLE_PLUGIN_ID,
  DEFAULT_DIALECT,
  DIALECT_PREF,
  DIALECT_PROMPTS,
} from '../shared/consoleTypes'
import type { ConsoleEntry, DialectId } from '../shared/consoleTypes'
import { ConsoleTranscript } from './ConsoleTranscript'
import { consoleSession, useConsoleSession } from './consoleSessionStore'
import { historyOf } from './commandHistory'

void React

const NEWLINE = '\n'

/** The switch's segments, in the order shown. */
const DIALECT_OPTIONS: { label: string; value: DialectId }[] = [
  { label: 'CueMol', value: 'native' },
  { label: 'PyMOL', value: 'pymol' },
]

/**
 * The completed text before the caret, without a separator the text after
 * the caret already starts with (`, ` before `,`, a space before a space).
 */
function joinBeforeCaret(completed: string, rest: string): string {
  if (completed.endsWith(', ') && /^\s*,/.test(rest)) return completed.slice(0, -2)
  if (completed.endsWith(' ') && /^\s/.test(rest)) return completed.slice(0, -1)
  return completed
}

/** What the user types to switch: the dialect's id, alone on the line. */
function dialectNamedBy(text: string): DialectId | null {
  const word = text.trim().toLowerCase()
  return word === 'native' || word === 'pymol' ? word : null
}

export const ConsolePanel: BottomTabComponent = ({
  cm,
  activeSceneId,
  activeMolViewId,
}) => {
  const { lines, running, draft, runner, stopper } = useConsoleSession()
  const [recall, setRecall] = useState<RecallState>(IDLE)
  // What the last Tab listed; null when nothing is shown.
  const [completions, setCompletions] = useState<ConsoleEntry[] | null>(null)
  const { prefs, setPref } = usePluginPrefs(CONSOLE_PLUGIN_ID)
  const dialect: DialectId =
    prefs[DIALECT_PREF] === 'pymol' || prefs[DIALECT_PREF] === 'native'
      ? prefs[DIALECT_PREF]
      : DEFAULT_DIALECT
  const history = historyOf(dialect)

  const switchDialect = useCallback(
    (next: DialectId) => {
      if (next === dialect) return
      setPref(DIALECT_PREF, next)
      setRecall(IDLE)
      consoleSession.notice(`Now speaking ${next === 'native' ? 'CueMol' : 'PyMOL'} commands.`)
    },
    [dialect, setPref],
  )
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /**
   * Replace the whole prompt and put the caret somewhere in it.
   *
   * The value is controlled through the module store, so the DOM only has the
   * new text after React commits -- hence the frame's wait before the caret
   * can be moved.
   */
  const showText = useCallback((text: string, caret: number) => {
    consoleSession.setDraft(text)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) el.setSelectionRange(caret, caret)
    })
  }, [])

  /** Show a recalled line and put the caret at its end. */
  const showRecalled = useCallback(
    (text: string) => {
      showText(text, text.length)
    },
    [showText],
  )

  /**
   * Complete at the caret, as bash and zsh do.
   *
   * Only the line's text before the caret is sent, so what is completed is
   * the word just before it; the worker answers with that part rewritten,
   * and the text after the caret is kept as it was. A pasted script is
   * several lines in one prompt, so only the caret's line is involved.
   */
  const completeAtCaret = useCallback(
    (el: HTMLTextAreaElement) => {
      if (!cm || running) return
      const value = el.value
      const caret = el.selectionStart ?? value.length
      const start = value.lastIndexOf(NEWLINE, caret - 1) + 1
      const line = value.slice(start, caret)

      consoleServices
        .invoke(
          cm,
          'complete',
          {
            dialect,
            // No scene yet is not a failure: a command name and a path can
            // still be completed, and the worker leaves the rest empty.
            sceneId: activeSceneId ?? 0,
            viewId: activeMolViewId ?? 0,
            line,
          },
          { quiet: true },
        )
        .then((res) => {
          if (!res.ok) {
            setCompletions([{ kind: 'error', text: `Error: ${res.error}` }])
            return
          }
          setCompletions(res.messages.length > 0 ? res.messages : null)
          if (res.replacement === null) return
          const rest = value.slice(caret)
          const head = joinBeforeCaret(res.replacement, rest)
          setRecall(IDLE)
          showText(value.slice(0, start) + head + rest, start + head.length)
        })
        .catch((e: unknown) => {
          console.error('console: complete failed:', e)
        })
    },
    [cm, running, activeSceneId, activeMolViewId, showText, dialect],
  )

  const submit = useCallback(() => {
    const text = draft.trim()
    if (text === '' || running || !runner) return
    // Switching is the panel's business, not a command either dialect knows.
    const named = dialectNamedBy(text)
    if (named) {
      consoleSession.setDraft('')
      switchDialect(named)
      return
    }
    // Recorded before running: a line that failed is exactly the one worth
    // getting back.
    history.pushHistory(text)
    setRecall(IDLE)
    setCompletions(null)
    consoleSession.setDraft('')
    runner(text, dialect)
  }, [draft, running, runner, dialect, history, switchDialect])

  const handleChange = useCallback((value: string) => {
    consoleSession.setDraft(value)
    setRecall(IDLE)
    setCompletions(null)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // While converting, these keys belong to the IME: the arrows pick a
      // candidate and Tab accepts one.
      if (isImeKey(e.nativeEvent)) return

      if (e.key === 'Escape' && completions) {
        e.preventDefault()
        setCompletions(null)
        return
      }

      if (e.key === 'Tab') {
        // Shift+Tab is left alone as the way out of the prompt by keyboard;
        // plain Tab always completes, and never moves focus.
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return
        e.preventDefault()
        completeAtCaret(e.currentTarget)
        return
      }

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return

      const el = e.currentTarget
      const before = el.value.slice(0, el.selectionStart ?? 0)
      const after = el.value.slice(el.selectionEnd ?? 0)
      const onFirstLine = !before.includes(NEWLINE)
      const onLastLine = !after.includes(NEWLINE)

      const recalled = history.getHistory()
      if (e.key === 'ArrowUp') {
        if (!onFirstLine) return
        const step = recallUp(recall, el.value, recalled)
        if (!step) return
        e.preventDefault()
        setRecall(step.state)
        showRecalled(step.draft)
        return
      }
      if (!onLastLine) return
      const step = recallDown(recall, recalled)
      if (!step) return
      e.preventDefault()
      setRecall(step.state)
      showRecalled(step.draft)
    },
    [recall, showRecalled, completeAtCaret, history, completions],
  )

  const focusPrompt = useCallback(() => inputRef.current?.focus(), [])

  /**
   * Send typing that starts in the transcript to the prompt, the way a
   * terminal does.
   *
   * A click in the transcript leaves focus there (it is focusable), so that
   * Cmd+A / Ctrl+A selects the log rather than the prompt's line. Moving
   * focus during keydown makes the browser deliver the key to the prompt,
   * so the character is not lost. Shortcuts (with Cmd / Ctrl / Alt) and
   * keys that type nothing stay with the transcript.
   */
  const handleBodyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return
      focusPrompt()
    },
    [focusPrompt],
  )

  return (
    <div className="console-panel">
      <div className="console-toolbar">
        <SegmentField
          compact
          fill={false}
          value={dialect}
          onValueChange={switchDialect}
          options={DIALECT_OPTIONS}
          disabled={running}
        />
        <FormButton
          minimal
          icon={<AppIcon name="ui.eraser" aria-hidden />}
          text="Clear"
          onClick={() => {
            consoleSession.clear()
            focusPrompt()
          }}
          disabled={running}
          aria-label="Clear console"
        />
        <FormButton
          minimal
          text="Help"
          onClick={() => {
            runner?.('help', dialect)
            focusPrompt()
          }}
          disabled={running || !runner}
          aria-label="List commands"
        />
        {running && (
          <>
            <span className="console-running type-caption" role="status">
              Running...
            </span>
            {/* Stops before the next command, and cancels a download in
                progress; what already ran is kept. */}
            <FormButton
              minimal
              text="Stop"
              onClick={() => { stopper?.() }}
              disabled={!stopper}
              aria-label="Stop the running commands"
            />
          </>
        )}
      </div>

      <div className="console-body" onKeyDown={handleBodyKeyDown}>
        <ConsoleTranscript lines={lines} />
      </div>

      {completions && (
        <div className="console-completions type-console" role="status" aria-label="Completions">
          {completions.map((line, i) => (
            <div key={i} className={`console-line console-line-${line.kind}`}>{line.text}</div>
          ))}
        </div>
      )}

      <div className="console-prompt">
        <span className="console-prompt-symbol type-console" aria-hidden>
          {DIALECT_PROMPTS[dialect]}
        </span>
        <TextAreaField
          ref={inputRef}
          value={draft}
          onChange={handleChange}
          onSubmit={submit}
          onKeyDown={handleKeyDown}
          submitKey="enter"
          consoleText
          minRows={1}
          maxRows={8}
          // Never disabled. Disabling a focused element makes the browser
          // drop focus and re-enabling it does not give focus back, so a
          // prompt that went disabled while a command ran left the user
          // clicking back into it after every line. `submit` declines
          // instead, which also keeps the half-typed next line rather than
          // throwing it away. A disabled prompt would additionally swallow
          // `autoFocus`, which fires once on mount and cannot retry.
          autoFocus
          placeholder={dialect === 'native' ? 'help  (or "pymol" to switch)' : 'help  (or "native" to switch)'}
          ariaLabel={`${DIALECT_PROMPTS[dialect]} command`}
        />
      </div>
    </div>
  )
}
ConsolePanel.displayName = 'ConsolePanel'
