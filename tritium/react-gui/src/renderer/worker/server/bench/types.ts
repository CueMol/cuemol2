/**
 * @file worker/server/bench/types.ts
 * @description The benchmark spec a `--bench` process is given, and the cell
 * result it hands back.
 *
 * One process measures exactly one cell. The matrix is expanded by
 * `tritium/bench/run.js`, which launches a process per cell: switching scene,
 * renderer or size inside a live process leaves the previous cell's
 * allocations, heap fragmentation and driver state behind, and the next cell
 * measures those as much as itself.
 */

/** What the frame loop is asked to do while being measured. */
export type BenchScenarioId =
    | 'static-orbit'
    | 'md-playback'
    | 'prop-change'
    | 'load'
    | 'idle';

export interface BenchSpec {
    /** Free-form label carried through to the result. */
    name?: string;
    /** Structure file to open. Relative paths resolve against the spec file. */
    file: string;
    /** Reader nickname (`mmcif`, `pdb`, ...). Guessed from the extension when absent. */
    reader?: string;
    /** Renderer to build (`cpk`, `ballstick`, `cartoon`, `dsurface`, `simple`). */
    renderer: string;
    /** Selection the renderer draws, or null for everything. */
    selection?: string | null;
    scenario: BenchScenarioId;
    /** Milliseconds of untimed warm-up before collection starts. */
    warmupMs?: number;
    /** Milliseconds of collection. */
    measureMs?: number;
    /** MD trajectory to load for `md-playback`. */
    trajectory?: {
        file: string;
        /** Topology file when the trajectory format needs one (PSF, prmtop). */
        topology?: string;
    };
    /**
     * View / scene properties forced before measuring.
     *
     * Temporal jitter, ambient occlusion and hover highlighting each keep
     * `needsContinuousRedraw()` true, so leaving them at their defaults means
     * an "idle" frame is a full frame and no scenario measures what it claims
     * to. Defaults are applied when this is absent; an explicit entry wins.
     */
    pin?: Record<string, string | number | boolean>;
}

/** Summary statistics of one measured quantity. */
export interface BenchStat {
    mean: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
}

export interface BenchResult {
    ok: boolean;
    error?: string;
    spec: BenchSpec;
    /** Atom count of the loaded object, when the object exposes one. */
    atomCount: number | null;
    canvas: { width: number; height: number; dpr: number };
    frames: number;
    /** Frames that issued at least one draw call. */
    drawnFrames: number;
    renderFps: number;
    /**
     * Frames per second at which the scenario's payload actually advanced: a
     * trajectory frame consumed, a property change taken up. Zero for a
     * scenario that changes nothing (`static-orbit`, `idle`), where the
     * meaningful number is `renderFps`.
     */
    updateFps: number;
    frameMs: BenchStat;
    cpuMs: BenchStat;
    gpuMs: BenchStat | null;
    /** Per-frame means of the GL counters. */
    glPerFrame: Record<string, number>;
    /** C++ side breakdown, as reported by the addon (microseconds and counts). */
    native: Record<string, number> | null;
    memory: { rssMB: number; externalMB: number; heapMB: number } | null;
    /** The scene properties that were forced, and which of them did not take. */
    pins: Record<string, string | number | boolean>;
    unpinned: string[];
    /** Wall-clock milliseconds the load phase took (file open through first draw). */
    loadMs: number;
    timestamp: string;
}
