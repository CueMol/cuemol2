/**
 * @file features/inspector/rendererSectionParity.test.tsx
 * @description What every renderer's Properties page looks like, frozen.
 *
 * The per-type sections are being replaced by a schema the engine renders
 * from. Nothing about the page is supposed to change while that happens, but
 * "nothing changed" across 18 renderer types and 4,900 lines is not something
 * anyone can check by eye, so it is checked here instead.
 *
 * The page's sections are mutually exclusive -- opening one closes the rest --
 * so each is opened in turn and two things recorded for it: what it shows
 * (row labels, the control kind each row renders, whether it is disabled /
 * modified / resettable, the options of a select, the value shown) and what it
 * writes (one interaction per row -- the resulting `onSet` / `onSetMany`
 * calls). Both go into a snapshot.
 *
 * A migration that renders the same page passes untouched. A migration that
 * drops a row, reorders one, changes a control, loses a gate or writes a
 * different value fails with the difference spelled out. Run with `-u` only
 * when a change to the page is the point.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { mountTree, pressStepArrow } from '@renderer/__test__/helpers/testHarness'
import { PropertiesTab } from './PropertiesTab'
import { RENDERER_PROP_FIXTURES } from '@renderer/features/inspector/__fixtures__/rendererPropFixtures'

void React

// The material row lists names from the worker; without a bridge it renders
// its select empty, which is a stable state for a snapshot.
vi.mock('@renderer/hooks/cuemol/useCueMol', () => ({
  useCueMol: () => ({ cm: null, cueMolReady: false }),
}))
// The theme decides colours, not structure. Standing it in keeps the real
// controls -- the selection picker especially -- rendering as they do in the
// app, which is what the snapshot is here to compare.
vi.mock('@renderer/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: () => undefined, setTheme: () => undefined }),
}))

interface SetCall {
  key: string
  type: string
  value: string | number | boolean
  mode?: string
}

const calls: { set: SetCall[]; setMany: unknown[]; reset: string[] } = {
  set: [], setMany: [], reset: [],
}

beforeEach(() => {
  calls.set = []
  calls.setMany = []
  calls.reset = []
})

/**
 * Set an input's value the way a user's typing reaches React: through the
 * native setter, so React's own value tracker sees the change and does not
 * swallow the event.
 */
function setNativeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
}

/** The accordion headers on the page, in order. */
function sectionHeaders(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.insp-accordion-header')) as HTMLElement[]
}

/** Open the section at `index`, closing whichever was open. */
function openSection(container: HTMLElement, index: number): string {
  const headers = sectionHeaders(container)
  const header = headers[index]
  const title = header.querySelector('.insp-accordion-title')?.textContent ?? '?'
  const section = header.closest('.insp-accordion')!
  if (!section.classList.contains('expanded')) act(() => header.click())
  return title
}

/** The kind of control a row renders, named by what the DOM shows. */
function controlKind(row: Element): string {
  // A gated row carries both halves of one property, so name it as such --
  // reading it as a plain drag field would hide the checkbox from the snapshot.
  if (row.querySelector('.h3-form-gated-control')) return 'gated-drag-numeric'
  if (row.querySelector('.h3-form-drag-arrow-right')) return 'drag-numeric'
  if (row.querySelector('select')) return 'select'
  if (row.querySelector('.h3-form-switch input')) return 'switch'
  if (row.querySelector('input[type="checkbox"]')) return 'checkbox'
  if (row.querySelector('.h3-color-swatch, .h3-cue-color-field')) return 'color'
  if (row.querySelector('input.h3-form-numeric, input[type="number"]')) return 'numeric'
  if (row.querySelector('input[type="text"], input:not([type])')) return 'text'
  if (row.querySelector('button')) return 'button'
  return 'none'
}

/** What each row in the open section displays, in layout order. */
function rowManifest(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('.insp-accordion.expanded .h3-form-prop-row')).map(
    (row) => {
      const label = row.querySelector('.h3-form-field-label')?.textContent ?? '?'
      const kind = controlKind(row)
      const flags: string[] = []
      if (row.classList.contains('is-modified')) flags.push('modified')
      if (row.querySelector('.h3-form-prop-reset')) flags.push('resettable')
      // Each control marks itself differently: a drag field takes a class,
      // the rest take the attribute. Gating is the main thing these snapshots
      // watch, so it has to be read off whichever the row renders.
      const disabled =
        row.querySelector('.h3-form-drag-disabled') !== null ||
        row.querySelector('select[disabled], input[disabled]') !== null
      if (disabled) flags.push('disabled')
      const sel = row.querySelector('select')
      const options = sel
        ? ` options=[${Array.from(sel.options).map((o) => o.value).join('|')}] selected=${sel.value}`
        : ''
      // On a gated row the first input is the gate, whose "value" is the
      // HTML default for a checkbox and says nothing. Record whether it is
      // ticked instead, since that is the half the row adds.
      const gate = row.querySelector(
        '.h3-form-gated-control input[type="checkbox"]',
      ) as HTMLInputElement | null
      const gated = gate ? ` gate=${gate.checked ? 'on' : 'off'}` : ''
      const input = gate ? null : row.querySelector('input')
      const shown = !sel && input ? ` value=${JSON.stringify(input.value)}` : ''
      return `${label} [${kind}]${flags.length ? ` {${flags.join(',')}}` : ''}${options}${gated}${shown}`
    },
  )
}

