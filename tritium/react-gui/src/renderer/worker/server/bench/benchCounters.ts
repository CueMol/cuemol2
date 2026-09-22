/**
 * @file worker/server/bench/benchCounters.ts
 * @description Frame timing and GL call counters for a `--bench` run.
 *
 * Runs in the Web Worker thread, next to the render loop it measures.
 *
 * Everything here is dormant until `benchCounters.enable()` is called, which
 * only a bench run does. The frame loop's hook is two branches on a boolean
 * when the harness is off, which is why it can sit on the hot path; the GL
 * counting Proxy is installed separately and only once a run has started (see
 * glProxy.ts), so a normal session never pays for it.
 *
 * Deliberately no `gl.getError()` anywhere: the retired `wrapGL` did that after
 * every call and the implied pipeline flush made the numbers it produced
 * meaningless.
 */

/** GL work seen during one frame. */
export interface GlCallCounts {
    useProgram: number;
    bufferData: number;
    bufferSubData: number;
    bufferSubDataBytes: number;
    bindBuffer: number;
    bindBufferBase: number;
    bindVertexArray: number;
    bindFramebuffer: number;
    bindTexture: number;
    texSubImage: number;
    texSubImageBytes: number;
    getUniformLocation: number;
    uniform: number;
    draw: number;
    drawInstanced: number;
    readPixels: number;
    total: number;
}

/** One measured frame. */
export interface FrameSample {
    /** Milliseconds from the previous frame's start (the frame interval). */
    intervalMs: number;
    /** Milliseconds spent inside the rAF callback (CPU frame time). */
    cpuMs: number;
    /** GPU milliseconds, or null when no timer query result was ready. */
    gpuMs: number | null;
    /** True when the frame issued at least one draw call. */
    drawn: boolean;
    gl: GlCallCounts;
}

function zeroCounts(): GlCallCounts {
    return {
        useProgram: 0,
        bufferData: 0,
        bufferSubData: 0,
        bufferSubDataBytes: 0,
        bindBuffer: 0,
        bindBufferBase: 0,
        bindVertexArray: 0,
        bindFramebuffer: 0,
        bindTexture: 0,
        texSubImage: 0,
        texSubImageBytes: 0,
        getUniformLocation: 0,
        uniform: 0,
        draw: 0,
        drawInstanced: 0,
        readPixels: 0,
        total: 0,
    };
}

/**
 * The single accumulator the render loop and the GL Proxy both write to.
 *
 * A module singleton rather than something passed around because the two
 * writers are far apart -- the rAF callback in ViewLoopController and the
 * Proxy wrapping the GL context -- and threading a handle through both would
 * mean changing signatures that have nothing else to do with benchmarking.
 */
class BenchCounters {
    private _enabled = false;
    private _collecting = false;
    private _lastFrameStart = 0;
    private _samples: FrameSample[] = [];
    /** Counts for the frame currently being drawn. */
    live: GlCallCounts = zeroCounts();
    /** Set by glProxy when a timer query result arrives, consumed by `end`. */
    pendingGpuMs: number | null = null;

    get enabled(): boolean {
        return this._enabled;
    }

    enable(): void {
        this._enabled = true;
    }

    /** Start keeping samples. Clears whatever a previous phase collected. */
    startCollecting(): void {
        this._samples = [];
        this._collecting = true;
        this._lastFrameStart = 0;
    }

    stopCollecting(): FrameSample[] {
        this._collecting = false;
        return this._samples;
    }

    /**
     * Called at the top of the rAF callback. Returns the frame start time,
     * which is handed back to `end`.
     */
    begin(): number {
        if (!this._enabled) return 0;
        this.live = zeroCounts();
        return performance.now();
    }

    /** Input-to-draw intervals closed during collection, in milliseconds. */
    readonly inputLatencies: number[] = [];

    /** Record one input-to-draw interval, if collection is running. */
    addInputLatency(ms: number): void {
        if (this._collecting) this.inputLatencies.push(ms);
    }

    /** Called at the bottom of the rAF callback with `begin`'s return value. */
    end(startedAt: number): void {
        if (!this._enabled || startedAt === 0) return;
        const now = performance.now();
        const drewSomething = this.live.draw + this.live.drawInstanced > 0;
        if (this._collecting) {
            this._samples.push({
                intervalMs: this._lastFrameStart === 0 ? 0 : startedAt - this._lastFrameStart,
                cpuMs: now - startedAt,
                gpuMs: this.pendingGpuMs,
                drawn: drewSomething,
                gl: this.live,
            });
        }
        this.pendingGpuMs = null;
        this._lastFrameStart = startedAt;
    }
}

export const benchCounters = new BenchCounters();
