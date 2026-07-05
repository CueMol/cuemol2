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
    it('registers both the povray and umbreon backends', () => {
        expect(RENDER_BACKEND_IDS).toContain('povray')
        expect(RENDER_BACKEND_IDS).toContain('umbreon')
        expect(RENDER_BACKENDS.umbreon.id).toBe('umbreon')
        expect(RENDER_BACKENDS.umbreon.label).toBe('Umbreon')
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
