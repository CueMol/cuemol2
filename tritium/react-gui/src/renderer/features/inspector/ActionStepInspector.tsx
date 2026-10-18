/**
 * @file features/inspector/ActionStepInspector.tsx
 * @description One undo step of the action log, or one op of it, read-only,
 * in the right InspectorPanel (the `actionStep` target, picked in the Action
 * history pane).
 *
 * A step shows its undo label, who made it and when, and whether it is
 * undone. A step of one op shows that op below (its console line and its
 * arguments); a step of several only says how many it ran, each op's detail
 * being its own row of the pane (`entryIndex`), laid out as the one-op step
 * is: the step first, then the op.
 * The step's or the op's one-line text is the panel header, so it is not
 * repeated in the body. Nothing here moves the undo stack -- going to a step
 * is the history pane's explicit Go to step.
 *
 * Built from the parts every inspector page uses (the Scene page's): a
 * `FlatSection` per level (Step, Op) and a `PropertyField` row per value,
 * a read-only `TextField` in it.
 *
 * Self-fetches like `AnimElementInspector` (the generic property bridge has
 * nothing to say about a step) and refetches on the `actions-changed` push.
 * A step can leave the history while it is shown (a new edit drops the redo
 * side); the panel then says so instead of closing under the user.
 */

import React, { useEffect } from 'react'
import { PropertyField, TextField } from '@renderer/h3-kit/form'
import { FlatSection } from './AccordionSection'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { ActionEntryView, ActionStepView } from '@renderer/worker/shared/actionTypes'
import { useActionSteps } from '@renderer/features/actions/useActionSteps'

interface ActionStepInspectorProps {
  cm: AsyncCueMol | null
  sceneId: number
  stepId: number
  /** One op of the step; the step itself when undefined. */
  entryIndex?: number
  /** Report the header (name, type label) the inspector shows. */
  onHeaderChange: (name: string, type: string) => void
}

/** Who made a step, in words. */
const SOURCE_LABELS: Record<string, string> = {
  gui: 'GUI',
  cmd: 'Console',
  pym: 'Console (PyMOL)',
  mcp: 'MCP',
  ai: 'AI agent',
  qax: 'qax replay',
}

/** A read-only value; selectable, so a line can be copied out. */
const Value: React.FC<{ text: string; mono?: boolean }> = ({ text, mono }) => (
  <TextField value={text} onChange={() => undefined} readOnly mono={mono} />
)

/** Undo label, origin, time and state of a step. */
const StepFields: React.FC<{ step: ActionStepView }> = ({ step }) => (
  <>
    <PropertyField label="Undo label">
      <Value text={step.label} />
    </PropertyField>
    <PropertyField label="From">
      <Value text={step.source ? (SOURCE_LABELS[step.source] ?? step.source) : 'Unknown'} />
    </PropertyField>
    {step.time && (
      <PropertyField label="Time">
        <Value text={new Date(step.time).toLocaleString()} />
      </PropertyField>
    )}
    <PropertyField label="State">
      <Value text={step.undone ? 'Undone (on the redo side)' : 'Done'} />
    </PropertyField>
  </>
)

/** One op: its name, the console line that runs it again, then its arguments. */
const EntryFields: React.FC<{ entry: ActionEntryView }> = ({ entry }) =>
  entry.kind === 'note' ? (
    <div className="action-step-note type-caption">{entry.line}</div>
  ) : (
    <>
      <PropertyField label="Name">
        <Value text={entry.op ?? ''} mono />
      </PropertyField>
      <PropertyField label="Command">
        <Value text={entry.line} mono />
      </PropertyField>
      {entry.args.map((a) => (
        <PropertyField key={a.name} label={a.name}>
          <Value text={a.value} mono />
        </PropertyField>
      ))}
    </>
  )

/** An op's section title; its name is a field of the section. */
function entryTitle(entry: ActionEntryView, index: number, count: number): string {
  if (entry.kind === 'note') return 'Note'
  return count > 1 ? `Op ${index + 1} of ${count}` : 'Op'
}

export const ActionStepInspector: React.FC<ActionStepInspectorProps> = ({
  cm,
  sceneId,
  stepId,
  entryIndex,
  onHeaderChange,
}) => {
  const { steps } = useActionSteps(cm, sceneId)
  const step = steps.find((s) => s.id === stepId)
  const entry = step && entryIndex !== undefined ? step.entries[entryIndex] : undefined
  const count = step?.entries.length ?? 0

  useEffect(() => {
    if (!step) return
    if (entry && entryIndex !== undefined) onHeaderChange(entry.text, `op ${entryIndex + 1} of ${count}`)
    else onHeaderChange(step.text, count > 1 ? `${count} ops` : step.undone ? 'undone' : '')
  }, [step, entry, entryIndex, count, onHeaderChange])

  if (!step || (entryIndex !== undefined && !entry)) {
    return <div className="inspector-empty">This step is no longer in the undo history.</div>
  }

  // A step of several ops says so and nothing more; its ops are rows of their own.
  const shown = entry ?? (count === 1 ? step.entries[0] : undefined)
  const shownIndex = entry ? (entryIndex as number) : 0
  return (
    <div className="inspector-body">
      <div className="insp-properties-tab">
        <FlatSection title="Step">
          <StepFields step={step} />
          {count > 1 && (
            <PropertyField label="Ops">
              <Value text={`${count} ops`} />
            </PropertyField>
          )}
        </FlatSection>
        {shown ? (
          <FlatSection title={entryTitle(shown, shownIndex, count)}>
            <EntryFields entry={shown} />
          </FlatSection>
        ) : count === 0 ? (
          <FlatSection title="Ops">
            <div className="action-step-note type-caption">
              No op was recorded for this edit; it cannot be saved as anything but a note.
            </div>
          </FlatSection>
        ) : null}
      </div>
    </div>
  )
}
