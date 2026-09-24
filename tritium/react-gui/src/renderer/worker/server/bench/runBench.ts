/**
 * @file worker/server/bench/runBench.ts
 * @description Runs one benchmark cell and returns its result.
 *
 * One process measures one cell, so this loads the structure, builds the
 * renderer, pins the confounders, runs the scenario and reports -- then the
 * process exits. `tritium/bench/run.js` expands the matrix by launching a
 * process per cell.
 *
 * The scenario is stepped from a rAF loop of its own, running alongside the
 * view's own render loop. Stepping from a wall-clock timer instead would let
 * the payload advance at a rate unrelated to the frames being measured.
 */

// Bare specifiers, not `node:`-prefixed: the worker build externalizes
// `fs` / `path` and maps them to a require() call (electron.vite.config.ts
// workerGlobals). The prefixed form is externalized without that mapping and
// ends up undefined at runtime.
import * as fs from 'fs';
import * as path from 'path';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { fail, failFrom, ok, type Result } from '@renderer/worker/shared/result';
import { loadObject } from '@renderer/worker/server/services/file/loadObject';
import { buildHeadlessFileOpenOptions } from '@renderer/worker/server/services/file/headlessOpen';
import { setupMorph } from './morphSetup';
import { setupTrajectory } from './trajSetup';
import { benchCounters, type FrameSample } from './benchCounters';
import { benchGpuTimerAvailable } from './glProxy';
import { makeScenarioStep } from './scenarios';
import type { BenchResult, BenchSpec, BenchStat } from './types';

const DEFAULT_WARMUP_MS = 2000;
const DEFAULT_MEASURE_MS = 6000;

/**
 * Renderer settings recorded with the result.
 *
 * Each of these changes how much geometry the renderer produces, so two cells
 * that disagree on one of them are not comparable however alike their specs
 * look. Names that a given renderer does not have are skipped.
 */
const RENDERER_PROPS_OF_INTEREST = [
    'surfalgor',   // dsurface: distfield / meshms / edtsurf
    'detail',      // tessellation level (spheres, cylinders, surfaces)
    'probe_radius',
    'density',
    'sphr',        // ballstick sphere radius
    'bondw',
    'width',       // cartoon ribbon width
    'lw',          // line width
] as const;

/**
 * Scene properties forced before measuring (names from src/qsys/Scene.qif).
 *
 * Temporal jitter supersampling and adaptive half-resolution AO each keep
 * `GUIView::needsContinuousRedraw()` true, so with either of them on the frame
 * loop goes on drawing full frames when nothing changed and no scenario
 * measures what it says it does. `aa_method` defaults to fxaa, which routes
 * every frame through the off-screen post-process pipeline; a measurement that
 * did not pin it would be comparing two different pipelines whenever someone's
 * saved preference differed.
 */
const DEFAULT_PINS: Record<string, string | number | boolean> = {
    aaJitterLevel: 0,
    aoEnabled: false,
    aoHalfRes: false,
    aa_method: 'none',
};

function reader(spec: BenchSpec): string {
    if (spec.reader) return spec.reader;
    const ext = path.extname(spec.file).toLowerCase();
    if (ext === '.cif' || ext === '.mmcif') return 'mmcif';
    if (ext === '.pdb' || ext === '.ent') return 'pdb';
    if (ext === '.gro') return 'gro';
    return 'mmcif';
}

/**
 * What produced these numbers: the GL context's own account of the GPU and
 * driver, plus the versions around it. Best effort -- a missing field is left
 * out rather than guessed at, since a wrong machine label is worse than none.
 */
function machineInfo(ctx: WorkerContext): Record<string, string | boolean | number> {
    const out: Record<string, string | boolean | number> = {};
    try {
        const nav = globalThis.navigator as unknown as
            { userAgent?: string; platform?: string; hardwareConcurrency?: number };
        if (nav?.userAgent) out.userAgent = nav.userAgent;
        if (nav?.platform) out.platform = nav.platform;
        if (nav?.hardwareConcurrency) out.cpuThreads = nav.hardwareConcurrency;
    } catch { /* not available in this worker */ }
    try {
        Object.assign(out, ctx.svc.benchGpuInfo());
    } catch (e) {
        console.warn('[bench] could not read the GL context info:', e);
    }
    return out;
}

