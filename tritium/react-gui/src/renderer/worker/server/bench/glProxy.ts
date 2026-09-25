/**
 * @file worker/server/bench/glProxy.ts
 * @description A counting wrapper around the WebGL2 context, installed only
 * for a `--bench` run.
 *
 * The point of counting at this level is that it needs no change to
 * BufferStore / ShaderStore / FboStore: they keep calling the context they
 * were handed, and the harness swaps that context for one that counts. A
 * benchmark branch that edited every call site would conflict with develop on
 * every one of those files.
 *
 * `gl.getError()` is deliberately never called. The retired `wrapGL` debug
 * proxy called it after every GL call, which forces the driver to flush and
 * turns any timing taken through it into a measurement of the flush.
 */

import { benchCounters } from './benchCounters';

/** Byte length of whatever `bufferSubData` / `texSubImage2D` was handed. */
function byteLengthOf(src: unknown): number {
    if (src == null) return 0;
    const v = src as { byteLength?: number };
    return typeof v.byteLength === 'number' ? v.byteLength : 0;
}

/**
 * Bytes of the first argument that carries data (anything with a
 * `byteLength`), whatever overload was used. A size-only `bufferData` or a
 * `texImage2D(..., null)` counts 0. The Mol* comparison harness uses the same
 * rule (`tritium/bench/molstar/glcount.js`).
 */
function dataBytesOf(args: unknown[]): number {
    for (const a of args) {
        if (a != null && typeof (a as { byteLength?: unknown }).byteLength === 'number') {
            return (a as { byteLength: number }).byteLength;
        }
    }
    return 0;
}

/**
 * GPU frame timing through `EXT_disjoint_timer_query_webgl2`.
 *
 * One query is in flight at a time and its result is picked up a few frames
 * later: polling for it in the frame that issued it would stall the pipeline
 * and measure the stall. Absent on most macOS drivers, in which case every
 * sample simply reports a null GPU time.
 */
class GpuTimer {
    private ext: any = null;
    private active: WebGLQuery | null = null;
    private pending: WebGLQuery | null = null;

    constructor(private gl: WebGL2RenderingContext) {
        this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    }

    get available(): boolean {
        return this.ext !== null;
    }

    begin(): void {
        if (!this.ext) return;
        this.poll();
        if (this.pending) return; // one in flight is enough
        this.active = this.gl.createQuery();
        if (this.active) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
    }

    end(): void {
        if (!this.ext || !this.active) return;
        this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
        this.pending = this.active;
        this.active = null;
    }

    /** Collect a finished query, handing the result to the counters. */
    private poll(): void {
        const q = this.pending;
        if (!q) return;
        const gl = this.gl;
        if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
            gl.deleteQuery(q);
            this.pending = null;
            return;
        }
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return;
        benchCounters.pendingGpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(q);
        this.pending = null;
    }
}

let gpuTimer: GpuTimer | null = null;

/** Start / finish the GPU timer query for one frame (no-op when unavailable). */
export function benchGpuFrameBegin(): void {
    gpuTimer?.begin();
}
export function benchGpuFrameEnd(): void {
    gpuTimer?.end();
}
export function benchGpuTimerAvailable(): boolean {
    return gpuTimer?.available ?? false;
}

/**
 * Wrap a WebGL2 context so that the calls a frame makes are counted.
 *
 * Method lookups are memoised: without that, the Proxy would allocate a bound
 * function on every single GL call and the allocation would show up in the
 * frame time it is supposed to measure.
 */
export function installGlCounters(gl: WebGL2RenderingContext): WebGL2RenderingContext {
    gpuTimer = new GpuTimer(gl);
    const cache = new Map<string, unknown>();

    return new Proxy(gl, {
        get(target: any, prop: string | symbol): unknown {
            const cached = cache.get(prop as string);
            if (cached !== undefined) return cached;

            const value = target[prop];
            if (typeof value !== 'function') return value;

            const name = String(prop);
            const counted = (...args: unknown[]): unknown => {
                const c = benchCounters.live;
                c.total++;
                switch (name) {
                    case 'useProgram': c.useProgram++; break;
                    case 'bufferData':
                        c.bufferData++;
                        c.bufferDataBytes += dataBytesOf(args);
                        break;
                    case 'bufferSubData':
                        c.bufferSubData++;
                        // (target, offset, srcData, ...) -- srcData is third.
                        c.bufferSubDataBytes += byteLengthOf(args[2]);
                        break;
                    case 'bindBuffer': c.bindBuffer++; break;
                    case 'bindBufferBase': c.bindBufferBase++; break;
                    case 'bindVertexArray': c.bindVertexArray++; break;
                    case 'bindFramebuffer': c.bindFramebuffer++; break;
                    case 'bindTexture': c.bindTexture++; break;
                    case 'texSubImage2D':
                    case 'texSubImage3D':
                        c.texSubImage++;
                        c.texSubImageBytes += byteLengthOf(args[args.length - 1]);
                        break;
                    case 'texImage2D':
                    case 'texImage3D':
                        c.texImage++;
                        c.texImageBytes += dataBytesOf(args);
                        break;
                    case 'getUniformLocation': c.getUniformLocation++; break;
                    case 'drawArrays':
                    case 'drawElements': c.draw++; break;
                    case 'drawArraysInstanced':
                    case 'drawElementsInstanced': c.drawInstanced++; break;
                    case 'readPixels': c.readPixels++; break;
                    default:
                        if (name.startsWith('uniform')) c.uniform++;
                        break;
                }
                return value.apply(target, args);
            };
            cache.set(name, counted);
            return counted;
        },
    }) as WebGL2RenderingContext;
}
