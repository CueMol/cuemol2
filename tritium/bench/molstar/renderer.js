/**
 * Mol* bench page: load one trajectory, play it, report what was drawn.
 *
 * The cell comes from main as the `cell` query parameter (the spec as CueMol's
 * harness reads it, plus bench:// URLs for its files). The result is printed
 * behind `[BENCH_RESULT]`, as CueMol's renderer does.
 *
 * Choices made on Mol*'s side (all recorded in the result):
 * - The trajectory is built as `loadTrajectory` (extensions/plugin/loaders.ts)
 *   builds it -- topology model, coordinates, TrajectoryFromModelAndCoordinates
 *   -- but without its preset, which for a large structure switches to a
 *   lighter representation and splits water off. One spacefill over the whole
 *   structure instead, hydrogens and water included.
 * - Every post-process pass is off (occlusion, shadow, outline, depth of field,
 *   antialiasing, sharpening, bloom, temporal multi-sampling, illumination), as
 *   CueMol runs with AO, jitter and AA pinned off.
 * - Spheres use impostors (Mol*'s default, `tryUseImpostor: true`), the faster
 *   path. `quality` is fixed rather than 'auto'; with impostors it has no
 *   effect on the spheres.
 * - Playback is Mol*'s own AnimateModelIndex, palindrome, sequential, at its
 *   highest rate (maxFps 60). The camera turns 1 degree about the view's up
 *   axis every frame, as CueMol's md-playback scenario does.
 */

'use strict'

