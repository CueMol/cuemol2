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
 * Tab completes as zsh does (@cuemol/console-kit completion.ts, shared with
 * tritium_cli): several candidates are listed in a strip just above the
 * prompt, not the transcript; a second Tab starts a menu on them, which Tab,
 * Shift+Tab and the arrows walk, Enter accepts, Esc backs out of, and any
 * other key accepts and goes on. A click accepts one too.
 *
 * The console speaks one dialect at a time: native (CueMol's own commands,
 * generated from the op catalogue) or PyMOL. The switch in the toolbar, or
 * typing just `native` or `pymol`, changes it; the choice is a plugin
 * preference, and each dialect keeps its own history.
 */

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { layoutSections, menuText, moveMenu } from '@cuemol/console-kit'
import type { CompletionMenu, MenuMove } from '@cuemol/console-kit'
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

/** The keys that walk an open menu. */
const MENU_ARROWS: Record<string, MenuMove> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

/** A menu over a Tab's candidates, and where in the prompt it writes. */
interface MenuView {
  menu: CompletionMenu
  /** The prompt before the caret's line. */
  before: string
  /** The prompt after the caret. */
  rest: string
}

/** Characters of the console font that fit across `el`. */
function cellsAcross(el: HTMLElement): number {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return 80
  const style = getComputedStyle(el)
  ctx.font = style.font
  const ch = ctx.measureText('0').width || 8
  const inner = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  return Math.max(1, Math.floor(inner / ch))
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
  // Why the last Tab found nothing; null when nothing is shown.
  const [notes, setNotes] = useState<ConsoleEntry[] | null>(null)
  // The last Tab's candidates, listed or walked; null when none are shown.
  const [menuView, setMenuView] = useState<MenuView | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  // The strip's width in characters, for the grid.
  const [cells, setCells] = useState(80)
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

  const closeMenu = useCallback(() => {
    setMenuView(null)
    setNotes(null)
  }, [])

  /** Write what the menu stands for before the caret, keeping the rest. */
  const showMenu = useCallback(
    (view: MenuView) => {
      const head = joinBeforeCaret(menuText(view.menu), view.rest)
      showText(view.before + head + view.rest, view.before.length + head.length)
    },
    [showText],
  )

  const sections = useMemo(
    () => (menuView ? layoutSections(menuView.menu.candidates, cells) : []),
    [menuView, cells],
  )

  /** Move the menu (starting it on a listed one) and show the selection. */
  const walkMenu = useCallback(
    (move: MenuMove) => {
      if (!menuView) return
      const next = { ...menuView, menu: moveMenu(menuView.menu, move, sections) }
      setMenuView(next)
      setRecall(IDLE)
      showMenu(next)
    },
    [menuView, sections, showMenu],
  )

  /** Accept a candidate by index (a click), or the selection. */
  const acceptMenu = useCallback(
    (index?: number) => {
      if (!menuView) return
      if (index !== undefined) showMenu({ ...menuView, menu: { ...menuView.menu, selected: index } })
      closeMenu()
      inputRef.current?.focus()
    },
    [menuView, showMenu, closeMenu],
  )

  // The grid follows the strip's width, measured while the strip is up.
  const listing = menuView !== null
  useLayoutEffect(() => {
    const el = stripRef.current
    if (!el) return
    setCells(cellsAcross(el))
    // Absent outside a browser (jsdom): the grid keeps its first measure.
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setCells(cellsAcross(el)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [listing])

  // Keep the selection in view in a list that scrolls.
  useLayoutEffect(() => {
    stripRef.current?.querySelector('.is-selected')?.scrollIntoView?.({ block: 'nearest' })
  }, [menuView])

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
            setMenuView(null)
            setNotes([{ kind: 'error', text: `Error: ${res.error}` }])
            return
          }
          setNotes(res.messages.length > 0 ? res.messages : null)
          const rest = value.slice(caret)
          const head = res.replacement === null ? line : joinBeforeCaret(res.replacement, rest)
          const before = value.slice(0, start)
          if (res.candidates && res.candidates.length > 1) {
            setMenuView({ menu: { candidates: res.candidates, original: head, selected: -1 }, before, rest })
          } else {
            setMenuView(null)
          }
          if (res.replacement === null) return
          setRecall(IDLE)
          showText(before + head + rest, start + head.length)
        })
        .catch((e: unknown) => {
          console.error('console: complete failed:', e)
        })
    },
    [cm, running, activeSceneId, activeMolViewId, showText, dialect],
  )

  const submit = useCallback(() => {
    // Enter in a menu takes the selection; it does not run the line.
    if (menuView && menuView.menu.selected >= 0) {
      acceptMenu()
      return
    }
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
    closeMenu()
    consoleSession.setDraft('')
    runner(text, dialect)
  }, [draft, running, runner, dialect, history, switchDialect, menuView, acceptMenu, closeMenu])

  // Typing accepts what the menu shows and goes on from there.
  const handleChange = useCallback(
    (value: string) => {
      consoleSession.setDraft(value)
      setRecall(IDLE)
      closeMenu()
    },
    [closeMenu],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // While converting, these keys belong to the IME: the arrows pick a
      // candidate and Tab accepts one.
      if (isImeKey(e.nativeEvent)) return

      const walking = menuView !== null && menuView.menu.selected >= 0
      if (e.key === 'Escape' && (menuView || notes)) {
        e.preventDefault()
        // Out of a menu, back to what was typed.
        if (walking) showMenu({ ...menuView, menu: { ...menuView.menu, selected: -1 } })
        closeMenu()
        return
      }

      if (e.key === 'Tab') {
        if (e.altKey || e.ctrlKey || e.metaKey) return
        // Shift+Tab steps back in a list; elsewhere it is left alone as the
        // way out of the prompt by keyboard. Plain Tab never moves focus.
        if (e.shiftKey && !menuView) return
        e.preventDefault()
        if (menuView) walkMenu(e.shiftKey ? 'prev' : 'next')
        else completeAtCaret(e.currentTarget)
        return
      }

      const arrow = MENU_ARROWS[e.key]
      if (walking && arrow && !(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)) {
        e.preventDefault()
        walkMenu(arrow)
        return
      }
      // Any other key accepts the menu and does what it does.
      if (menuView && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) closeMenu()

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
    [recall, showRecalled, completeAtCaret, history, menuView, notes, showMenu, closeMenu, walkMenu],
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

      {(menuView || notes) && (
        <div ref={stripRef} className="console-completions type-console" role="status" aria-label="Completions">
          {notes?.map((line, i) => (
            <div key={i} className={`console-line console-line-${line.kind}`}>{line.text}</div>
          ))}
          {menuView && sections.map((sec) => (
            <div key={sec.start}>
              {sections.length > 1 && <div className="console-completion-heading">{sec.group}</div>}
              <div
                className="console-completion-grid"
                style={{
                  gridTemplateColumns: `repeat(${sec.columns}, ${sec.cellWidth}ch)`,
                  gridTemplateRows: `repeat(${sec.rows}, auto)`,
                }}
              >
                {menuView.menu.candidates.slice(sec.start, sec.start + sec.count).map((c, k) => (
                  <div
                    key={sec.start + k}
                    className={`console-completion console-completion-${c.kind}${
                      sec.start + k === menuView.menu.selected ? ' is-selected' : ''
                    }`}
                    // Keep the prompt focused through the click.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      acceptMenu(sec.start + k)
                    }}
                  >
                    {c.label}
                  </div>
                ))}
              </div>
            </div>
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
