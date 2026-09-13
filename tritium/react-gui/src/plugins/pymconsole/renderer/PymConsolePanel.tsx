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
 * Tab completes, the way PyMOL's command line does.
 */

import React, { useCallback, useRef, useState } from 'react'
import { AppIcon } from '@renderer/h3-kit/primitives'
import { FormButton, TextAreaField, isImeKey } from '@renderer/h3-kit/form'
import type { BottomTabComponent } from '@renderer/plugin-host/api'
import { IDLE, recallDown, recallUp } from '@renderer/utils/commandRecall'
import type { RecallState } from '@renderer/utils/commandRecall'
import { pymServices } from '../calls'
import { ConsoleTranscript } from './ConsoleTranscript'
import { consoleSession, useConsoleSession } from './consoleSessionStore'
import { getHistory, pushHistory } from './commandHistory'

void React

const NEWLINE = '\n'

export const PymConsolePanel: BottomTabComponent = ({
  cm,
  activeSceneId,
  activeMolViewId,
}) => {
  const { lines, running, draft, runner } = useConsoleSession()
  const [recall, setRecall] = useState<RecallState>(IDLE)
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
   * Complete the line the caret is on.
   *
   * The worker answers with the whole line rewritten, as PyMOL's completer
   * does. A pasted script is several lines in one prompt, so only the line
   * under the caret is sent and replaced; PyMOL, whose command line holds one
   * line, never has to make that distinction.
   */
  const completeAtCaret = useCallback(
    (el: HTMLTextAreaElement) => {
      if (!cm || running) return
      const value = el.value
      const caret = el.selectionStart ?? value.length
      const start = value.lastIndexOf(NEWLINE, caret - 1) + 1
      const endIndex = value.indexOf(NEWLINE, caret)
      const end = endIndex === -1 ? value.length : endIndex
      const line = value.slice(start, end)

      pymServices
        .invoke(
          cm,
          'complete',
          {
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
            consoleSession.append([{ kind: 'error', text: `Error: ${res.error}` }])
            return
          }
          consoleSession.append(res.messages)
          if (res.replacement === null) return
          const next = value.slice(0, start) + res.replacement + value.slice(end)
          setRecall(IDLE)
          showText(next, start + res.replacement.length)
        })
        .catch((e: unknown) => {
          console.error('pymconsole: complete failed:', e)
        })
    },
    [cm, running, activeSceneId, activeMolViewId, showText],
  )

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
      // While converting, these keys belong to the IME: the arrows pick a
      // candidate and Tab accepts one.
      if (isImeKey(e.nativeEvent)) return

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
    [recall, showRecalled, completeAtCaret],
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
