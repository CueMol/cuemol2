/**
 * Registry invariants for the render backends. Pins that umbreon is registered
 * and, for every backend, that each prop belongs to one of the backend's own
 * accordion groups and does not collide with a common prop key (the editor
 * writes common + backend edits into one flat key namespace).
 */

import { describe, it, expect } from 'vitest'
import { RENDER_BACKENDS, RENDER_BACKEND_IDS } from '../data/renderBackends'
import { RENDER_COMMON_PROPS } from '../data/renderSettings'

describe('render backends registry', () => {
    it('registers the povray, umbreon and umbreon NPR backends', () => {
        expect(RENDER_BACKEND_IDS).toContain('povray')
        expect(RENDER_BACKEND_IDS).toContain('umbreon')
        expect(RENDER_BACKEND_IDS).toContain('umbreon_npr')
        expect(RENDER_BACKENDS.umbreon.id).toBe('umbreon')
        expect(RENDER_BACKENDS.umbreon.label).toBe('Umbreon')
        expect(RENDER_BACKENDS.umbreon_npr.id).toBe('umbreon_npr')
        expect(RENDER_BACKENDS.umbreon_npr.label).toBe('Umbreon (NPR)')
    })

    // NPR renders through umbreon's hatch ink mode, which discards the shaded
    // color -- umbreon force-disables GI there. Offering a GI lighting or a GI
    // quality ladder would be a dead control, so the backend must carry
    // neither, and its default must be plain raytracing.
    it('offers the NPR backend raytracing and AO only, defaulting to raytracing', () => {
        const quality = RENDER_BACKENDS.umbreon_npr.quality
        expect(quality?.lightings.map((l) => l.id)).toEqual(['none', 'ao'])
        expect(quality?.defaultLighting).toBe('none')
        expect(quality?.axes.map((a) => a.key)).not.toContain('gi')
        const groupKeys = RENDER_BACKENDS.umbreon_npr.groups.map((g) => g.key)
        expect(groupKeys).not.toContain('Global Illumination')
        expect(groupKeys).toContain('Hatching')
        const giProps = RENDER_BACKENDS.umbreon_npr.props.filter(
            (p) => p.group === 'Global Illumination',
        )
        expect(giProps).toEqual([])
    })

    // Every key a lighting option's enable patch writes must exist as a prop of
    // that backend: the settings hook drops patch keys with no matching PropDef,
    // and `lightingOf` then never matches the option, so the selector would
    // silently snap back to "none".
    it('every lighting enable patch key exists as a prop of its backend', () => {
        for (const id of RENDER_BACKEND_IDS) {
            const backend = RENDER_BACKENDS[id]
            if (!backend.quality) continue
            const propKeys = new Set(backend.props.map((p) => p.key))
            for (const lighting of backend.quality.lightings) {
                for (const key of Object.keys(lighting.enable)) {
                    expect(
                        propKeys.has(key),
                        `${id}: lighting "${lighting.id}" patches unknown prop "${key}"`,
                    ).toBe(true)
                }
            }
        }
    })

    it('every backend prop belongs to one of its declared groups', () => {
        for (const id of RENDER_BACKEND_IDS) {
            const backend = RENDER_BACKENDS[id]
            const groupKeys = new Set(backend.groups.map((g) => g.key))
            for (const prop of backend.props) {
                expect(
                    groupKeys.has(prop.group),
                    `${id}: prop "${prop.key}" references undeclared group "${prop.group}"`,
                ).toBe(true)
            }
        }
    })

    it('names umbreon\'s supersampling group after what it holds', () => {
        // Issue: a common "Quality" next to an "Umbreon Quality" is confusing.
        // The group holds supersampling alone, so it says "Antialiasing".
        const groupKeys = RENDER_BACKENDS.umbreon.groups.map((g) => g.key)
        expect(groupKeys).not.toContain('Umbreon Quality')
        expect(groupKeys).toContain('Antialiasing')
        const supersample = RENDER_BACKENDS.umbreon.props.find((p) => p.key === 'supersample')
        expect(supersample?.group).toBe('Antialiasing')
    })

    it('keeps edge lines on/off in the Edges group, not Quality', () => {
        const edgeLines = RENDER_COMMON_PROPS.find((p) => p.key === 'edgeLines')
        expect(edgeLines?.group).toBe('Edges')
    })

    it('no backend prop key collides with a common prop key', () => {
        const commonKeys = new Set(RENDER_COMMON_PROPS.map((cp) => cp.key))
        for (const id of RENDER_BACKEND_IDS) {
            for (const prop of RENDER_BACKENDS[id].props) {
                expect(
                    commonKeys.has(prop.key),
                    `${id}: prop "${prop.key}" collides with a common prop key`,
                ).toBe(false)
            }
        }
    })
})
