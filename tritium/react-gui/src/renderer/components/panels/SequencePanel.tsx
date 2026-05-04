/**
 * @file SequencePanel.tsx
 * @description Multiple Sequence Alignment (MSA) viewer panel.
 *
 * ## Layout
 *
 * ```
 * ┌──────────────┬─────────────────────────────────────────┐
 * │              │  50   55   60   65   70   75   ...      │ ← position ruler
 * ├──────────────┼─────────────────────────────────────────┤
 * │ A:P34897_0   │ ESLSDSDPEMWELLQREKDRQCRGLELIA...        │ ← aligned rows
 * │ L:P34897_0   │ ------DPEMWELLQREKDRQ---------...       │
 * │ A:5v7i       │ ESLSDSDPEMWELLQREKDRQCRGLELIA...        │
 * │ B:5v7i       │ ESLSDSDPEMWELLQREKDRQCRGLELIA...        │
 * └──────────────┴─────────────────────────────────────────┘
 *                  ← horizontal scroll for long alignments →
 * ```
 *
 * The label column is fixed on the left while the sequence area scrolls
 * horizontally. A position ruler at the top shows residue numbering with
 * tick marks every 5 positions and labels every 10 positions.
 *
 * @module SequencePanel
 */

import React, { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { Icon } from "@blueprintjs/core";
import type { AlignmentData, AlignmentEntry } from "../../types";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/** Width of each residue cell in pixels. */
const CELL_WIDTH = 9.6;
/** Height of each sequence row in pixels. */
const ROW_HEIGHT = 20;
/** Height of the ruler area in pixels. */
const RULER_HEIGHT = 24;
/** Width of the label column in pixels. */
const LABEL_WIDTH = 140;

// ────────────────────────────────────────────────────────────
// Sub-component: PositionRuler
// ────────────────────────────────────────────────────────────

interface PositionRulerProps {
  /** Starting residue position (1-based). */
  startPos: number;
  /** Total number of columns in the alignment. */
  length: number;
}

/**
 * Horizontal ruler showing residue position numbers and tick marks.
 *
 * Major ticks are drawn every 10 positions with a numeric label;
 * minor ticks appear every 5 positions without labels.
 */
const PositionRuler: React.FC<PositionRulerProps> = ({ startPos, length }) => {
  const ticks: JSX.Element[] = [];

  for (let i = 0; i < length; i++) {
    const pos = startPos + i;

    if (pos % 10 === 0) {
      // Major tick with label
      ticks.push(
        <div
          key={`tick-${i}`}
          className="msa-ruler-tick msa-ruler-major"
          style={{ left: i * CELL_WIDTH }}
        >
          <span className="msa-ruler-label">{pos}</span>
          <span className="msa-ruler-mark" />
        </div>
      );
    } else if (pos % 5 === 0) {
      // Minor tick without label
      ticks.push(
        <div
          key={`tick-${i}`}
          className="msa-ruler-tick msa-ruler-minor"
          style={{ left: i * CELL_WIDTH }}
        />
      );
    }
  }

  return (
    <div className="msa-ruler" style={{ height: RULER_HEIGHT }}>
      <div
        className="msa-ruler-track"
        style={{ width: length * CELL_WIDTH, position: "relative" }}
      >
        {ticks}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Sub-component: SequenceRow
// ────────────────────────────────────────────────────────────

interface SequenceRowProps {
  /** The aligned sequence string (may contain gap characters '-'). */
  sequence: string;
  /** Whether this row is currently highlighted. */
  highlighted: boolean;
}

/**
 * A single row of aligned residue characters.
 *
 * Each character is rendered at a fixed width so columns align perfectly
 * across all rows. Gap characters ('-') receive a dimmed style.
 */
const SequenceRow: React.FC<SequenceRowProps> = ({ sequence, highlighted }) => (
  <div
    className={`msa-seq-row ${highlighted ? "msa-row-highlight" : ""}`}
    style={{ height: ROW_HEIGHT }}
  >
    {sequence.split("").map((char, i) => (
      <span
        key={i}
        className={`msa-residue ${char === "-" ? "msa-gap" : ""}`}
        style={{ width: CELL_WIDTH }}
      >
        {char}
      </span>
    ))}
  </div>
);

// ────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────

interface SequencePanelProps {
  /** Alignment data containing all entries for the MSA viewer. */
  alignment: AlignmentData | null;
}

/**
 * Multiple Sequence Alignment viewer.
 *
 * Features:
 * - Fixed label column on the left
 * - Horizontally scrollable sequence area
 * - Position ruler with major/minor tick marks
 * - Row highlighting on hover
 * - Synchronized vertical scroll between labels and sequences
 */
export const SequencePanel: React.FC<SequencePanelProps> = ({ alignment }) => {
  const seqScrollRef = useRef<HTMLDivElement>(null);
  const labelScrollRef = useRef<HTMLDivElement>(null);
  const [hoveredRow, setHoveredRow] = useState<number>(-1);

  /** Sync vertical scroll between label and sequence panes. */
  const handleSeqScroll = useCallback(() => {
    if (seqScrollRef.current && labelScrollRef.current) {
      labelScrollRef.current.scrollTop = seqScrollRef.current.scrollTop;
    }
  }, []);

  /** Alignment length (number of columns). */
  const alignmentLength = useMemo(
    () => alignment?.entries[0]?.sequence.length ?? 0,
    [alignment]
  );

  // Empty state
  if (!alignment || alignment.entries.length === 0) {
    return (
      <div className="sequence-panel">
        <div className="sequence-placeholder">
          <Icon icon="widget" size={48} className="placeholder-icon" />
          <div>No alignment data available</div>
        </div>
      </div>
    );
  }

  return (
    <div className="sequence-panel">
      <div className="msa-container">
        {/* ── Fixed label column ── */}
        <div className="msa-label-column" style={{ width: LABEL_WIDTH }}>
          {/* Spacer to align with ruler */}
          <div className="msa-label-spacer" style={{ height: RULER_HEIGHT }} />
          {/* Scrollable label list */}
          <div className="msa-label-scroll" ref={labelScrollRef}>
            {alignment.entries.map((entry, idx) => (
              <div
                key={entry.id}
                className={`msa-label ${hoveredRow === idx ? "msa-row-highlight" : ""}`}
                style={{ height: ROW_HEIGHT }}
                onMouseEnter={() => setHoveredRow(idx)}
                onMouseLeave={() => setHoveredRow(-1)}
                title={entry.label}
              >
                {entry.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Scrollable sequence area ── */}
        <div className="msa-seq-area">
          {/* Position ruler */}
          <div className="msa-ruler-wrapper">
            <PositionRuler
              startPos={alignment.startPosition}
              length={alignmentLength}
            />
          </div>

          {/* Sequence rows */}
          <div
            className="msa-seq-scroll"
            ref={seqScrollRef}
            onScroll={handleSeqScroll}
          >
            <div
              className="msa-seq-inner"
              style={{ minWidth: alignmentLength * CELL_WIDTH }}
            >
              {alignment.entries.map((entry, idx) => (
                <div
                  key={entry.id}
                  onMouseEnter={() => setHoveredRow(idx)}
                  onMouseLeave={() => setHoveredRow(-1)}
                >
                  <SequenceRow
                    sequence={entry.sequence}
                    highlighted={hoveredRow === idx}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
