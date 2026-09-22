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
import {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
} from '@renderer/worker/server/inputEvents';
import { benchCounters } from './benchCounters';
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
 * The synthetic drag: where it starts, how far it travels before wrapping, and
 * how far it moves per frame. Kept well inside the canvas so no frame is spent
 * on a pointer that has left it, and large enough per step that the view
 * actually turns rather than rounding to no rotation at all.
 */
const INPUT_ORIGIN_PX = 200;
const INPUT_SPAN_PX = 400;
const INPUT_STEP_PX = 4;

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

        case 'input-latency': {
            // A drag, because that is the interaction whose latency a user
            // actually feels: the view follows the pointer, so the delay
            // between moving and seeing is the thing being measured.
            //
            // It has to begin with a button press. MouseEventHandler drops a
            // move that arrives in DRAG_NONE, so a stream of bare moves would
            // be discarded before reaching the view and the cell would measure
            // a scene that never redrew. The buttons/modifier bits are what a
            // real left drag sends (see makeModif), so this takes the same
            // path through ViewInputConfig as a hand on the mouse.
            const view = deps.view;
            let x = 0;
            let pressed = false;
            const at = (px: number) => ({
                offsetX: px, offsetY: INPUT_ORIGIN_PX,
                screenX: px, screenY: INPUT_ORIGIN_PX,
                buttons: 1, button: 0,
                ctrlKey: false, shiftKey: false, altKey: false,
            });
            return () => {
                if (!pressed) {
                    handleMouseDown(view, at(INPUT_ORIGIN_PX));
                    pressed = true;
                }
                x += INPUT_STEP_PX;
                if (x >= INPUT_SPAN_PX) {
                    // Lift and press again rather than teleporting the pointer
                    // back, which would be one enormous drag delta.
                    handleMouseUp(view, at(INPUT_ORIGIN_PX + x));
                    pressed = false;
                    x = 0;
                    return false;
                }
                // A view drag draws synchronously: View::handleMouseDrag ends
                // in forceRedraw(), which calls drawScene() itself rather than
                // raising a flag for the frame loop to notice. So the interval
                // closes when handleMouseMove returns -- which is the honest
                // boundary anyway, since by then the frame has been built.
                const sent = performance.now();
                handleMouseMove(view, at(INPUT_ORIGIN_PX + x));
                benchCounters.addInputLatency(performance.now() - sent);
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
