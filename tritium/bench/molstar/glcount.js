/**
 * GL call counting for the Mol* side of the comparison.
 *
 * Counts the same calls, with the same byte rule, as CueMol's glProxy
 * (react-gui/src/renderer/worker/server/bench/glProxy.ts): uploads take the
 * first argument that has a `byteLength`, so every overload is counted alike
 * and a size-only `bufferData` or a `texImage2D(..., null)` counts 0. CueMol
 * wraps its context in a Proxy; Mol* creates its own context, so here the
 * prototype methods are wrapped instead, before Mol* is loaded. Either way the
 * count is one increment per call.
 *
 * Runs in the renderer page; exposes `window.benchGl`.
 */

'use strict'

;(function () {
  function dataBytesOf(args) {
    for (const a of args) {
      if (a != null && typeof a.byteLength === 'number') return a.byteLength
    }
    return 0
  }

  function zero() {
    return {
      useProgram: 0,
      bufferData: 0,
      bufferDataBytes: 0,
      bufferSubData: 0,
      bufferSubDataBytes: 0,
      texImage: 0,
      texImageBytes: 0,
      texSubImage: 0,
      texSubImageBytes: 0,
      draw: 0,
      drawInstanced: 0,
      readPixels: 0,
      total: 0,
    }
  }

  const benchGl = {
    live: zero(),
    zero,
    /** Hand back what was counted since the last call, and start again. */
    take() {
      const c = benchGl.live
      benchGl.live = zero()
      return c
    },
  }

  const counted = {
    useProgram: (c) => { c.useProgram++ },
    bufferData: (c, args) => { c.bufferData++; c.bufferDataBytes += dataBytesOf(args) },
    bufferSubData: (c, args) => { c.bufferSubData++; c.bufferSubDataBytes += dataBytesOf(args) },
    texImage2D: (c, args) => { c.texImage++; c.texImageBytes += dataBytesOf(args) },
    texImage3D: (c, args) => { c.texImage++; c.texImageBytes += dataBytesOf(args) },
    texSubImage2D: (c, args) => { c.texSubImage++; c.texSubImageBytes += dataBytesOf(args) },
    texSubImage3D: (c, args) => { c.texSubImage++; c.texSubImageBytes += dataBytesOf(args) },
    drawArrays: (c) => { c.draw++ },
    drawElements: (c) => { c.draw++ },
    drawArraysInstanced: (c) => { c.drawInstanced++ },
    drawElementsInstanced: (c) => { c.drawInstanced++ },
    readPixels: (c) => { c.readPixels++ },
  }

  function wrap(proto) {
    if (!proto) return
    for (const name of Object.getOwnPropertyNames(proto)) {
      const desc = Object.getOwnPropertyDescriptor(proto, name)
      if (!desc || typeof desc.value !== 'function' || name === 'constructor') continue
      const orig = desc.value
      const extra = counted[name]
      proto[name] = extra
        ? function (...args) {
          const c = benchGl.live
          c.total++
          extra(c, args)
          return orig.apply(this, args)
        }
        : function (...args) {
          benchGl.live.total++
          return orig.apply(this, args)
        }
    }
  }

  wrap(window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype)
  window.benchGl = benchGl
})()
