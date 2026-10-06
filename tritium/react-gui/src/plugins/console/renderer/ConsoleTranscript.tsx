/**
 * @file plugins/console/renderer/ConsoleTranscript.tsx
 * @description The scrolling record of what was typed and what came back.
 *
 * Monospaced and plain: a console's output is columnar (file listings,
 * property values) and proportional type breaks that. `data-select-scope`
 * makes Cmd+A select the transcript rather than the whole window, the way it
 * does in the Output tab. It is focusable (`tabIndex={-1}`, a click but not
 * Tab) so that a click keeps focus here instead of in the prompt, which
 * would otherwise take Cmd+A for its own line.
 */

import React, { useEffect, useRef } from 'react'
import { AppIcon } from '@renderer/h3-kit/primitives'
import type { ConsoleLine } from './consoleSessionStore'

void React

interface ConsoleTranscriptProps {
  lines: readonly ConsoleLine[]
}

export const ConsoleTranscript: React.FC<ConsoleTranscriptProps> = ({ lines }) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Follow the tail. No "did the user scroll up" test: a console that stops
  // following while a command is still printing is worse than one that always
  // does, and the scrollbar is right there.
  useEffect(() => {
    const el = scrollRef.current
    // `scrollTop`, not `scrollTo`: the same result for a vertical-only view,
    // and a plain property rather than a method jsdom does not implement.
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div className="console-transcript type-console" ref={scrollRef} tabIndex={-1} data-select-scope>
      {lines.length === 0 ? (
        <div className="console-empty">
          <AppIcon name="panel.console" size={32} aria-hidden />
          <div className="console-empty-text">
            A CueMol command line, with a PyMOL dialect. Type <code>help</code> to see what it knows.
          </div>
        </div>
      ) : (
        lines.map((line) => (
          <div key={line.id} className={`console-line console-line-${line.kind}`}>
            {line.text === '' ? '\u00a0' : line.text}
          </div>
        ))
      )}
    </div>
  )
}
ConsoleTranscript.displayName = 'ConsoleTranscript'
