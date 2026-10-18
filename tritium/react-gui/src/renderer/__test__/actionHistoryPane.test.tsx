/**
 * @file renderer/__test__/actionHistoryPane.test.tsx
 * @description The Action history pane moves the undo stack only when asked
 * to (Go to step); looking at a step never does. And `goToStep`, the move a
 * Go to step makes.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { mountTree } from './helpers/testHarness'
import { CmdId } from '@renderer/commands/ids'
import type { ActionStepView } from '@renderer/worker/shared/actionTypes'

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

const dispatch = vi.fn((..._a: unknown[]) => Promise.resolve(true))
let steps: ActionStepView[] = []

vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({ useCueMol: () => ({ cueMolReady: true, cm: {} }) }))
vi.mock('@renderer/state/workspace', () => ({ useActiveScene: () => ({ activeSceneId: 1 }) }))
vi.mock('@renderer/contexts/UndoRedoLockContext', () => ({ useUndoRedoLocked: () => false }))
vi.mock('@renderer/commands/CommandRegistry', () => ({ useCommands: () => ({ dispatch }) }))
vi.mock('@renderer/shell/menu/ContextMenuProvider', () => ({ useShowContextMenu: () => vi.fn() }))
vi.mock('@renderer/hooks/useClipboardScope', () => ({ useClipboardScope: () => undefined }))
vi.mock('@renderer/features/actions/useActionSteps', () => ({
  useActionSteps: () => ({ steps, refetch: () => undefined }),
}))

import { ActionHistoryPane } from '@renderer/features/actions/ActionHistoryPane'
import { goToStep } from '@renderer/features/actions/goToStep'

void React

const entry = (text: string) => ({ kind: 'op' as const, op: 'set_visible', text, line: text, args: [] })
const step = (id: number, undone: boolean, n = 1): ActionStepView => ({
  id,
  text: `step ${id}`,
  label: `step ${id}`,
  source: 'gui',
  time: null,
  undone,
  entries: Array.from({ length: n }, (_, i) => entry(`op ${id}.${i}`)),
})

/** The tree row whose text is `text`. */
function row(container: HTMLElement, text: string): HTMLElement {
  const label = Array.from(container.querySelectorAll('[data-row-id]')).find((e) => e.textContent === text)
  if (!label) throw new Error(`no row ${text}`)
  return label.closest('.bp5-tree-node-content') as HTMLElement
}

const fire = (el: HTMLElement, type: string) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true }))
  })

describe('ActionHistoryPane', () => {
  beforeEach(() => dispatch.mockClear())

  it('shows a step or one of its ops in the inspector without going to it', () => {
    steps = [step(1, false), step(2, false, 2), step(3, true)]
    const { container } = mountTree(<ActionHistoryPane collapsed={false} onToggleCollapse={() => undefined} />)

    fire(row(container, 'step 1'), 'click')
    fire(row(container, 'step 1'), 'dblclick')
    fire(row(container, 'step 3'), 'dblclick')
    fire(row(container, 'step 2').querySelector('.h3-tree-caret') as HTMLElement, 'click')
    fire(row(container, 'op 2.1'), 'click')

    const ids = dispatch.mock.calls.map((c) => c[0])
    expect(ids).not.toContain(CmdId.ActionsGoToStep)
    expect(dispatch.mock.calls.filter((c) => c[0] === CmdId.ActionsShowStep).map((c) => c[1])).toEqual([
      { stepId: 1 },
      { stepId: 3 },
      { stepId: 2, entryIndex: 1 },
    ])
  })
})

describe('goToStep', () => {
  it('undoes or redoes to leave the step as the last one done', () => {
    // Steps 1 and 2 are done, 3 and 4 undone.
    const s = [step(1, false), step(2, false), step(3, true), step(4, true)]
    expect(goToStep(s, null)).toEqual({ kind: 'undo', depth: 1 })
    expect(goToStep(s, 1)).toEqual({ kind: 'undo', depth: 0 })
    expect(goToStep(s, 2)).toBeNull()
    expect(goToStep(s, 4)).toEqual({ kind: 'redo', depth: 1 })
    expect(goToStep(s, 99)).toBeNull()
  })
})