function stat(values: number[]): BenchStat {
    if (values.length === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const at = (p: number): number =>
        sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
    return {
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        p50: at(50),
        p95: at(95),
        p99: at(99),
        max: sorted[sorted.length - 1],
    };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Read a property, or undefined when this object has none by that name. */
function safeGet(target: any, name: string): unknown {
    try {
        return target.getProp(name);
    } catch {
        return undefined;
    }
}

/**
 * Set a property, reporting whether it took.
 *
 * A pin that silently does nothing is worse than no pin at all -- the run
 * would look measured while a confounder stayed on -- so the caller collects
 * the failures and says so.
 */
function safeSet(target: any, name: string, value: unknown): boolean {
    try {
        target.setProp(name, value);
        const read = target.getProp(name);
        return read === value || String(read) === String(value);
    } catch {
        return false;
    }
}

/** Mean of a numeric field across the collected frames. */
function perFrameMeans(samples: FrameSample[]): Record<string, number> {
    if (samples.length === 0) return {};
    const out: Record<string, number> = {};
    const keys = Object.keys(samples[0].gl) as (keyof FrameSample['gl'])[];
    for (const k of keys) {
        let sum = 0;
        for (const s of samples) sum += s.gl[k];
        out[k] = sum / samples.length;
    }
    return out;
}

function memoryNow(): BenchResult['memory'] {
    try {
        const m = process.memoryUsage();
        return {
            rssMB: m.rss / 1e6,
            externalMB: m.external / 1e6,
            heapMB: m.heapUsed / 1e6,
        };
    } catch {
        return null;
    }
}

/** The addon's own counters, when this build exposes them. */
function nativeStats(ctx: WorkerContext): Record<string, number> | null {
    const cuemol = ctx.svc.nativeRoot as unknown as Record<string, unknown>;
    if (!cuemol || typeof cuemol.getBenchStats !== 'function') return null;
    try {
        return (cuemol.getBenchStats as () => Record<string, number>)();
    } catch {
        return null;
    }
}

function resetNativeStats(ctx: WorkerContext): void {
    const cuemol = ctx.svc.nativeRoot as unknown as Record<string, unknown>;
    if (cuemol && typeof cuemol.resetBenchStats === 'function') {
        try {
            (cuemol.resetBenchStats as () => void)();
        } catch {
            // Older addon without the counters.
        }
    }
}

export interface RunBenchArgs {
    /** Absolute path of the spec file. */
    specPath: string;
    sceneId: number;
    viewId: number;
    canvasWidth: number;
    canvasHeight: number;
    dpr: number;
}

export async function runBench(
    ctx: WorkerContext,
    args: RunBenchArgs,
): Promise<Result<{ result: BenchResult }>> {
    let spec: BenchSpec;
    try {
        spec = JSON.parse(fs.readFileSync(args.specPath, 'utf8')) as BenchSpec;
    } catch (e) {
        return failFrom(e, 'io');
    }

    const specDir = path.dirname(args.specPath);
    const resolve = (p: string): string => (path.isAbsolute(p) ? p : path.resolve(specDir, p));

    const scene = ctx.sceMgr.getScene(args.sceneId);
    if (!scene) return fail('scene not found', 'not-found');
    const view = ctx.sceMgr.getView(args.viewId);
    if (!view) return fail('view not found', 'not-found');

    benchCounters.enable();

    // Nothing the mouse does may reach the measurement.
    //
    // A hover hit test runs a whole extra scene pass into the ID buffer and
    // then reads it back with a synchronous readPixels, so a single stray
    // mouse move over the window stalls the pipeline and lands in the frame
    // times. The renderer already leaves the hover handler unmounted here
    // (shell/ContentPane.tsx); this switches off the pick pass underneath it
    // as well, so a hit test from any other source is just as harmless.
    let gpuPickOff = false;
    try {
        const vic = ctx.svc.getService('ViewInputConfig') as unknown as {
            gpu_pick?: boolean;
        };
        if (vic) {
            vic.gpu_pick = false;
            gpuPickOff = vic.gpu_pick === false;
        }
    } catch (e) {
        console.warn('[bench] could not switch off the GPU pick pass:', e);
    }

    // Swap the GL context for the counting wrapper now that the canvas is
    // bound. Doing it here, rather than at bindCanvas, keeps a normal session
    // on the raw context.
    try {
        ctx.svc.enableBenchCounters();
    } catch (e) {
        return failFrom(e, 'unsupported');
    }

    // --- Load ---
    const loadStart = performance.now();
    const readerName = reader(spec);
    const objectName = path.basename(spec.file).replace(/\.[^.]+$/, '');
    const options = buildHeadlessFileOpenOptions(ctx, {
        readerName,
        objectName,
        rendererType: spec.renderer,
        selection: spec.selection ?? null,
    });
    let obj: any;
    let loadedObjId: number;
    let traj: any = null;
    let trajInfo: BenchResult['trajectory'] = null;
    if (spec.scenario === 'md-playback') {
        // `file` is the topology; the frames come from the coordinate files,
        // appended to an mdtools Trajectory built on top of it.
        if (!spec.trajectory || spec.trajectory.files.length === 0) {
            return fail('md-playback needs `trajectory.files` in the spec', 'unsupported');
        }
        const setup = setupTrajectory(ctx, {
            sceneId: args.sceneId,
            topologyPath: resolve(spec.file),
            topologyReader: spec.trajectory.topologyReader ?? readerName,
            trajPaths: spec.trajectory.files.map(resolve),
            nevery: spec.trajectory.nevery,
            lazy: spec.trajectory.lazy,
            renderer: options.renderer,
        });
        if (!setup.ok || setup.objId === undefined) {
            return fail(`trajectory setup: ${setup.error ?? 'failed'}`, 'native');
        }
        loadedObjId = setup.objId;
        obj = scene.getObject(loadedObjId);
        traj = obj;
        trajInfo = {
            atoms: null,
            frames: setup.frames ?? 0,
            blocks: setup.blocks ?? 0,
            formats: setup.formats ?? [],
            lazy: setup.lazy ?? null,
        };
    } else {
        const loaded = loadObject(ctx, {
            filePath: resolve(spec.file),
            sceneId: args.sceneId,
            options,
            contentFirst: false,
            readerName,
        });
        if (!loaded.ok) return loaded;
        loadedObjId = loaded.objId;
        obj = scene.getObject(loadedObjId);
    }

    // Turn the structure into a two-frame morph, for the scenario that moves
    // the atoms without changing the topology. The object is replaced, so
    // everything below -- fitView, the renderer lookup, the scenario step --
    // has to see the MorphMol and not what was loaded.
    let morph: any = null;
    let morphInfo: { frames: number } | null = null;
    if (spec.scenario === 'coord-morph') {
        if (!spec.morphFile) {
            return fail('coord-morph needs `morphFile` in the spec', 'unsupported');
        }
        const setup = setupMorph(ctx, {
            sceneId: args.sceneId,
            objId: loadedObjId,
            morphFile: resolve(spec.morphFile),
            readerName,
            rendererType: spec.renderer,
            selection: spec.selection ?? null,
        });
        if (!setup.ok || setup.objId === undefined) {
            return fail(`morph setup: ${setup.error ?? 'failed'}`, 'native');
        }
        obj = scene.getObject(setup.objId);
        morph = obj;
        morphInfo = { frames: setup.frames ?? 0 };
    }

    // Frame the whole molecule.
    //
    // The load path only recentres the view (setupRenderer's
    // `recenterIfRequested`), which leaves the zoom wherever it was: a large
    // structure then hangs off every edge of the viewport and most of its
    // triangles are clipped, so the frame cost would follow the viewport
    // rather than the structure and two sizes would not be comparable.
    // `fitView` is on MolCoord and not on Object, and the generated wrapper
    // types do not reflect the runtime subclass, hence the probe.
    const fitted = (() => {
        try {
            const probe = obj as unknown as Record<string, unknown>;
            if (typeof probe?.fitView !== 'function') return false;
            (probe.fitView as (v: unknown, fsel: boolean) => void)(view, false);
            return true;
        } catch (e) {
            console.warn('[bench] fitView failed:', e);
            return false;
        }
    })();

    // Let the first frames get through so the load number covers the whole
    // path from file to something on screen.
    await sleep(250);
    const loadMs = performance.now() - loadStart;

    // --- Pin the confounders ---
    const pins = { ...DEFAULT_PINS, ...(spec.pin ?? {}) };
    const unpinned: string[] = [];
    for (const [name, value] of Object.entries(pins)) {
        if (!safeSet(scene, name, value)) unpinned.push(name);
    }
    if (unpinned.length > 0) {
        console.warn(`[bench] these properties could not be pinned: ${unpinned.join(', ')}`);
    }

    const rend = (() => {
        try {
            return obj?.getRendererByType?.(spec.renderer) ?? null;
        } catch {
            return null;
        }
    })();

    // The renderer's own settings, so a result says what it measured rather
    // than only what was asked for. A surface renderer picks between three
    // algorithms that differ by more than the thing being benchmarked, and
    // until now the only way to tell which one ran was to read the log.
    const rendererProps = (() => {
        if (!rend) return {};
        const out: Record<string, string | number | boolean> = {};
        for (const name of RENDERER_PROPS_OF_INTEREST) {
            const v = safeGet(rend, name);
            if (v !== undefined && (typeof v === 'string' || typeof v === 'number' ||
                                    typeof v === 'boolean')) {
                out[name] = v;
            }
        }
        return out;
    })();

    // MolCoord exposes the count as a method, not a property (MolCoord.qif
    // `getAtomSize`), and the generated wrapper types do not reflect the
    // runtime subclass -- hence the probe before the call, the pattern the
    // rest of the worker services use for subclass-only members.
    const atomCount = (() => {
        try {
            const probe = obj as unknown as Record<string, unknown>;
            if (typeof probe?.getAtomSize !== 'function') return null;
            const n = (probe.getAtomSize as () => number)();
            return typeof n === 'number' ? n : null;
        } catch {
            return null;
        }
    })();

    // --- Run ---
    //
    const step = makeScenarioStep(spec.scenario, { ctx, view, scene, obj, traj, morph, rend });
    let advances = 0;
    let running = true;
    const tick = (): void => {
        if (!running) return;
        if (step()) advances++;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    await sleep(spec.warmupMs ?? DEFAULT_WARMUP_MS);

    advances = 0;
    benchCounters.inputLatencies.length = 0;
    benchCounters.updateTimes.length = 0;
    resetNativeStats(ctx);
    benchCounters.startCollecting();
    const measureStart = performance.now();
    await sleep(spec.measureMs ?? DEFAULT_MEASURE_MS);
    const elapsedSec = (performance.now() - measureStart) / 1000;
    const samples = benchCounters.stopCollecting();
    const latencies = benchCounters.inputLatencies.slice();
    const updates = benchCounters.updateTimes.slice();
    running = false;

    const gpuSamples = samples.map((s) => s.gpuMs).filter((v): v is number => v !== null);

    const result: BenchResult = {
        ok: true,
        spec,
        atomCount,
        canvas: { width: args.canvasWidth, height: args.canvasHeight, dpr: args.dpr },
        machine: machineInfo(ctx),
        frames: samples.length,
        drawnFrames: samples.filter((s) => s.drawn).length,
        renderFps: elapsedSec > 0 ? samples.length / elapsedSec : 0,
        updateFps: elapsedSec > 0 ? advances / elapsedSec : 0,
        frameMs: stat(samples.map((s) => s.intervalMs)),
        cpuMs: stat(samples.map((s) => s.cpuMs)),
        gpuMs: benchGpuTimerAvailable() && gpuSamples.length > 0 ? stat(gpuSamples) : null,
        glPerFrame: perFrameMeans(samples),
        native: nativeStats(ctx),
        memory: memoryNow(),
        input: { gpuPickOff, hoverMounted: false, canvasMouseBound: false },
        inputLatencyMs: latencies.length > 0 ? stat(latencies) : null,
        rendererProps,
        view: {
            fitted,
            zoom: Number(safeGet(view, 'zoom')) || 0,
            distance: Number(safeGet(view, 'distance')) || 0,
            slab: Number(safeGet(view, 'slab')) || 0,
        },
        morph: morphInfo,
        trajectory: trajInfo ? { ...trajInfo, atoms: atomCount } : null,
        updateMs: updates.length > 0 ? stat(updates) : null,
        pins,
        unpinned,
        loadMs,
        timestamp: new Date().toISOString(),
    };

    return ok({ result });
}
