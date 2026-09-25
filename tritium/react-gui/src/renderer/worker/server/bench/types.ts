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
    | 'coord-morph'
    | 'input-latency'
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
    /**
     * Displaced copy of `file` for `coord-morph`, made by
     * `tritium/bench/perturb.py`. Relative paths resolve against the spec.
     */
    morphFile?: string;
    /**
     * MD trajectory for `md-playback`. `file` is then the topology, read onto
     * an mdtools Trajectory, and these are the coordinate files appended to it
     * as blocks (see plugins/mdtools/worker/loadTrajectory.ts).
     */
    trajectory?: {
        /** Frame files (.dcd/.xtc/.trr) in playback order. Relative to the spec. */
        files: string[];
        /** Topology reader nickname for `file`. Defaults to `reader`, else from the extension. */
        topologyReader?: string;
        /** Keep every Nth frame. */
        nevery?: number;
        /**
         * Decode frames on demand (the readers' default, true) or all at open.
         * On demand is what a user gets, and puts file I/O and XTC
         * decompression into every frame; false isolates what is left.
         */
        lazy?: boolean;
        /**
         * Keep only these atoms (Trajectory.applyLoadSel). Frames are then
         * stored, copied and drawn for them alone; the files are still
         * decoded whole.
         */
        loadSelection?: string;
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
    /** width/height: the GL drawing buffer; domWidth/domHeight: the DOM element. */
    canvas: { width: number; height: number; dpr: number; domWidth?: number; domHeight?: number };
    /**
     * The machine the cell ran on: OS, Electron build, and what the GL context
     * says about the GPU and driver.
     *
     * Two results are only comparable if these agree. It matters more than
     * usual here because the coordinate-texture ring is built around how a
     * driver treats a write into a texture the GPU is reading, and ANGLE's
     * Metal, D3D11 and Vulkan backends do not treat it the same way.
     */
    machine: Record<string, string | boolean | number>;
    frames: number;
    /**
     * Frames that issued at least one draw call.
     *
     * Zero for `input-latency`, and correctly so: a view drag draws inside the
     * mouse handler rather than in the frame loop the GL counters wrap, so the
     * loop sees a frame that drew nothing. The drawing is accounted for in
     * `inputLatencyMs` instead.
     */
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
    /**
     * The renderer's effective settings. A surface renderer picks between
     * three algorithms, and a tessellation level decides how much geometry
     * any of them emits, so a result that did not carry them could not be
     * compared with another.
     */
    rendererProps: Record<string, string | number | boolean>;
    /**
     * What was done to keep stray input out of the measurement. A hover hit
     * test runs an extra scene pass and reads it back synchronously, so one
     * mouse move over the window would show up in the frame times.
     */
    input: { gpuPickOff: boolean; hoverMounted: boolean; canvasMouseBound: boolean };
    /**
     * The camera after fitting. Without `fitted` a large structure hangs off
     * the viewport and most of its triangles are clipped, so a cell that
     * reports false is not comparable with one that does not.
     */
    view: { fitted: boolean; zoom: number; distance: number; slab: number };
    /**
     * Input-to-draw latency, for an `input-latency` cell.
     *
     * A view drag draws synchronously -- `View::handleMouseDrag` ends in
     * `forceRedraw()`, which calls `drawScene()` itself rather than raising a
     * flag for the frame loop -- so this is the time the worker's mouse
     * handler takes to return, by which point the frame has been built.
     *
     * It is **not** motion-to-photon. It excludes everything before the event
     * reaches the worker (the OS, the browser's event loop, the hop from the
     * renderer thread) and everything after the frame is built (compositing,
     * the display's own latency). What it covers is the part between the
     * architecture's own two ends.
     */
    inputLatencyMs: BenchStat | null;
    /**
     * How the coordinate-update scenario was set up, for a `coord-morph` cell.
     * A cell whose morph carries fewer than two frames interpolates nothing
     * and would report a healthy frame rate for a scene that never moved.
     */
    morph: { frames: number } | null;
    /**
     * How the trajectory was set up, for an `md-playback` cell. Like `morph`,
     * a cell with fewer than two frames plays nothing and must not pass for a
     * healthy one.
     */
    trajectory: {
        atoms: number | null;
        frames: number;
        blocks: number;
        formats: string[];
        lazy: boolean | null;
        /** Atoms kept by `trajectory.loadSelection`, or null without one. */
        loadedAtoms: number | null;
    } | null;
    /**
     * Time the scenario step spent advancing the payload, for scenarios that
     * move atoms (`md-playback`, `coord-morph`).
     *
     * Setting the frame runs synchronously up to the point where renderers
     * mark themselves dirty: for a trajectory that is the frame decode (file
     * read and XTC decompression when loading lazily), the copy into the
     * coordinate array and the atomsMoved fan-out. The upload and the draw
     * happen later in the frame loop and are in `cpuMs` / `native` instead,
     * so this is the part a trajectory costs over and above a morph.
     */
    updateMs: BenchStat | null;
    /**
     * `updateMs` for an `md-playback` cell, split by whether the frame was
     * shown for the first time in the run. A lazily read frame is decoded on
     * its first showing, so `first` always carries the decode. `cached` is a
     * frame shown before, which is still held unless the block's cache limit
     * released it since (TrajBlock::setCacheLimitBytes, 2 GiB by default, so
     * about 45 frames at 3.9M atoms); a released frame is decoded again and
     * counts here too. So `cached` is only the copy and the atomsMoved
     * fan-out when every frame the run revisits fits under the limit.
     */
    updateSplit: {
        first: BenchStat | null;
        firstCount: number;
        cached: BenchStat | null;
        cachedCount: number;
    } | null;
    /** The scene properties that were forced, and which of them did not take. */
    pins: Record<string, string | number | boolean>;
    unpinned: string[];
    /** Wall-clock milliseconds the load phase took (file open through first draw). */
    loadMs: number;
    timestamp: string;
}
