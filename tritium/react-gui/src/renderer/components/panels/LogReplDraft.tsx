/**
 * @file components/panels/LogReplDraft.tsx
 * @description Draft (unused) of a scrollable output log with an embedded
 * REPL prompt. Kept as a starting point for a future REPL-enabled Output
 * tab; the active bottom Output panel is `LogPanel`.
 *
 * Submit: Enter fires `onCommand` with the trimmed input and clears the
 * field. History navigation: Up / Down cycle through previously submitted
 * commands (newest-first ring stored in local state). Auto-scroll: the
 * log view scrolls to the bottom whenever new entries are appended.
 * Click-to-focus: clicking anywhere in the panel focuses the input.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Tag } from "@blueprintjs/core";
import type { LogEntry } from "../../types";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/**
 * Maps each log level to a Blueprint `Tag` intent so entries are
 * colour-coded without conditional logic in the render loop.
 *
 * | Level   | Intent    | Visual colour   |
 * |---------|-----------|-----------------|
 * | INFO    | none      | neutral / grey  |
 * | WARN    | warning   | amber           |
 * | ERROR   | danger    | red             |
 * | DEBUG   | primary   | blue            |
 */
const LEVEL_INTENT: Record<LogEntry["level"], "none" | "warning" | "danger" | "primary"> = {
  INFO: "none",
  WARN: "warning",
  ERROR: "danger",
  DEBUG: "primary",
};

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

interface LogLineProps {
  /** The log entry to render. */
  entry: LogEntry;
}

/**
 * A single row in the log output area.
 *
 * Extracted to keep the parent render function readable and to give each
 * row a stable component boundary for React's reconciler.
 */
const LogLine: React.FC<LogLineProps> = ({ entry }) => (
  <div className={`log-line log-${entry.level.toLowerCase()}`}>
    <span className="log-time">{entry.time}</span>
    <Tag
      minimal
      intent={LEVEL_INTENT[entry.level]}
      className="log-level-tag"
    >
      {entry.level}
    </Tag>
    <span className="log-msg">{entry.msg}</span>
  </div>
);

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

interface LogReplDraftProps {
  /** Ordered list of log entries to display, newest last. */
  logs: LogEntry[];
  /**
   * Callback invoked when the user submits a non-empty command.
   *
   * The string is already trimmed; the panel handles clearing the input
   * and pushing to history internally.
   *
   * @param cmd - Trimmed command string.
   */
  onCommand: (cmd: string) => void;
}

/**
 * Scrollable log viewer combined with a command-history-aware REPL prompt.
 *
 * All REPL state (current input, command history, history cursor) is local
 * to this component because it has no meaning outside the panel.
 */
export const LogReplDraft: React.FC<LogReplDraftProps> = ({ logs, onCommand }) => {
  // ── REPL state ─────────────────────────────────────────────

  /** Current value of the command input field. */
  const [cmd, setCmd] = useState("");

  /**
   * Ring buffer of previously submitted commands.
   * Stored newest-first so index 0 is always the most recent entry,
   * matching the expected ↑-key behaviour.
   */
  const [history, setHistory] = useState<string[]>([]);

  /**
   * Cursor into `history`; `-1` means the user is on a fresh (unsaved) input.
   * Incremented on ↑, decremented on ↓, reset to `-1` after each submission.
   */
  const [historyIdx, setHistoryIdx] = useState(-1);

  // ── Refs ────────────────────────────────────────────────────

  /** Sentinel element placed after the last log line for scroll-into-view. */
  const logEndRef = useRef<HTMLDivElement>(null);

  /** Direct reference to the `<input>` so we can `focus()` it on click. */
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Effects ─────────────────────────────────────────────────

  /**
   * Auto-scroll to the bottom of the log output whenever new entries arrive.
   * Uses smooth scrolling so rapid bursts of messages don't cause jarring
   * jumps.
   */
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── Handlers ────────────────────────────────────────────────

  /**
   * Submit the current command string.
   *
   * Guards against empty / whitespace-only input, prepends the trimmed
   * string to the history ring, resets the history cursor, and clears the
   * input field.
   */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = cmd.trim();
      if (!trimmed) return;

      onCommand(trimmed);
      setHistory((prev) => [trimmed, ...prev]);
      setHistoryIdx(-1);
      setCmd("");
    },
    [cmd, onCommand]
  );

  /**
   * Handle ↑ / ↓ key presses to navigate command history.
   *
   * - `↑` moves the cursor toward older commands (higher index).
   * - `↓` moves the cursor toward newer commands (lower index); reaching
   *   `-1` restores an empty input so the user can type a fresh command.
   *
   * Both keys call `preventDefault` to prevent the caret from jumping to
   * the start/end of the input text.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const nextIdx = Math.min(historyIdx + 1, history.length - 1);
        setHistoryIdx(nextIdx);
        if (history[nextIdx] !== undefined) setCmd(history[nextIdx]);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = historyIdx - 1;
        if (nextIdx < 0) {
          setHistoryIdx(-1);
          setCmd("");
        } else {
          setHistoryIdx(nextIdx);
          setCmd(history[nextIdx]);
        }
      }
    },
    [history, historyIdx]
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="log-panel" onClick={() => inputRef.current?.focus()}>
      {/* Header */}
      <div className="log-panel-header">
        <span className="log-panel-title">
          <span style={{ marginRight: 6 }}>⬢</span>Output
        </span>
        <Tag minimal round className="log-count">
          {logs.length}
        </Tag>
      </div>

      {/* Scrollable log output */}
      <div className="log-output">
        {logs.map((log, i) => (
          <LogLine key={i} entry={log} />
        ))}
        {/* Scroll anchor — kept invisible at the bottom of the list */}
        <div ref={logEndRef} />
      </div>

      {/* REPL prompt */}
      <form className="log-prompt" onSubmit={handleSubmit}>
        <span className="prompt-symbol">❯</span>
        <input
          ref={inputRef}
          type="text"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command... (type 'help' for commands)"
          className="prompt-input"
          spellCheck={false}
        />
      </form>
    </div>
  );
};
