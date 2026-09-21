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
import { benchCounters, type FrameSample } from './benchCounters';
import { benchGpuTimerAvailable } from './glProxy';
import { makeScenarioStep } from './scenarios';
import type { BenchResult, BenchSpec, BenchStat } from './types';

const DEFAULT_WARMUP_MS = 2000;
const DEFAULT_MEASURE_MS = 6000;

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
    return 'mmcif';
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
    const loaded = loadObject(ctx, {
        filePath: resolve(spec.file),
        sceneId: args.sceneId,
        options,
        contentFirst: false,
        readerName,
    });
    if (!loaded.ok) return loaded;

    const obj = scene.getObject(loaded.objId);
    let traj: any = null;
    if (spec.scenario === 'md-playback' && spec.trajectory) {
        // The trajectory rides on the object that was just loaded; a topology
        // file, when the format needs one, has already come in as that object.
        traj = obj;
    }

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
    const step = makeScenarioStep(spec.scenario, { ctx, view, scene, obj, traj, rend });
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
    resetNativeStats(ctx);
    benchCounters.startCollecting();
    const measureStart = performance.now();
    await sleep(spec.measureMs ?? DEFAULT_MEASURE_MS);
    const elapsedSec = (performance.now() - measureStart) / 1000;
    const samples = benchCounters.stopCollecting();
    running = false;

    const gpuSamples = samples.map((s) => s.gpuMs).filter((v): v is number => v !== null);

    const result: BenchResult = {
        ok: true,
        spec,
        atomCount,
        canvas: { width: args.canvasWidth, height: args.canvasHeight, dpr: args.dpr },
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
        pins,
        unpinned,
        loadMs,
        timestamp: new Date().toISOString(),
    };

    return ok({ result });
}
