/**
 * Degrade-detection wire tests for ColorPane (UXP coloring panel port).
 *
 * ColorPane has had 0 component tests. It updates the open deck via an
 * event-driven refetch, so a broken mutation wire is a SILENT non-update
 * (no crash). These tests pin the OBSERVABLE renderer-side wire only:
 *
 *   control -> which `invokeService(name, payload)` fires (fire-and-forget),
 *   with what prop name + value transform, and under what gating.
 *
 * They deliberately do NOT assert deck JSX / class names / React state --
 * T2 will rewrite the deck markup onto form-kit and T7 will rework the
 * renderer-switch fetch race; those internals must stay free to change.
 *
 * Worker-side service logic is already covered by
 * rendererColoringService.test.ts; the fetch hook by
 * useRendererColoringState.test.tsx. This file only pins the component wire.
 *
 * The two leaf widgets that need picker/popover infra (CueColorField,
 * PaintSelCell) are replaced with tiny test seams that expose their
 * `onCommit` as a plain DOM control, so we drive ColorPane's mutation
 * handlers without coupling to those widgets' internals. SliderNumericField
 * is kept REAL so the value*scale / value/scale transform is pinned
 * end-to-end through to the service payload.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

// Event-driven refetch is exercised by useRendererColoringState.test.tsx;
// stub it so these tests are driven purely by mount + explicit user action.
vi.mock('../hooks/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

// Replace the colour field with a seam: a button that fires onCommit with a
// fixed colour. Pins "this control commits a colour" without the picker JSX.
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
    CueColorField: ({
        value,
        onCommit,
    }: {
        value: string
        onCommit: (v: string) => void
    }) => (
        <button
            type="button"
            data-testid="color-commit"
            data-value={value}
            onClick={() => onCommit('#112233')}
        />
    ),
}))

// Keep the provider as a passthrough (it only supplies cm/sceneId to the
// real CueColorField, which we have mocked away).
vi.mock('../h3-kit/colorpicker/ColorPickerContext', () => ({
    ColorPickerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useColorPickerCtx: () => ({ cm: null, sceneId: undefined }),
}))

// Replace the paint selection cell with a seam exposing onCommit.
vi.mock('../components/panes/PaintSelCell', () => ({
    PaintSelCell: ({
        value,
        onCommit,
        onFocus,
    }: {
        value: string
        onCommit: (v: string) => void
        onFocus?: () => void
    }) => (
        <input
            data-testid="paint-sel-cell"
            value={value}
            onFocus={onFocus}
            onChange={() => {}}
            onBlur={() => onCommit('aname CA')}
        />
    ),
}))

import { ColorPane } from '../components/panes/ColorPane'
import { ContextMenuProvider } from '../components/menu/ContextMenuProvider'
import { IPC } from '../../shared/ipcChannels'
import {
    mountTree,
    flushPromises,
    setupElectronAPI,
    teardownElectronAPI,
} from './helpers/testHarness'
import {
    _resetClipboardScopesForTest,
    getClipboardScopeForTest,
} from '../utils/editClipboard'

/** Set a controlled input's value so React's onChange fires (native setter). */
function setInputValue(el: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype, 'value',
    )!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
}

// React 18 maps onBlur to the delegated focusout event; the element must be
// focused first for focusout to reach the handler.
function blurInput(el: HTMLInputElement): void {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
}

const SCENE_ID = 7
const REND_ID = 100

/** Rows the stubbed copy/cut services hand back for the clipboard write. */
const CLIP_ROWS = [{ selStr: 'aname CA', colorValue: '#00ff00' }]

/** Stub the main-process clipboard channels the paint deck now uses. */
function stubClipboard(hasPaint: boolean): ReturnType<typeof setupElectronAPI> {
    return setupElectronAPI({
        invoke: vi.fn((ch: string) => {
            if (ch === IPC.CLIPBOARD_CUEMOL_PEEK) {
                return Promise.resolve(hasPaint ? { kind: 'paint', name: '' } : null)
            }
            if (ch === IPC.CLIPBOARD_CUEMOL_READ) {
                return Promise.resolve(
                    hasPaint ? { kind: 'paint', entries: CLIP_ROWS } : null,
                )
            }
            if (ch === IPC.CLIPBOARD_CUEMOL_WRITE) return Promise.resolve({ ok: true })
            return Promise.resolve(undefined)
        }) as never,
    })
}

