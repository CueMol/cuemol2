/**
 * @file __test__/ComboBoxField.test.tsx
 * @description Contract tests for the h3-kit editable combobox.
 *
 * Pins the behaviour that makes it the canonical "chevron-equipped textbox":
 *   - it is a plain editable input with NO native <datalist> / `list` attr
 *     (the native combobox popup is non-themeable and auto-opens -- the very
 *     bugs this component exists to avoid);
 *   - the dropdown is closed by default and opens only from the chevron;
 *   - the chevron is disabled when there are no options;
 *   - picking an option reports it via onChange.
 */

import React, { act } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { mountTree } from './helpers/testHarness'

vi.mock('../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }))

import { ComboBoxField } from '../h3-kit/form/ComboBoxField'

void React

describe('ComboBoxField', () => {
  it('is a plain text input with no native datalist / list attribute', () => {
    const t = mountTree(
      React.createElement(ComboBoxField, {
        value: '',
        onChange: () => {},
        options: ['1abc'],
        id: 'cb',
      }),
    )
    expect(document.querySelector('datalist')).toBeNull()
    const input = t.container.querySelector('#cb') as HTMLInputElement | null
    expect(input).not.toBeNull()
    expect(input!.getAttribute('list')).toBeNull()
    t.unmount()
  })

  it('disables the chevron trigger when there are no options', () => {
    const t = mountTree(
      React.createElement(ComboBoxField, {
        value: '',
        onChange: () => {},
        options: [],
        triggerLabel: 'hist',
      }),
    )
    const chevron = t.container.querySelector('[aria-label="hist"]') as HTMLButtonElement | null
    expect(chevron).not.toBeNull()
    expect(chevron!.disabled).toBe(true)
    t.unmount()
  })

  it('opens only on chevron click and reports the picked option', () => {
    const onChange = vi.fn()
    const t = mountTree(
      React.createElement(ComboBoxField, {
        value: '',
        onChange,
        options: ['1abc', '2xyz'],
        triggerLabel: 'hist',
      }),
    )
    // Closed by default -- no auto-open (the native datalist used to auto-open).
    expect(document.querySelector('.bp5-menu')).toBeNull()

    const chevron = t.container.querySelector('[aria-label="hist"]') as HTMLButtonElement
    act(() => {
      chevron.click()
    })
    expect(document.querySelector('.bp5-menu')).not.toBeNull()

    const item = Array.from(document.querySelectorAll('.bp5-menu-item')).find(
      (el) => el.textContent === '1abc',
    ) as HTMLElement
    expect(item).not.toBeNull()
    act(() => {
      item.click()
    })
    expect(onChange).toHaveBeenCalledWith('1abc')
    t.unmount()
  })
})
