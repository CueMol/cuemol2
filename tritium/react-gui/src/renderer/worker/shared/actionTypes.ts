/**
 * @file worker/shared/actionTypes.ts
 * @description The action log (one row per undo step, see
 * `worker/server/actions/actionLog.ts`) as the renderer sees it, and the
 * push that says it changed.
 */

/** Push channel: a scene's undo steps changed. Payload: the scene uid. */
export const ACTIONS_CHANGED_CHANNEL = 'actions-changed'

/** One argument of a recorded op, written out. */
export interface ActionArgView {
  name: string
  /** The value as text; a node by its path, or `#uid` when it has none. */
  value: string
}

/** One thing a step ran: an op, or a note for what no op expresses. */
export interface ActionEntryView {
  kind: 'op' | 'note'
  /** The op's catalogue name; null for a note. */
  op: string | null
  /** What it did, for a person (`Set width = 2.5 on 1crn/cartoon1`). */
  text: string
  /** The native console line that runs it again; the note text for a note. */
  line: string
  args: ActionArgView[]
}

/** One undo step. */
export interface ActionStepView {
  /** Stable in the session; rows before and after it may come and go. */
  id: number
  /** What it did: its first op, or its label when it has none. */
  text: string
  /** The undo stack's own description of it. */
  label: string
  /** gui / cmd / pym / mcp / ai / qax; null when only the stack knew it. */
  source: string | null
  /** ISO 8601 commit time; null when only the stack knew it. */
  time: string | null
  /** On the redo side. */
  undone: boolean
  entries: ActionEntryView[]
}

/** A range of steps of a scene, by id, oldest first whatever the order given. */
export interface ActionStepsArgs {
  sceneId: number
  stepIds: number[]
}