;(async function main() {
  const RESULT_MARKER = '[BENCH_RESULT]'
  const PHASE_MARKER = '[BENCH_PHASE]'
  const DEFAULT_WARMUP_MS = 2000
  const DEFAULT_MEASURE_MS = 6000
  const QUALITY = 'medium'
  const ORBIT_DEG_PER_FRAME = 1.0

  const report = (result) => console.log(`${RESULT_MARKER} ${JSON.stringify(result)}`)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const epochMs = (t) => performance.timeOrigin + t

  function stat(values) {
    if (values.length === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 }
    const sorted = [...values].sort((a, b) => a - b)
    const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
    return {
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      p50: at(50),
      p95: at(95),
      p99: at(99),
      max: sorted[sorted.length - 1],
    }
  }

  let cell
  try {
    cell = JSON.parse(new URLSearchParams(location.search).get('cell'))
  } catch (e) {
    report({ ok: false, error: `no cell: ${e.message}` })
    return
  }
  const spec = cell.spec

  try {
    const viewer = await molstar.Viewer.create('app', {
      layoutIsExpanded: false,
      layoutShowControls: false,
      layoutShowRemoteState: false,
      layoutShowSequence: false,
      layoutShowLog: false,
      layoutShowLeftPanel: false,
      collapseLeftPanel: true,
      collapseRightPanel: true,
      viewportShowExpand: false,
      viewportShowControls: false,
      viewportShowSettings: false,
      viewportShowSelectionMode: false,
      viewportShowAnimation: false,
      viewportShowTrajectoryControls: false,
      viewportShowReset: false,
      viewportShowScreenshotControls: false,
      viewportShowToggleFullscreen: false,
      disableAntialiasing: true,
      pixelScale: 1,
      illumination: false,
      volumeStreamingDisabled: true,
    })
    const plugin = viewer.plugin
    const canvas3d = plugin.canvas3d
    const lib = molstar.lib

    canvas3d.setProps({
      multiSample: { mode: 'off' },
      illumination: { enabled: false },
      postprocessing: {
        occlusion: { name: 'off', params: {} },
        shadow: { name: 'off', params: {} },
        outline: { name: 'off', params: {} },
        dof: { name: 'off', params: {} },
        antialiasing: { name: 'off', params: {} },
        sharpening: { name: 'off', params: {} },
        bloom: { name: 'off', params: {} },
      },
    })

    // --- Draw events ---
    const draws = [] // performance.now() of every didDraw
    let lastSeenDraw = canvas3d.didDraw.value
    canvas3d.didDraw.subscribe((v) => {
      if (v === lastSeenDraw) return
      lastSeenDraw = v
      draws.push(performance.now())
    })

    // --- Load ---
    const topoFormat = spec.reader === 'pdb' ? 'pdb' : spec.reader === 'gro' ? 'gro' : spec.reader
    const coordFormat = (url) => (url.toLowerCase().endsWith('.dcd') ? 'dcd' : 'xtc')
    if (cell.trajectoryUrls.length !== 1) throw new Error('one coordinate file per cell is supported')
    const coordUrl = cell.trajectoryUrls[0]

    const loadStart = performance.now()
    const topoData = await plugin.builders.data.download({ url: cell.topologyUrl, isBinary: false, label: 'topology' })
    const topoTraj = await plugin.builders.structure.parseTrajectory(topoData, topoFormat)
    const topoModel = await plugin.builders.structure.createModel(topoTraj)
    const coordData = await plugin.builders.data.download({ url: coordUrl, isBinary: true, label: 'coordinates' })
    const coords = await plugin.dataFormats.get(coordFormat(coordUrl)).parse(plugin, coordData)
    const trajectory = await plugin.build().toRoot()
      .apply(lib.plugin.StateTransforms.Model.TrajectoryFromModelAndCoordinates,
        { modelRef: topoModel.ref, coordinatesRef: coords.ref },
        { dependsOn: [topoModel.ref, coords.ref] })
      .commit()
    const model = await plugin.builders.structure.createModel(trajectory)
    const structure = await plugin.builders.structure.createStructure(model)
    const reprParams = {
      type: 'spacefill',
      typeParams: { sizeFactor: 1, ignoreHydrogens: false, tryUseImpostor: true, quality: QUALITY },
      color: 'element-symbol',
    }
    const repr = await plugin.builders.structure.representation.addRepresentation(structure, reprParams)
    const committedAt = performance.now()
    plugin.managers.camera.reset(undefined, 0)

    // The first draw after the representation is in the scene.
    for (let waited = 0; !draws.some((t) => t >= committedAt) && waited < 10000; waited += 20) {
      await sleep(20)
    }
    const firstDraw = draws.find((t) => t >= committedAt)
    const firstDrawMs = firstDraw !== undefined ? firstDraw - loadStart : null
    const loadedEpochMs = epochMs(performance.now())

    const gl = canvas3d.webgl.gl
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const machine = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      cpuThreads: navigator.hardwareConcurrency,
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      unmaskedVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
    }
    const structData = structure.cell.obj.data
    const trajData = trajectory.cell.obj.data
    const modelCellRef = model.ref
    const modelIndexNow = () => plugin.state.data.cells.get(modelCellRef).transform.params.modelIndex

    // --- Run ---
    const anim = plugin.managers.animation.animations.find((a) => a.name === 'built-in.animate-model-index')
    const playing = spec.scenario === 'md-playback'
    let orbiting = false
    const orbit = () => {
      if (!orbiting) return
      const cam = canvas3d.camera
      const s = cam.getSnapshot()
      const p = [s.position[0] - s.target[0], s.position[1] - s.target[1], s.position[2] - s.target[2]]
      const u = s.up
      const ul = Math.hypot(u[0], u[1], u[2]) || 1
      const k = [u[0] / ul, u[1] / ul, u[2] / ul]
      const a = (ORBIT_DEG_PER_FRAME * Math.PI) / 180
      const c = Math.cos(a)
      const sn = Math.sin(a)
      const dot = k[0] * p[0] + k[1] * p[1] + k[2] * p[2]
      const cross = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]]
      const r = [0, 1, 2].map((i) => p[i] * c + cross[i] * sn + k[i] * dot * (1 - c))
      cam.setState({ position: [s.target[0] + r[0], s.target[1] + r[1], s.target[2] + r[2]] }, 0)
      requestAnimationFrame(orbit)
    }
    if (playing) {
      await plugin.managers.animation.play(anim, {
        mode: { name: 'palindrome', params: {} },
        duration: { name: 'sequential', params: { maxFps: 60 } },
      })
      orbiting = true
      requestAnimationFrame(orbit)
    }

    await sleep(spec.warmupMs ?? DEFAULT_WARMUP_MS)

    // A trajectory frame counts once it has been drawn: the model index is
    // read at each draw, and a draw showing an index not drawn before is an
    // update.
    const frameStarts = []
    let updates = 0
    let lastDrawnIndex = modelIndexNow()
    const seenIndices = new Set([lastDrawnIndex])
    let firstShown = 0
    let measuring = false
    window.benchGl.take()
    const glFrames = []
    const onDraw = canvas3d.didDraw.subscribe(() => {
      if (!measuring) return
      frameStarts.push(performance.now())
      glFrames.push(window.benchGl.take())
      const idx = modelIndexNow()
      if (idx !== lastDrawnIndex) {
        updates++
        if (!seenIndices.has(idx)) { firstShown++; seenIndices.add(idx) }
        lastDrawnIndex = idx
      }
    })
    console.log(`${PHASE_MARKER} measure-start`)
    const measureStart = performance.now()
    measuring = true
    await sleep(spec.measureMs ?? DEFAULT_MEASURE_MS)
    measuring = false
    const measureEnd = performance.now()
    onDraw.unsubscribe()
    orbiting = false
    if (playing) plugin.managers.animation.stop()

    const elapsedSec = (measureEnd - measureStart) / 1000
    const intervals = frameStarts.map((t, i) => (i === 0 ? 0 : t - frameStarts[i - 1]))
    const glPerFrame = {}
    const glTotal = window.benchGl.zero()
    for (const f of glFrames) for (const k of Object.keys(glTotal)) glTotal[k] += f[k]
    for (const k of Object.keys(glTotal)) glPerFrame[k] = glFrames.length ? glTotal[k] / glFrames.length : 0

    let impostor = null
    try {
      impostor = !!(gl.getExtension && canvas3d.webgl.extensions.fragDepth)
    } catch { /* recorded as unknown */ }

    report({
      ok: true,
      tool: 'molstar',
      molstarVersion: molstar.version,
      spec,
      atomCount: structData.elementCount,
      canvas: {
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
        dpr: window.devicePixelRatio,
        domWidth: gl.canvas.width,
        domHeight: gl.canvas.height,
      },
      machine,
      frames: frameStarts.length,
      drawnFrames: frameStarts.length,
      renderFps: elapsedSec > 0 ? frameStarts.length / elapsedSec : 0,
      updateFps: elapsedSec > 0 ? updates / elapsedSec : 0,
      updates,
      firstShown,
      frameMs: stat(intervals),
      glPerFrame,
      glTotal,
      trajectory: { atoms: structData.elementCount, frames: trajData.frameCount, formats: [coordFormat(coordUrl)] },
      loadMs: firstDrawMs,
      firstDrawMs,
      phases: {
        loadStartEpochMs: epochMs(loadStart),
        loadedEpochMs,
        measureStartEpochMs: epochMs(measureStart),
        measureEndEpochMs: epochMs(measureEnd),
      },
      memory: performance.memory
        ? { jsHeapUsedMB: performance.memory.usedJSHeapSize / 1e6, jsHeapTotalMB: performance.memory.totalJSHeapSize / 1e6 }
        : null,
      view: { fitted: true },
      input: { pointerEventsNone: getComputedStyle(gl.canvas).pointerEvents === 'none' },
      molstar: {
        canvas3dProps: canvas3d.props,
        representation: reprParams,
        reprRef: repr ? repr.ref : null,
        impostorSupported: impostor,
        animation: playing ? { name: anim.name, mode: 'palindrome', duration: 'sequential', maxFps: 60 } : null,
        orbitDegPerFrame: playing ? ORBIT_DEG_PER_FRAME : 0,
      },
    })
  } catch (e) {
    report({ ok: false, error: String(e && e.stack ? e.stack : e) })
  }
})()
