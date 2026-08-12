/**
 * Wire tests for the ColorPane MOLFANC (colormode="molecule") support on the
 * isosurf map renderer. Pins the observable renderer-side wire only:
 *
 *   - Coloring dropdown: isosurf (has `coloring`) offers the full paint set
 *     (Paint/Solid/CPK/Bfac/Rainbow) + Multi-gradient + Reset, but NOT the
 *     Electrostatic-potential item (surface renderers only); clicking Paint
 *     fires setRendererColoring with 'paint-type-paint'.
 *   - "Coloring mol" selector: shown above the class deck in molecule
 *     colormode, lists the scene's MolCoord objects, and commits a change
 *     through setRendererColoringTarget; hidden outside molecule mode.
 *
 * The worker-side protocol (colormode forcing, target auto-pick, resetdef)
 * is pinned in rendererColoringService.test.ts.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

vi.mock('../hooks/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
    CueColorField: ({ value }: { value: string }) => (
        <button type="button" data-testid="color-commit" data-value={value} />
    ),
}))

vi.mock('../h3-kit/colorpicker/ColorPickerContext', () => ({
    ColorPickerProvider: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
    ),
    useColorPickerCtx: () => ({ cm: null, sceneId: undefined }),
}))

vi.mock('../components/panes/PaintSelCell', () => ({
    PaintSelCell: () => <input data-testid="paint-sel-cell" readOnly />,
}))

import { ColorPane } from '../components/panes/ColorPane'
import { mountTree, flushPromises } from './helpers/testHarness'

const SCENE_ID = 7
const REND_ID = 100

/** isosurf coloring state in solid colormode (default after creation). */
const ISOSURF_SOLID = {
    ok: true,
    className: 'SolidColoring',
    defaultColor: '#0000FF',
    paintEntries: [],
    surfaceType: 'isosurf',
    colormode: 'solid',
    multiGradCapable: true,
    hasColoring: true,
    molFancTarget: '',
}

/** isosurf in molecule colormode with a Paint coloring and a target mol. */
const ISOSURF_MOLECULE_PAINT = {
    ...ISOSURF_SOLID,
    className: 'PaintColoring',
    colormode: 'molecule',
    molFancTarget: 'mol1',
}

interface MockCm {
    invokeService: ReturnType<typeof vi.fn>
}

function makeCm(coloringState: Record<string, unknown>): MockCm {
    return {
        invokeService: vi.fn((name: string) => {
            if (name === 'listPaintCapableRenderers') {
                return Promise.resolve({
                    ok: true,
                    renderers: [
                        {
                            objId: 11,
                            objName: 'mtz1',
                            rendId: REND_ID,
                            targetKind: 'renderer',
                            name: 'isosurf1',
                            typeName: 'isosurf',
                        },
                    ],
                })
            }
            if (name === 'getRendererColoringState') {
                return Promise.resolve(coloringState)
            }
            if (name === 'listSceneObjects') {
                return Promise.resolve({
                    objects: [
                        { uid: 21, name: 'mol1', className: 'MolCoord' },
                        { uid: 22, name: 'mol2', className: 'MolCoord' },
                        { uid: 23, name: 'map1', className: 'DensityMap' },
                    ],
                })
            }
            if (name === 'listElePotMapObjects') {
                return Promise.resolve({ ok: true, objects: [] })
            }
            return Promise.resolve({ ok: true })
        }),
    }
}

async function mountWith(coloringState: Record<string, unknown>) {
    const cm = makeCm(coloringState)
    const handle = mountTree(<ColorPane cm={cm as never} sceneId={SCENE_ID} />)
    await flushPromises()
    return { cm, ...handle }
}

/** The select that offers the scene's molecules (the Coloring mol selector). */
function findMolSelector(container: HTMLElement): HTMLSelectElement | null {
    return (
        (Array.from(container.querySelectorAll('select')).find((s) =>
            s.querySelector('option[value="mol2"]'),
        ) as HTMLSelectElement | undefined) ?? null
    )
}

describe('ColorPane MOLFANC wire (isosurf)', () => {
    beforeEach(() => vi.clearAllMocks())

    it('isosurf dropdown offers the paint set + Multi-gradient but no Elepot', async () => {
        const { cm, container, unmount } = await mountWith(ISOSURF_SOLID)
        const trigger = Array.from(
            container.querySelectorAll('button'),
        ).find((b) => b.textContent?.includes('Coloring')) as HTMLButtonElement
        await act(async () => { trigger.click() })
        await flushPromises()
        const items = Array.from(document.querySelectorAll('.bp5-menu-item'))
        expect(items.map((i) => i.textContent)).toEqual([
            'Paint coloring',
            'Solid coloring',
            'CPK coloring',
            'Bfac/Occ coloring',
            'Rainbow coloring',
            'Multi-gradient coloring',
            'Reset to default style',
        ])
        const paint = items.find((i) => i.textContent === 'Paint coloring')!
        await act(async () => { (paint as HTMLElement).click() })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setRendererColoring', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            targetKind: 'renderer',
            coloringId: 'paint-type-paint',
        })
        unmount()
    })

    it('molecule mode shows the Coloring mol selector and commits through setRendererColoringTarget', async () => {
        const { cm, container, unmount } = await mountWith(ISOSURF_MOLECULE_PAINT)
        const select = findMolSelector(container)
        expect(select).not.toBeNull()
        expect(select!.value).toBe('mol1')
        // The DensityMap must not be offered.
        expect(select!.querySelector('option[value="map1"]')).toBeNull()
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(
                HTMLSelectElement.prototype, 'value',
            )!.set!
            setter.call(select!, 'mol2')
            select!.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await flushPromises()
        expect(cm.invokeService).toHaveBeenCalledWith('setRendererColoringTarget', {
            sceneId: SCENE_ID,
            rendId: REND_ID,
            targetKind: 'renderer',
            targetName: 'mol2',
        })
        unmount()
    })

    it('the Coloring mol selector is hidden outside molecule mode', async () => {
        const { container, unmount } = await mountWith(ISOSURF_SOLID)
        expect(findMolSelector(container)).toBeNull()
        unmount()
    })
})
