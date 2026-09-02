/**
 * Degrade-detection tests for the form-kit catalog
 * (`h3-kit/form/`).
 *
 * The catalog is the single source of control/row SIZING. These tests pin the
 * contract that future changes must not break:
 *  - each component emits its canonical `.h3-form-*` class (so the one CSS source in
 *    `_form-kit.css` actually applies)
 *  - components do NOT leak inline sizing (height/min-height/padding/margin) --
 *    sizing must come from CSS, never from per-instance style props
 *  - the controls remain controlled (onChange/onCommit fire)
 *
 * If someone reintroduces a bespoke size (inline style or a non-fk class),
 * these tests fail.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

import {
    Field,
    FieldGroup,
    FieldSection,
    TextField,
    SelectField,
    SwitchField,
    CheckboxField,
    NumericField,
    ButtonRow,
    FormButton,
    TimeField,
} from '@renderer/h3-kit/form'
import { mountTree } from '@renderer/__test__/helpers/testHarness'

/** Assert no element in the subtree carries inline sizing styles. */
function expectNoInlineSizing(root: HTMLElement): void {
    const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
    for (const el of all) {
        const s = el.getAttribute('style') ?? ''
        expect(s).not.toMatch(/height|min-height|padding|margin|gap/i)
    }
}

describe('form-kit catalog', () => {
    it('Field emits canonical row/label/control classes', () => {
        const { container, unmount } = mountTree(
            <Field label="Name">
                <span>ctrl</span>
            </Field>,
        )
        expect(container.querySelector('.h3-form-field-row')).not.toBeNull()
        expect(container.querySelector('.h3-form-field-label')?.textContent).toBe('Name')
        expect(container.querySelector('.h3-form-field-control')?.textContent).toBe('ctrl')
        expect(container.querySelector('.h3-form-field-row.h3-form-inline')).toBeNull()
        expectNoInlineSizing(container)
        unmount()
    })

    it('Field inline adds the h3-form-inline modifier', () => {
        const { container, unmount } = mountTree(
            <Field label="On" inline>
                <span>ctrl</span>
            </Field>,
        )
        expect(container.querySelector('.h3-form-field-row.h3-form-inline')).not.toBeNull()
        unmount()
    })

    // `controlFirst` is a layout variant, so both halves of its contract have
    // to hold: the modifier class (the CSS hangs the packing off it) and the
    // control preceding the label in the DOM.
    it('Field inline controlFirst puts the control before the label', () => {
        const { container, unmount } = mountTree(
            <Field label="Use selection" inline controlFirst>
                <span>ctrl</span>
            </Field>,
        )
        const row = container.querySelector(
            '.h3-form-field-row.h3-form-inline.h3-form-control-first',
        ) as HTMLElement
        expect(row).not.toBeNull()
        expect(Array.from(row.children).map((c) => c.className)).toEqual([
            'h3-form-field-control',
            'h3-form-field-label',
        ])
        unmount()
    })

    it('Field controlFirst is ignored without inline (stack rows keep label first)', () => {
        const { container, unmount } = mountTree(
            <Field label="Use selection" controlFirst>
                <span>ctrl</span>
            </Field>,
        )
        expect(container.querySelector('.h3-form-control-first')).toBeNull()
        const row = container.querySelector('.h3-form-field-row') as HTMLElement
        expect(row.children[0].className).toBe('h3-form-field-label')
        unmount()
    })

    it('FieldGroup emits the group class and renders an optional section header', () => {
        const { container, unmount } = mountTree(
            <FieldGroup title="Section">
                <Field label="A"><span>a</span></Field>
            </FieldGroup>,
        )
        expect(container.querySelector('.h3-form-field-group')).not.toBeNull()
        expect(container.querySelector('.section-header')?.textContent).toBe('Section')
        unmount()
    })

    it('FieldSection emits the section class + a group-label-role title', () => {
        const { container, unmount } = mountTree(
            <FieldSection title="Term">
                <span>body</span>
            </FieldSection>,
        )
        expect(container.querySelector('.h3-form-field-section')).not.toBeNull()
        const title = container.querySelector('.h3-form-field-section-title') as HTMLElement
        expect(title?.textContent).toBe('Term')
        // The title carries the group-label typography role (single source for
        // the top-level label look) -- not a bespoke per-pane style.
        expect(title.classList.contains('type-group-label')).toBe(true)
        expectNoInlineSizing(container)
        unmount()
    })

    it('FieldSection without a title renders no head', () => {
        const { container, unmount } = mountTree(
            <FieldSection>
                <span>body</span>
            </FieldSection>,
        )
        expect(container.querySelector('.h3-form-field-section')).not.toBeNull()
        expect(container.querySelector('.h3-form-field-section-title')).toBeNull()
        unmount()
    })

    it('TextField emits .h3-form-input, fires onChange, flags invalid, no inline sizing', () => {
        const onChange = vi.fn()
        const { container, unmount } = mountTree(
            <TextField value="abc" onChange={onChange} invalid />,
        )
        const input = container.querySelector('.h3-form-input input') as HTMLInputElement
        expect(input).not.toBeNull()
        expect(input.value).toBe('abc')
        // invalid -> danger intent on the wrapper
        expect(container.querySelector('.h3-form-input.bp5-intent-danger')).not.toBeNull()
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        act(() => {
            setter.call(input, 'xyz')
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        expect(onChange).toHaveBeenCalledWith('xyz')
        expectNoInlineSizing(container)
        unmount()
    })

    it('SelectField emits .h3-form-select and fires onChange', () => {
        const onChange = vi.fn()
        const { container, unmount } = mountTree(
            <SelectField value="a" onChange={onChange}>
                <option value="a">A</option>
                <option value="b">B</option>
            </SelectField>,
        )
        const select = container.querySelector('.h3-form-select select') as HTMLSelectElement
        expect(select).not.toBeNull()
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
        act(() => {
            setter.call(select, 'b')
            select.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(onChange).toHaveBeenCalledWith('b')
        expectNoInlineSizing(container)
        unmount()
    })

    it('SwitchField emits .h3-form-switch and fires onChange(boolean)', () => {
        const onChange = vi.fn()
        const { container, unmount } = mountTree(
            <SwitchField checked={false} onChange={onChange} />,
        )
        const input = container.querySelector('.h3-form-switch input') as HTMLInputElement
        expect(input).not.toBeNull()
        act(() => { input.click() })
        expect(onChange).toHaveBeenCalledWith(true)
        unmount()
    })

    it('CheckboxField emits .h3-form-checkbox and fires onChange(boolean)', () => {
        const onChange = vi.fn()
        const { container, unmount } = mountTree(
            <CheckboxField checked={false} onChange={onChange} />,
        )
        const input = container.querySelector('.h3-form-checkbox input') as HTMLInputElement
        expect(input).not.toBeNull()
        act(() => { input.click() })
        expect(onChange).toHaveBeenCalledWith(true)
        unmount()
    })

    it('NumericField emits .h3-form-numeric (+ slider by default)', () => {
        const { container, unmount } = mountTree(
            <NumericField value={5} onChange={() => undefined} min={0} max={10} />,
        )
        expect(container.querySelector('.h3-form-numeric-row')).not.toBeNull()
        expect(container.querySelector('.h3-form-numeric')).not.toBeNull()
        expect(container.querySelector('.h3-form-slider')).not.toBeNull()
        unmount()
    })

    it('NumericField omits the slider when slider=false', () => {
        const { container, unmount } = mountTree(
            <NumericField value={5} onChange={() => undefined} slider={false} />,
        )
        expect(container.querySelector('.h3-form-slider')).toBeNull()
        expect(container.querySelector('.h3-form-numeric')).not.toBeNull()
        unmount()
    })

    it('FormButton locks the canonical .h3-form-btn class; ButtonRow wraps in .h3-form-btn-row', () => {
        const onClick = vi.fn()
        const { container, unmount } = mountTree(
            <ButtonRow>
                <FormButton text="Go" onClick={onClick} />
            </ButtonRow>,
        )
        expect(container.querySelector('.h3-form-btn-row')).not.toBeNull()
        const btn = container.querySelector('button.h3-form-btn') as HTMLButtonElement
        expect(btn).not.toBeNull()
        act(() => { btn.click() })
        expect(onClick).toHaveBeenCalled()
        expectNoInlineSizing(container)
        unmount()
    })

    it('TimeField emits .h3-form-time with one span per segment, no inline sizing', () => {
        const { container, unmount } = mountTree(<TimeField value={90500} onChange={() => {}} />)
        expect(container.querySelector('.h3-form-time')).not.toBeNull()
        expect(container.querySelectorAll('.h3-form-time-seg')).toHaveLength(3)
        expect(container.querySelectorAll('.h3-form-time-spin')).toHaveLength(2)
        expectNoInlineSizing(container)
        unmount()
    })
})