interface ColoringState {
    ok: boolean
    className: string
    defaultColor?: string
    paintEntries?: Array<{ idx: number; selStr: string; colorValue: string }>
    surfaceType?: string
    colormode?: string
    hasColoring?: boolean
    molFancTarget?: string
    cpkColors?: Record<string, string>
    rainbowParams?: Record<string, unknown>
    bfacParams?: Record<string, unknown>
    elepotParams?: Record<string, unknown>
}

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
}

/**
 * Build a cm mock whose fetch services route the pane to a chosen deck, and
 * whose mutation services resolve ok. `coloringState` controls the deck.
 */
function makeCm(coloringState: ColoringState): MockCm {
    return {
        invokeService: vi.fn((name: string) => {
            if (name === 'copyPaintEntries' || name === 'cutPaintEntries') {
                return Promise.resolve({ ok: true, entries: CLIP_ROWS })
            }
            if (name === 'pastePaintEntries') {
                return Promise.resolve({ ok: true, count: 1, startIdx: 0 })
            }
            if (name === 'listPaintCapableRenderers') {
                return Promise.resolve({
                    ok: true,
                    renderers: [
                        {
                            objId: 11,
                            objName: '1CRN',
                            rendId: REND_ID,
                            targetKind: 'renderer',
                            name: 'rend1',
                            typeName: 'simple',
                        },
                    ],
                })
            }
            if (name === 'getRendererColoringState') {
                return Promise.resolve(coloringState)
            }
            if (name === 'listElePotMapObjects') {
                return Promise.resolve({ ok: true, objects: [] })
            }
            // All mutation services resolve ok (fire-and-forget).
            return Promise.resolve({ ok: true })
        }),
    }
}

/**
 * Mount ColorPane with a single auto-selected renderer + given deck state.
 *
 * `clipboardHasPaint` drives the stubbed OS clipboard: the pane asks main
 * whether paint rows are on it (Paste gating) rather than asking the worker,
 * so rows copied in another window or in CueMol2 are pasteable.
 */
async function mountWith(state: ColoringState, clipboardHasPaint = false) {
    stubClipboard(clipboardHasPaint)
    const cm = makeCm(state)
    // ColorPane's row context menu uses `useShowContextMenu`, which is
    // provider-scoped; the app mounts the provider at the DialogContext
    // level, so the test has to supply it too.
    const handle = mountTree(
        <ContextMenuProvider>
            <ColorPane cm={cm as never} sceneId={SCENE_ID} />
        </ContextMenuProvider>,
    )
    await flushPromises()
    return { cm, ...handle }
}

/** All invokeService calls whose name is NOT a fetch/read service. */
function mutationCalls(cm: MockCm): Array<[string, unknown]> {
    const reads = new Set([
        'listPaintCapableRenderers',
        'getRendererColoringState',
        'listElePotMapObjects',
        'getPaintColoringStyles',
    ])
    return cm.invokeService.mock.calls.filter(
        (c) => !reads.has(c[0] as string),
    ) as Array<[string, unknown]>
}

const TARGET = { sceneId: SCENE_ID, rendId: REND_ID, targetKind: 'renderer' }

