/**
 * @file worker/server/bench/scenarios.ts
 * @description What each benchmark scenario does on every frame.
 *
 * A scenario is a per-frame action plus a count of how often its payload
 * actually advanced. The harness drives them from its own rAF loop rather
 * than from a wall-clock timer, so that "one trajectory frame per displayed
 * frame" means exactly that; the shipping trajectory transport uses
 * `setInterval` at a fixed fps, which is right for playback and useless for
 * measuring.
 */

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import type { BenchScenarioId } from './types';

/** Per-frame work, returning true when the scenario's payload advanced. */
export type ScenarioStep = () => boolean;

export interface ScenarioDeps {
    ctx: WorkerContext;
    view: any;
    scene: any;
    /** The loaded object, for scenarios that mutate it. */
    obj: any | null;
    /** The trajectory wrapper for `md-playback`, else null. */
    traj: any | null;
    /** The MorphMol for `coord-morph`, else null. */
    morph: any | null;
    /** The renderer built for the object, for scenarios that mutate it. */
    rend: any | null;
}

/** Degrees of turntable rotation applied per frame by the orbit scenarios. */
const ORBIT_DEG_PER_FRAME = 1.0;

/**
 * How far along the morph one frame moves. At 60 fps the structure takes
 * about a second to cross, which is the rate a trajectory is played back at
 * and slow enough that consecutive frames differ by a plausible amount.
 */
const MORPH_FRACTION_PER_FRAME = 1 / 60;

/**
 * Build the per-frame step for a scenario.
 *
 * `static-orbit` and `idle` never change the geometry, so their step reports
 * no advance and the meaningful result is the render rate. `md-playback` and
 * `prop-change` do, and their advance count is what `updateFps` is built from.
 */
export function makeScenarioStep(id: BenchScenarioId, deps: ScenarioDeps): ScenarioStep {
    switch (id) {
        case 'idle':
            return () => false;

        case 'static-orbit':
            return () => {
                deps.view.rotateView(0, ORBIT_DEG_PER_FRAME, 0);
                return false;
            };

        case 'md-playback': {
            const traj = deps.traj;
            if (!traj) return () => false;
            const nframe = Number(traj.getProp('nframe')) || 0;
            let frame = 0;
            return () => {
                if (nframe <= 1) return false;
                frame = (frame + 1) % nframe;
                traj.setProp('frame', frame);
                deps.view.rotateView(0, ORBIT_DEG_PER_FRAME, 0);
                return true;
            };
        }

        case 'coord-morph': {
            const morph = deps.morph;
            if (!morph) return () => false;
            // `frame` is a real in 0..1 across the whole morph, so sweeping it
            // gives every displayed frame its own interpolated coordinates
            // rather than repeating one of the two endpoints. The sweep turns
            // around instead of wrapping: a wrap would jump the whole
            // structure back in one frame and that single frame's rebuild
            // would land in the tail of the distribution.
            let t = 0;
            let dir = 1;
            return () => {
                t += dir * MORPH_FRACTION_PER_FRAME;
                if (t >= 1) { t = 1; dir = -1; } else if (t <= 0) { t = 0; dir = 1; }
                morph.setProp('frame', t);
                deps.view.rotateView(0, ORBIT_DEG_PER_FRAME, 0);
                return true;
            };
        }

        case 'prop-change': {
            const rend = deps.rend;
            if (!rend) return () => false;
            // Alternate between two colours: the cheapest change that still
            // forces the renderer to rebuild and re-upload what it drew.
            const colors = ['#ff8040', '#4080ff'];
            let i = 0;
            return () => {
                i = (i + 1) % colors.length;
                try {
                    rend.setProp('defaultcolor', colors[i]);
                } catch {
                    return false; // renderer without that property
                }
                return true;
            };
        }

        case 'load':
            // Everything `load` measures happened before collection started.
            return () => false;
    }
}
