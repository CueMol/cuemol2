/**
 * Tests for RenderingPane (scene AO / AA / background / colour-proofing pane).
 *
 * Contract pinned here:
 *   1. renders the four sections (Ambient Occlusion / Anti-aliasing / Background
 *      / Color proofing)
 *   2. fetches the scene render opts on mount (getSceneRenderOpts)
 *   3. toggling AO Enabled commits a single-mode write via setSceneRenderOpts
 *   4. changing Jitter SS commits the numeric level via setSceneRenderOpts
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

// Event subscription is covered in useSceneRenderOpts.test.ts; stub here so the
// pane is driven purely by mount + explicit user actions.
vi.mock('../hooks/useCueMolEventListener', () => ({
    useCueMolEventListener: () => undefined,
}))

// The colour picker reaches the worker (compileColor) on mount; stub it so the
// pane test stays isolated from the picker internals.
vi.mock('../h3-kit/colorpicker/CueColorField', () => ({
    CueColorField: () => null,
}))

import { RenderingPane } from '../components/panes/RenderingPane'
import { mountTree, flushPromises } from './helpers/testHarness'

const STATE = {
    ok: true,
    aoEnabled: true,
    aoRadius: 4,
    aoIntensity: 2.2,
    aoSlices: 9,
    aoSteps: 3,
    aoHalfRes: false,
    aaMethod: 'fxaa',
    aaJitterLevel: 0,
    bgColor: '#000000',
    useColProof: false,
    iccFilename: '',
    iccIntent: 'perceptual',
}

function makeCm() {
    return {
        invokeService: vi.fn((name: string) =>
            name === 'getSceneRenderOpts' ? Promise.resolve(STATE) : Promise.resolve({ ok: true }),
        ),
        addEventListener: vi.fn(() => Promise.resolve(1)),
        removeEventListener: vi.fn(() => Promise.resolve()),
    }
}

function makeProps(cm: ReturnType<typeof makeCm>) {
    return {
        cm: cm as never,
        activeSceneId: 5,
        collapsed: false,
    }
}

describe('RenderingPane', () => {
    let cm: ReturnType<typeof makeCm>
    let view: { container: HTMLElement; unmount(): void }

    beforeEach(async () => {
        cm = makeCm()
        view = mountTree(<RenderingPane {...makeProps(cm)} />)
        await flushPromises() // resolve getSceneRenderOpts -> enable controls
    })

    afterEach(() => {
        view.unmount()
    })

    it('renders the four rendering sections', () => {
        const titles = Array.from(
            view.container.querySelectorAll('.h3-form-field-section-title'),
        ).map((e) => e.textContent)
        expect(titles).toEqual([
            'Ambient Occlusion',
            'Anti-aliasing',
            'Background',
            'Color proofing',
        ])
    })

    it('fetches the scene render opts on mount', () => {
        expect(cm.invokeService).toHaveBeenCalledWith('getSceneRenderOpts', { sceneId: 5 })
    })

    it('commits an AO Enabled toggle via setSceneRenderOpts (single mode)', () => {
        // First switch in DOM order is "Ambient Occlusion > Enabled" (true -> false).
        const sw = view.container.querySelector('.h3-form-switch input') as HTMLInputElement
        act(() => sw.click())
        expect(cm.invokeService).toHaveBeenCalledWith('setSceneRenderOpts', {
            sceneId: 5,
            patch: { aoEnabled: false },
            mode: 'single',
            label: 'Ambient occlusion',
        })
    })

    it('commits a Jitter SS change via setSceneRenderOpts', () => {
        const sel = view.container.querySelector(
            'select[aria-label="Jitter supersampling"]',
        ) as HTMLSelectElement
        act(() => {
            sel.value = '3'
            sel.dispatchEvent(new Event('change', { bubbles: true }))
        })
        expect(cm.invokeService).toHaveBeenCalledWith('setSceneRenderOpts', {
            sceneId: 5,
            patch: { aaJitterLevel: 3 },
            mode: 'single',
            label: 'Jitter supersampling',
        })
    })
})