/**
 * Drive one control per row of the open section and record what it writes.
 *
 * Each kind is nudged the way a user would: a select moves to its next
 * option, a switch is clicked, a drag-numeric takes one step. What matters is
 * not the value but that the same gesture reaches the same worker call.
 */
function interactionLog(container: HTMLElement): string[] {
  const out: string[] = []
  const rows = Array.from(container.querySelectorAll('.insp-accordion.expanded .h3-form-prop-row'))
  for (const row of rows) {
    const label = row.querySelector('.h3-form-field-label')?.textContent ?? '?'
    const before = { set: calls.set.length, many: calls.setMany.length }
    const sel = row.querySelector('select') as HTMLSelectElement | null
    const step = row.querySelector('.h3-form-drag-arrow-right') as HTMLElement | null
    const sw = row.querySelector('.h3-form-switch input, input[type="checkbox"]') as HTMLInputElement | null
    const num = row.querySelector('input.h3-form-numeric, input[type="number"]') as HTMLInputElement | null
    const txt = row.querySelector('input[type="text"], input:not([type])') as HTMLInputElement | null
    const gate = row.querySelector(
      '.h3-form-gated-control input[type="checkbox"]',
    ) as HTMLInputElement | null
    if (gate && step) {
      // Both halves write the same property; drive each so the snapshot shows
      // the on/off write as well as the value write.
      act(() => gate.click())
      pressStepArrow(step)
    } else if (sel && sel.options.length > 1) {
      const next = Array.from(sel.options).find((o) => o.value !== sel.value)
      if (next) {
        act(() => {
          sel.value = next.value
          sel.dispatchEvent(new Event('change', { bubbles: true }))
        })
      }
    } else if (step) {
      pressStepArrow(step)
    } else if (sw) {
      act(() => sw.click())
    } else if (num) {
      // A stepper input commits on Enter, so type a different value and press it.
      const next = String(Number(num.value || '0') + 1)
      act(() => {
        setNativeValue(num, next)
        num.dispatchEvent(new Event('input', { bubbles: true }))
      })
      act(() => {
        num.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
    } else if (txt) {
      // A text row commits its draft on Enter.
      act(() => {
        setNativeValue(txt, `${txt.value}x`)
        txt.dispatchEvent(new Event('input', { bubbles: true }))
      })
      act(() => {
        txt.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      })
    } else {
      // A colour swatch opens a picker and the selection / material pickers
      // list names from the worker, which is not connected here. The manifest
      // still records what they render.
      out.push(`${label} -> (not driven)`)
      continue
    }
    const wrote = [
      ...calls.set.slice(before.set).map(
        (c) => `set ${c.key}=${JSON.stringify(c.value)}${c.mode ? ` (${c.mode})` : ''}`,
      ),
      ...calls.setMany.slice(before.many).map((w) => `setMany ${JSON.stringify(w)}`),
    ]
    out.push(`${label} -> ${wrote.length ? wrote.join(' + ') : '(nothing)'}`)
  }
  return out
}

describe('renderer Properties page', () => {
  for (const fixture of RENDERER_PROP_FIXTURES) {
    it(`${fixture.rendererType} / ${fixture.name}`, () => {
      const { container, unmount } = mountTree(
        <PropertiesTab
          entries={fixture.entries}
          rendererType={fixture.rendererType}
          onSet={(key, type, value, opts) => {
            calls.set.push({ key, type, value, mode: opts?.mode })
          }}
          onSetMany={(writes) => calls.setMany.push(writes)}
          onReset={(key) => calls.reset.push(key)}
          sceneId={1}
          nodeId={100}
        />,
      )
      const page: Record<string, { rows: string[]; writes: string[] }> = {}
      for (let i = 0; i < sectionHeaders(container).length; i++) {
        const title = openSection(container, i)
        page[title] = { rows: rowManifest(container), writes: interactionLog(container) }
      }
      expect(page).toMatchSnapshot()
      unmount()
    })
  }
})