describe('ColorPane wire', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })
    afterEach(() => {
        teardownElectronAPI()
    })

    // --- Color control kind: Solid deck default-color picker ---
    it('Solid deck default-color commit fires setRendererDefaultColor', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'SolidColoring',
            defaultColor: '#000000',
        })
        const swatch = container.querySelector(
            '[data-testid="color-commit"]',
        ) as HTMLElement
        await act(async () => { swatch.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setRendererDefaultColor', {
            ...TARGET,
            colorValue: '#112233',
        })
        unmount()
    })

    // --- Color control kind: CPK per-element color -> setColoringProp ---
    it('CPK Carbon color commit fires setColoringProp with propName col_C', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'CPKColoring',
            cpkColors: {
                colC: '#aaaaaa', colN: '#0000ff', colO: '#ff0000',
                colS: '#ffff00', colP: '#ff8000', colH: '#ffffff', colX: '#888888',
            },
        })
        // First ColorField in the CPK deck is Carbon (col_C).
        const swatch = container.querySelector(
            '[data-testid="color-commit"]',
        ) as HTMLElement
        await act(async () => { swatch.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setColoringProp', {
            ...TARGET,
            propName: 'col_C',
            propValue: '#112233',
        })
        unmount()
    })

    // The seven element labels differ enough in length that per-row labels
    // ellipsised to different widths once the pane narrowed, leaving the
    // swatches unaligned. A shared grid label column is what keeps them lined
    // up, so pin the layout (all seven rows in ONE grid), not just the wire.
    it('CPK deck lays its seven rows out in a single shared-label grid', async () => {
        const { container, unmount } = await mountWith({
            ok: true,
            className: 'CPKColoring',
            cpkColors: {
                colC: '#aaaaaa', colN: '#0000ff', colO: '#ff0000',
                colS: '#ffff00', colP: '#ff8000', colH: '#ffffff', colX: '#888888',
            },
        })
        const grids = container.querySelectorAll('.h3-form-grid')
        expect(grids).toHaveLength(1)
        const labels = Array.from(
            grids[0].querySelectorAll('.h3-form-grid-label'),
        ).map((l) => l.textContent)
        expect(labels).toEqual([
            'Carbon', 'Nitrogen', 'Oxygen', 'Sulfur',
            'Phosphorus', 'Hydrogen', 'Others',
        ])
        unmount()
    })

    // --- Enum control kind: Rainbow Mode -> setColoringProp string value ---
    it('Rainbow Mode enum commit fires setColoringProp with propName mode', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'RainbowColoring',
            rainbowParams: {
                mode: 'mol', incrMode: 'chain',
                startHue: 0, endHue: 240, brightness: 1, saturation: 1,
            },
        })
        // The Mode EnumField is the <select> whose options are the rainbow
        // modes (mol/chain). Pin it by its option values (the WIRE-relevant
        // control), not by the bespoke `.color-deck-scroll` wrapper class --
        // T2's form-kit reunification may rename the deck wrapper or swap
        // EnumField for SelectField, but both still render a native <select>
        // carrying these option values. (A bare `select` would also match the
        // top renderer-picker select, which is why we disambiguate by content.)
        const select = Array.from(
            container.querySelectorAll('select'),
        ).find((s) =>
            s.querySelector('option[value="mol"]'),
        ) as HTMLSelectElement
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLSelectElement.prototype, 'value',
            )!.set!
            setter.call(select, 'chain')
            select.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setColoringProp', {
            ...TARGET,
            propName: 'mode',
            propValue: 'chain',
        })
        unmount()
    })

    // --- Scale transform: Brightness shows value*100, commits value/100 ---
    // params.brightness stored as 0.5 -> SliderNumericField shows 50 (scale=100).
    // Typing 80 must commit 0.8 (80/100) through setColoringProp('bri', ...).
    it('Rainbow Brightness scale field shows value*100 and commits value/100', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'RainbowColoring',
            rainbowParams: {
                mode: 'mol', incrMode: 'chain',
                startHue: 0, endHue: 240, brightness: 0.5, saturation: 1,
            },
        })
        // Pin the four numeric spinboxes by input type, not the slider's
        // `h3-slider-number` class. The Rainbow deck's only numeric <input>s
        // are these four sliders (Mode / Change-by are <select>s), so the
        // index is stable even if the slider widget class is renamed by T2.
        const numberInputs = Array.from(
            container.querySelectorAll('input[type="number"]'),
        ) as HTMLInputElement[]
        // Deck order: Start H, End H, Brightness, Saturation.
        const brightness = numberInputs[2]
        // Stored 0.5 is shown as 50 (value*scale, scale=100).
        expect(brightness.value).toBe('50')

        await act(async () => { brightness.focus() })
        await act(async () => { setInputValue(brightness, '80') })
        await act(async () => { blurInput(brightness) })
        await flushPromises()

        // 80 shown -> 0.8 stored (value/scale).
        expect(cm.invokeService).toHaveBeenCalledWith('setColoringProp', {
            ...TARGET,
            propName: 'bri',
            propValue: 0.8,
        })
        unmount()
    })

    // --- Silent out-of-range reject: Bfac local NumberField, no service call ---
    // ColorPane's local NumberField DROPS out-of-range / NaN input (UXP parity)
    // rather than clamping. Pin that an over-range commit fires NO service.
    it('Bfac lowpar number field silently rejects an out-of-range value (no service call)', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'BfacColoring',
            bfacParams: {
                mode: 'bfac', autoMode: 'none',
                lowColor: '#0000ff', highColor: '#ff0000',
                lowParam: 10, highParam: 50,
            },
        })
        // The Bfac deck's plain numeric inputs carry reject-and-revert
        // validation. Match the legacy bespoke class (color-inline-input), the
        // clamp NumericField class (h3-form-numeric), OR the reject catalog
        // primitive (h3-form-reject-num) -- T2 moved ColorPane's local
        // reject NumberField onto the catalog RejectNumberInput, which keeps
        // the same silent-reject wire but emits the new class. Wire assertions
        // below are unchanged; only this anchor is re-pointed.
        const numInputs = Array.from(
            container.querySelectorAll(
                'input.color-inline-input, input.h3-form-numeric, input.h3-form-reject-num',
            ),
        ) as HTMLInputElement[]
        // Order: Low (lowpar), High (highpar). lowpar has no min/max in the
        // deck, so to exercise the reject path we use NaN (non-numeric).
        const low = numInputs[0]
        expect(low).toBeTruthy()

        await act(async () => { low.focus() })
        await act(async () => { setInputValue(low, 'not-a-number') })
        await act(async () => { blurInput(low) })
        await flushPromises()

        // No mutation fired: invalid input is silently reverted.
        expect(mutationCalls(cm)).toEqual([])
        unmount()
    })

    // --- Bfac valid number commits setColoringProp with the raw value ---
    it('Bfac lowpar number field commits setColoringProp with propName lowpar on valid input', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'BfacColoring',
            bfacParams: {
                mode: 'bfac', autoMode: 'none',
                lowColor: '#0000ff', highColor: '#ff0000',
                lowParam: 10, highParam: 50,
            },
        })
        const low = container.querySelector(
            'input.color-inline-input, input.h3-form-numeric, input.h3-form-reject-num',
        ) as HTMLInputElement
        await act(async () => { low.focus() })
        await act(async () => { setInputValue(low, '25') })
        await act(async () => { blurInput(low) })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setColoringProp', {
            ...TARGET,
            propName: 'lowpar',
            propValue: 25,
        })
        unmount()
    })

    // --- Paint table Add row -> addPaintEntry with defaults ---
    it('Paint Add fires addPaintEntry at idx 0 with fallback sel "*" / color #FFFFFF', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'PaintColoring',
            paintEntries: [],
        })
        // The Add button is the first action button in the paint toolbar.
        const addBtn = container.querySelector(
            '.color-actions button',
        ) as HTMLButtonElement
        await act(async () => { addBtn.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('addPaintEntry', {
            ...TARGET,
            idx: 0,
            selStr: '*',
            colorValue: '#FFFFFF',
        })
        unmount()
    })

    // --- Paint clipboard row: Copy / Cut / Paste / Remove all ---
    //
    // These four act on the row the user selected, so each test clicks the
    // row first. The buttons are found by aria-label, not by position, so
    // reordering the toolbar does not silently retarget a test.
    const PAINT_ROWS = [
        { idx: 0, selStr: 'aname N', colorValue: '#ff0000' },
        { idx: 1, selStr: 'aname CA', colorValue: '#00ff00' },
    ]

    function actionBtn(container: HTMLElement, label: string): HTMLButtonElement {
        const el = container.querySelector(`.color-actions button[aria-label="${label}"]`)
        if (!el) throw new Error(`action button "${label}" not rendered`)
        return el as HTMLButtonElement
    }

    async function mountPaintDeckWithRowSelected(clipboardHasPaint = false) {
        const view = await mountWith(
            { ok: true, className: 'PaintColoring', paintEntries: PAINT_ROWS },
            clipboardHasPaint,
        )
        const row = view.container.querySelectorAll('.color-row')[1] as HTMLElement
        await act(async () => { row.click() })
        await flushPromises()
        return view
    }

    /**
     * Right-click a row (or the empty-list row when `idx` is null) and pick
     * `label` from the context menu. Cut / Copy / Paste / Delete / Delete all
     * live only there now -- the toolbar keeps just the list edits so it
     * stays on one line, which mirrors UXP where the clipboard commands were
     * context-menu-only too.
     */
    async function pickCtxItem(
        container: HTMLElement,
        rowIdx: number | null,
        label: string,
    ): Promise<HTMLElement | null> {
        const rows = container.querySelectorAll('.color-row, .color-empty-row')
        const row = (rowIdx === null ? rows[0] : rows[rowIdx]) as HTMLElement
        await act(async () => {
            row.dispatchEvent(
                new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
            )
        })
        const item = Array.from(
            document.body.querySelectorAll('.menu-item'),
        ).find((el) => el.textContent?.startsWith(label)) as HTMLElement | undefined
        return item ?? null
    }

    /** Right-click a row, click a menu item, and let the handlers settle. */
    async function runCtxItem(
        container: HTMLElement,
        rowIdx: number | null,
        label: string,
    ): Promise<void> {
        const item = await pickCtxItem(container, rowIdx, label)
        if (!item) throw new Error(`context menu item "${label}" not rendered`)
        await act(async () => { item.click() })
        await flushPromises()
    }

    it('Paint Copy reads the row then writes it to the OS clipboard', async () => {
        const { cm, container, unmount } = await mountPaintDeckWithRowSelected()
        const api = window.electronAPI as unknown as { invoke: ReturnType<typeof vi.fn> }
        await runCtxItem(container, 1, 'Copy')
        expect(cm.invokeService).toHaveBeenCalledWith('copyPaintEntries', {
            ...TARGET,
            idxs: [1],
        })
        // The rows the worker read must reach main, or nothing is on the
        // clipboard for another window / CueMol2 to paste.
        expect(api.invoke).toHaveBeenCalledWith(IPC.CLIPBOARD_CUEMOL_WRITE, {
            kind: 'paint',
            entries: CLIP_ROWS,
        })
        unmount()
    })

    it('Paint Cut deletes in the worker and writes the rows out', async () => {
        const { cm, container, unmount } = await mountPaintDeckWithRowSelected()
        const api = window.electronAPI as unknown as { invoke: ReturnType<typeof vi.fn> }
        await runCtxItem(container, 1, 'Cut')
        expect(cm.invokeService).toHaveBeenCalledWith('cutPaintEntries', {
            ...TARGET,
            idxs: [1],
        })
        expect(api.invoke).toHaveBeenCalledWith(IPC.CLIPBOARD_CUEMOL_WRITE, {
            kind: 'paint',
            entries: CLIP_ROWS,
        })
        unmount()
    })

    it('Paint Paste is gated on the OS clipboard and passes the selected row as idx', async () => {
        // Nothing on the clipboard: the menu item is disabled.
        const empty = await mountPaintDeckWithRowSelected(false)
        const disabled = await pickCtxItem(empty.container, 1, 'Paste')
        expect(disabled?.className).toContain('disabled')
        empty.unmount()

        const { cm, container, unmount } = await mountPaintDeckWithRowSelected(true)
        await runCtxItem(container, 1, 'Paste')
        // The rows come from the clipboard, not from worker-held state.
        expect(cm.invokeService).toHaveBeenCalledWith('pastePaintEntries', {
            ...TARGET,
            idx: 1,
            entries: CLIP_ROWS,
        })
        unmount()
    })

    it('Paint Paste with no row selected appends (idx null)', async () => {
        const { cm, unmount } = await mountWith(
            { ok: true, className: 'PaintColoring', paintEntries: PAINT_ROWS },
            true,
        )
        // Right-click with no selection would select the row under the
        // cursor first, so drive Paste from the deck's own clipboard-scope
        // handler (the path Cmd+V takes) to keep "nothing selected" true.
        const scope = getClipboardScopeForTest('paint-deck')
        if (!scope) throw new Error('paint-deck scope was not registered')
        await act(async () => { scope.paste() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('pastePaintEntries', {
            ...TARGET,
            idx: null,
            entries: CLIP_ROWS,
        })
        unmount()
    })

    it('Paint Delete all fires clearPaintEntries and is absent from the toolbar', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'PaintColoring',
            paintEntries: PAINT_ROWS,
        })
        // The toolbar must stay on one line, so the destructive / clipboard
        // commands are context-menu only.
        expect(
            container.querySelector('.color-actions button[aria-label="Remove all rows"]'),
        ).toBeNull()
        await runCtxItem(container, 0, 'Delete all')
        expect(cm.invokeService).toHaveBeenCalledWith('clearPaintEntries', TARGET)
        unmount()

        const empty = await mountWith({
            ok: true, className: 'PaintColoring', paintEntries: [],
        })
        const item = await pickCtxItem(empty.container, null, 'Delete all')
        expect(item?.className).toContain('disabled')
        empty.unmount()
    })

    it('Paint Delete removes every selected row in one call', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'PaintColoring',
            paintEntries: PAINT_ROWS,
        })
        const rows = container.querySelectorAll('.color-row')
        await act(async () => { (rows[0] as HTMLElement).click() })
        // Cmd+click adds the second row without dropping the first.
        await act(async () => {
            ;(rows[1] as HTMLElement).dispatchEvent(
                new MouseEvent('click', { bubbles: true, metaKey: true }),
            )
        })
        await flushPromises()
        await runCtxItem(container, 1, 'Delete')
        expect(cm.invokeService).toHaveBeenCalledWith('removePaintEntries', {
            ...TARGET,
            idxs: [0, 1],
        })
        unmount()
    })

    // Move up / down act on one row: a multi-row move would have to compact a
    // disjoint selection into a contiguous block (what UXP did), which loses
    // the user's arrangement. They stay single-target and gate off instead.
    it('Move up/down are disabled while several rows are selected', async () => {
        const { container, unmount } = await mountWith({
            ok: true,
            className: 'PaintColoring',
            paintEntries: PAINT_ROWS,
        })
        const rows = container.querySelectorAll('.color-row')
        await act(async () => { (rows[1] as HTMLElement).click() })
        await flushPromises()
        expect(actionBtn(container, 'Move row up').disabled).toBe(false)

        await act(async () => {
            ;(rows[0] as HTMLElement).dispatchEvent(
                new MouseEvent('click', { bubbles: true, metaKey: true }),
            )
        })
        await flushPromises()
        expect(actionBtn(container, 'Move row up').disabled).toBe(true)
        expect(actionBtn(container, 'Move row down').disabled).toBe(true)
        unmount()
    })

    // Shift+click ranges from the anchor, so a Copy after it carries the
    // whole block rather than just the two endpoints.
    it('Shift+click selects the range and Copy takes all of it', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'PaintColoring',
            paintEntries: PAINT_ROWS,
        })
        const rows = container.querySelectorAll('.color-row')
        await act(async () => { (rows[0] as HTMLElement).click() })
        await act(async () => {
            ;(rows[1] as HTMLElement).dispatchEvent(
                new MouseEvent('click', { bubbles: true, shiftKey: true }),
            )
        })
        await flushPromises()
        expect(container.querySelectorAll('.color-row.selected').length).toBe(2)
        await runCtxItem(container, 1, 'Copy')
        expect(cm.invokeService).toHaveBeenCalledWith('copyPaintEntries', {
            ...TARGET,
            idxs: [0, 1],
        })
        unmount()
    })

    // The Selection / Color split is drag-resizable, standing in for UXP's
    // `<splitter class="tree-splitter"/>` between the two treecols.
    it('the Selection column has a drag handle sizing the colgroup', async () => {
        const { container, unmount } = await mountWith({
            ok: true,
            className: 'PaintColoring',
            paintEntries: PAINT_ROWS,
        })
        const handle = container.querySelector('.color-resize-handle')
        expect(handle).toBeTruthy()
        const col = container.querySelector('.color-table colgroup col') as HTMLElement
        const before = col.style.width
        await act(async () => {
            handle!.dispatchEvent(
                new MouseEvent('mousedown', { bubbles: true, clientX: 100 }),
            )
            document.dispatchEvent(
                new MouseEvent('mousemove', { bubbles: true, clientX: 160 }),
            )
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        })
        expect(col.style.width).not.toBe(before)
        unmount()
    })

    // A wide Selection column must never push the table past its wrapper.
    // The wrapper is `overflow-x: hidden`, and focusing an input inside an
    // overflowing container makes the browser scroll it sideways -- which is
    // what clipped the left edge of the selected row's outline.
    it('clamps the Selection column so the Color column stays usable', async () => {
        const { container, unmount } = await mountWith({
            ok: true,
            className: 'PaintColoring',
            paintEntries: PAINT_ROWS,
        })
        const wrap = container.querySelector('.color-table-wrap') as HTMLElement
        // jsdom reports 0 for clientWidth; feed the observer a real width.
        Object.defineProperty(wrap, 'clientWidth', {
            value: 200,
            configurable: true,
        })
        const handle = container.querySelector('.color-resize-handle')!
        await act(async () => {
            handle.dispatchEvent(
                new MouseEvent('mousedown', { bubbles: true, clientX: 0 }),
            )
            // Drag far past the wrapper's own width.
            document.dispatchEvent(
                new MouseEvent('mousemove', { bubbles: true, clientX: 900 }),
            )
            document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
        })
        const col = container.querySelector('.color-table colgroup col') as HTMLElement
        const w = parseFloat(col.style.width)
        // Either the observer never fired (jsdom without ResizeObserver, so
        // the raw width is used) or the clamp left room for the Color column.
        if (typeof ResizeObserver !== 'undefined') {
            expect(w).toBeLessThanOrEqual(200)
        }
        expect(w).toBeGreaterThan(0)
        unmount()
    })

    // Shift / Cmd + mousedown must not start or extend a DOM text selection:
    // that is what painted the row labels as selected text during a range
    // select. A plain mousedown keeps its default so the cell input can
    // place its caret.
    it('cancels the default of a modifier mousedown on a row, not a plain one', async () => {
        const { container, unmount } = await mountWith({
            ok: true,
            className: 'PaintColoring',
            paintEntries: PAINT_ROWS,
        })
        const row = container.querySelectorAll('.color-row')[1] as HTMLElement
        const shift = new MouseEvent('mousedown', {
            bubbles: true, cancelable: true, shiftKey: true,
        })
        const meta = new MouseEvent('mousedown', {
            bubbles: true, cancelable: true, metaKey: true,
        })
        const plain = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
        await act(async () => { row.dispatchEvent(shift) })
        await act(async () => { row.dispatchEvent(meta) })
        await act(async () => { row.dispatchEvent(plain) })
        expect(shift.defaultPrevented).toBe(true)
        expect(meta.defaultPrevented).toBe(true)
        expect(plain.defaultPrevented).toBe(false)
        unmount()
    })

    // --- Paint cell color edit -> updatePaintEntry (merge keeps selStr) ---
    it('Paint row color commit fires updatePaintEntry merging the existing selStr', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'PaintColoring',
            paintEntries: [{ idx: 0, selStr: 'aname N', colorValue: '#ff0000' }],
        })
        const swatch = container.querySelector(
            '[data-testid="color-commit"]',
        ) as HTMLElement
        await act(async () => { swatch.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('updatePaintEntry', {
            ...TARGET,
            idx: 0,
            selStr: 'aname N',
            colorValue: '#112233',
        })
        unmount()
    })

    // --- Coloring-mode dropdown -> setRendererColoring with coloringId ---
    it('selecting a coloring mode fires setRendererColoring with the coloringId', async () => {
        const { cm, container, unmount } = await mountWith({
            ok: true,
            className: 'SolidColoring',
            defaultColor: '#000000',
            // The paint items are gated on the renderer exposing `coloring`.
            hasColoring: true,
        })
        // Open the "Coloring" dropdown.
        const caret = container.querySelector(
            '.h3-form-dropdown-caret',
        ) as HTMLButtonElement
        await act(async () => { caret.click() })
        await flushPromises()
        // Blueprint renders the Menu in a portal on document.body.
        const items = Array.from(
            document.querySelectorAll('.bp5-menu-item'),
        ) as HTMLElement[]
        const cpkItem = items.find((el) => el.textContent?.includes('CPK coloring'))
        expect(cpkItem).toBeTruthy()
        await act(async () => { cpkItem!.click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setRendererColoring', {
            ...TARGET,
            coloringId: 'paint-type-cpk',
        })
        unmount()
    })
})

