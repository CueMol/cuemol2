// Temporary performance instrumentation for diagnosing drag-rotation jank.
// Toggle the boolean flags below and reload the worker to A/B test.
// Remove this file (and its imports) once profiling is finished.

// === A/B flags ===
// Emit per-second aggregated counters to the worker console.
// Set to true only when re-running performance profiling.
export const PERF_MEASURE = false;

// When true, GfxManager skips the wrapGL() Proxy and uses the raw WebGL
// context. The Proxy calls gl.getError() after every GL command, which
// forces a CPU/GPU pipeline sync. Bypassing it should remove that stall.
// export const BYPASS_WRAP_GL = false;
export const BYPASS_WRAP_GL = true;

// When true, drawBuffer() honors the isUpdated flag the C++ side passed in
// (i.e. only re-uploads VBO/IBO when the engine reports the data changed).
// When false (current behavior), drawBuffer overrides isUpdated to true and
// re-uploads every frame.
// export const RESPECT_ISUPDATED = false;
export const RESPECT_ISUPDATED = true;

// === Counters ===
export const perfCounters = {
    // Frame loop
    frameCount: 0,
    frameTimeMs: 0,
    frameTimeMaxMs: 0,
    // drawBuffer
    drawBufferCalls: 0,
    drawBufferIsUpdatedRawTrue: 0,  // C++ side reported isUpdated == true
    drawBufferUploads: 0,            // actual bufferSubData() invocations
    bufferSubDataBytes: 0,
    // wrapGL (only meaningful when BYPASS_WRAP_GL is false)
    wrappedGlCalls: 0,
    // Input
    mouseMoveCount: 0,
    // Buffer-level dirty tracking: counts per buffer name when C++ isUpdated==true
    dirtyBufferCounts: {} as Record<string, number>,
};

let perfLastFlushMs = -1;

export function maybeFlushPerf(): void {
    if (!PERF_MEASURE) return;
    const now = performance.now();
    if (perfLastFlushMs < 0) {
        perfLastFlushMs = now;
        return;
    }
    const dt = now - perfLastFlushMs;
    if (dt < 1000) return;

    const c = perfCounters;
    const fps = (c.frameCount * 1000) / dt;
    const avgFrame = c.frameCount > 0 ? c.frameTimeMs / c.frameCount : 0;
    const mb = c.bufferSubDataBytes / 1024 / 1024;
    // eslint-disable-next-line no-console
    console.log(
        `[PERF ${dt.toFixed(0)}ms]` +
        ` fps=${fps.toFixed(1)}` +
        ` avgFrame=${avgFrame.toFixed(2)}ms` +
        ` maxFrame=${c.frameTimeMaxMs.toFixed(2)}ms` +
        ` drawCalls=${c.drawBufferCalls}` +
        ` isUpdRaw=${c.drawBufferIsUpdatedRawTrue}` +
        ` uploads=${c.drawBufferUploads}` +
        ` vbo=${mb.toFixed(2)}MB` +
        ` glCalls=${c.wrappedGlCalls}` +
        ` mouseMove=${c.mouseMoveCount}` +
        ` [wrapGL=${!BYPASS_WRAP_GL} respectIsUpd=${RESPECT_ISUPDATED}]`,
    );

    // Top-5 dirty buffers by name (C++ isUpdated==true count)
    const topDirty = Object.entries(c.dirtyBufferCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    if (topDirty.length > 0) {
        // eslint-disable-next-line no-console
        console.log(
            '[PERF dirty-top5] ' +
            topDirty.map(([k, v]) => `${k}:${v}`).join(' | '),
        );
    }

    c.frameCount = 0;
    c.frameTimeMs = 0;
    c.frameTimeMaxMs = 0;
    c.drawBufferCalls = 0;
    c.drawBufferIsUpdatedRawTrue = 0;
    c.drawBufferUploads = 0;
    c.bufferSubDataBytes = 0;
    c.wrappedGlCalls = 0;
    c.mouseMoveCount = 0;
    c.dirtyBufferCounts = {};
    perfLastFlushMs = now;
}
