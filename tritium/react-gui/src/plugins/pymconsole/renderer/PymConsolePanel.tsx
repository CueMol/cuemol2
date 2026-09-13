/**
 * @file plugins/pymconsole/renderer/PymConsolePanel.tsx
 * @description The PyM console tab: a transcript with a prompt under it.
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
 */

import React, { useCallback, useRef, useState } from 'react'
import { AppIcon } from '@renderer/h3-kit/primitives'
import { FormButton, TextAreaField, isImeKey } from '@renderer/h3-kit/form'
import type { BottomTabComponent } from '@renderer/plugin-host/api'
import { IDLE, recallDown, recallUp } from '@renderer/utils/commandRecall'
import type { RecallState } from '@renderer/utils/commandRecall'
import { ConsoleTranscript } from './ConsoleTranscript'
import { consoleSession, useConsoleSession } from './consoleSessionStore'
import { getHistory, pushHistory } from './commandHistory'

void React

const NEWLINE = '\n'

export const PymConsolePanel: BottomTabComponent = () => {
  const { lines, running, draft, runner } = useConsoleSession()
  const [recall, setRecall] = useState<RecallState>(IDLE)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /** Show a recalled line and put the caret at its end. */
  const showRecalled = useCallback((text: string) => {
    consoleSession.setDraft(text)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (el) el.setSelectionRange(text.length, text.length)
    })
  }, [])

  const submit = useCallback(() => {
    const text = draft.trim()
    if (text === '' || running || !runner) return
    // Recorded before running: a line that failed is exactly the one worth
    // getting back.
    pushHistory(text)
    setRecall(IDLE)
    consoleSession.setDraft('')
    runner(text)
  }, [draft, running, runner])

  const handleChange = useCallback((value: string) => {
    consoleSession.setDraft(value)
    setRecall(IDLE)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      // While converting, the arrows pick an IME candidate.
      if (isImeKey(e.nativeEvent)) return

      const el = e.currentTarget
      const before = el.value.slice(0, el.selectionStart ?? 0)
      const after = el.value.slice(el.selectionEnd ?? 0)
      const onFirstLine = !before.includes(NEWLINE)
      const onLastLine = !after.includes(NEWLINE)

      const history = getHistory()
      if (e.key === 'ArrowUp') {
        if (!onFirstLine) return
        const step = recallUp(recall, el.value, history)
        if (!step) return
        e.preventDefault()
        setRecall(step.state)
        showRecalled(step.draft)
        return
      }
      if (!onLastLine) return
      const step = recallDown(recall, history)
      if (!step) return
      e.preventDefault()
      setRecall(step.state)
      showRecalled(step.draft)
    },
    [recall, showRecalled],
  )

  const focusPrompt = useCallback(() => inputRef.current?.focus(), [])

  /**
   * Put the caret back in the prompt after a click in the transcript, the way
   * a terminal does -- but not when that click finished a selection.
   *
   * Focusing an input collapses the document selection, so doing this
   * unconditionally made the transcript impossible to select: every drag
   * ended by throwing away what it had just selected.
   */
  const handleBodyClick = useCallback(() => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    focusPrompt()
  }, [focusPrompt])

  return (
    <div className="pymc-panel">
      <div className="pymc-toolbar">
        <span className="pymc-title type-panel-title">PyM Console</span>
        {running && (
          <span className="pymc-running type-caption" role="status">
            Running...
          </span>
        )}
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
            runner?.('help')
            focusPrompt()
          }}
          disabled={running || !runner}
          aria-label="List commands"
        />
      </div>

      <div className="pymc-body" onClick={handleBodyClick}>
        <ConsoleTranscript lines={lines} />
      </div>

      <div className="pymc-prompt">
        <span className="pymc-prompt-symbol type-console" aria-hidden>
          PyM&gt;
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
          placeholder="help"
          ariaLabel="PyM command"
        />
      </div>
    </div>
  )
}
PymConsolePanel.displayName = 'PymConsolePanel'