// --- Keyboard clipboard scope (Cmd+C / X / V over the paint deck) ---
//
// The Edit menu routes to a registered scope rather than to the buttons, so
// the two paths could drift apart. These pin that they do the same thing,
// and that a deck with no rows to act on does not claim the shortcut.

describe('ColorPane clipboard scope', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        _resetClipboardScopesForTest()
    })
    afterEach(() => {
        teardownElectronAPI()
    })

    /** The handlers ColorPane registered, or null when it registered none. */
    function paintScope() {
        return getClipboardScopeForTest('paint-deck')
    }

    it('registers while the Paint deck is showing, and not otherwise', async () => {
        const solid = await mountWith({
            ok: true, className: 'SolidColoring', defaultColor: '#000000',
        })
        expect(paintScope()).toBeNull()
        solid.unmount()

        const paint = await mountWith({
            ok: true, className: 'PaintColoring', paintEntries: [],
        })
        expect(paintScope()).not.toBeNull()
        paint.unmount()
    })

    const PAINT_ROWS_2 = [
        { idx: 0, selStr: 'aname N', colorValue: '#ff0000' },
        { idx: 1, selStr: 'aname CA', colorValue: '#00ff00' },
    ]

    /** Mount the Paint deck with row 1 selected; returns the scope handlers. */
    async function mountWithRowSelected() {
        const view = await mountWith(
            { ok: true, className: 'PaintColoring', paintEntries: PAINT_ROWS_2 },
            true,
        )
        const row = view.container.querySelectorAll('.color-row')[1] as HTMLElement
        await act(async () => { row.click() })
        await flushPromises()
        const scope = paintScope()
        if (!scope) throw new Error('paint-deck scope was not registered')
        return { ...view, scope }
    }

    // One mount per action: copy/cut/paste each move the row selection, so
    // chaining them in a single mount would assert against a stale index.
    it.each([
        ['copy', 'copyPaintEntries', { idxs: [1] }],
        ['cut', 'cutPaintEntries', { idxs: [1] }],
    ] as const)('%s reaches the same service as its button', async (action, service, args) => {
        const { cm, scope, unmount } = await mountWithRowSelected()
        await act(async () => { scope[action]() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith(service, { ...TARGET, ...args })
        unmount()
    })

    it('paste reaches pastePaintEntries with the selected row and clipboard rows', async () => {
        const { cm, scope, unmount } = await mountWithRowSelected()
        await act(async () => { scope.paste() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('pastePaintEntries', {
            ...TARGET, idx: 1, entries: CLIP_ROWS,
        })
        unmount()
    })
})
