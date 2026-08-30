/**
 * @file features/log/LogPanel.tsx
 * @description BottomPanel "Output" tab -- presentation-only viewer that
 * renders the cuemol3 core log stream as a scrollable `<pre>` block,
 * topped with a toolbar (filter input + clear / lock / save buttons)
 * styled to match the Render tab.
 *
 * Log accumulation, filter text, autoScroll flag and the save / clear
 * callbacks all live in the parent `BottomPanel` so they survive when
 * the user switches to another bottom tab and back. This component
 * receives them as props and is responsible only for rendering the
 * toolbar, filtering the text for display, and keeping the viewport
 * pinned to the bottom while `autoScroll` is on.
 */

import React, { useRef, useEffect, useMemo } from 'react'
import styles from './LogPanel.module.css'
import { TextField, FormButton } from '@renderer/h3-kit/form'
import { AppIcon } from '@renderer/h3-kit/primitives'
import { applyLogFilter } from '@renderer/utils/logFilter'

interface LogPanelProps {
  /** Accumulated log text, newest content appended at the end. */
  contents: string
  /** Current filter expression. Empty string shows everything. */
  filter: string
  /** Whether the viewport should follow new log lines. */
  autoScroll: boolean
  onFilterChange: (value: string) => void
  onAutoScrollToggle: () => void
  onClear: () => void
  onSaveAs: () => void
}

/**
 * Toolbar + filtered log viewer. Pure presentation: every piece of state
 * lives in the parent so tab switches do not lose it.
 */
export function LogPanel({
  contents,
  filter,
  autoScroll,
  onFilterChange,
  onAutoScrollToggle,
  onClear,
  onSaveAs,
}: LogPanelProps): React.JSX.Element {
  const preRef = useRef<HTMLPreElement>(null)

  const filteredContents = useMemo(
    () => applyLogFilter(contents, filter),
    [contents, filter],
  )

  useEffect(() => {
    if (!autoScroll) return
    if (preRef.current) {
      const h = preRef.current.scrollHeight
      preRef.current.scrollTo(0, h)
    }
  }, [filteredContents, autoScroll])

  return (
    <div className={styles.bottomContainer}>
      <div className={styles.toolbar}>
        <div className={styles.filterInput}>
          <TextField
            leftIcon={<AppIcon name="ui.filter" aria-hidden />}
            placeholder="Filter (e.g. text, !excluded)"
            value={filter}
            onChange={onFilterChange}
          />
        </div>
        <FormButton
          minimal
          icon={<AppIcon name="ui.eraser" aria-hidden />}
          text="Clear"
          onClick={onClear}
          aria-label="Clear Output"
        />
        <FormButton
          minimal
          icon={<AppIcon name={autoScroll ? 'ui.unlock' : 'ui.lock'} aria-hidden />}
          text={autoScroll ? 'Unlock' : 'Lock'}
          onClick={onAutoScrollToggle}
          aria-label="Toggle Auto Scroll"
        />
        <FormButton
          minimal
          icon={<AppIcon name="ui.save" aria-hidden />}
          text="Save"
          onClick={onSaveAs}
          aria-label="Save Output As"
        />
      </div>
      {/* data-select-scope marks this as the target for scoped Select All
          (Cmd+A / Edit > Select All / right-click), so it selects only the
          log contents rather than the whole document. See
          renderer/utils/selectAllScope.ts. */}
      <pre className={styles.logContainer} ref={preRef} data-select-scope>
        {filteredContents}
      </pre>
    </div>
  )
}
