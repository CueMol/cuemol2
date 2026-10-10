#!/usr/bin/env node
/**
 * @file e2e/inspect.mjs
 * @description UI layout inspector: launches the built app (out/) under
 * Playwright's Electron driver, opens one pane or dialog, and for every
 * window size x theme writes a layout-audit report and screenshots.
 *
 * A development-time check of the screen as it is now (size tokens, nothing
 * cut off or overlapping), not a regression test: nothing is compared with
 * an earlier run and no baseline is stored.
 *
 * Usage (from tritium/react-gui, after `task build_tritium`):
 *   node e2e/inspect.mjs --target <spec> [options]
 *
 * Exit code: 0 = no error/warn issues, 1 = issues found, 2 = the run failed.
 */

import { parseArgs } from 'node:util'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron } from 'playwright-core'
import { layoutAudit } from './lib/layoutAudit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_DIR = resolve(HERE, '..')
const require = createRequire(import.meta.url)
// `task inspect_tritium_ui` runs from react-gui; it passes the caller's cwd so
// relative paths mean what the user typed.
const CALLER_CWD = process.env.INSPECT_CWD || process.cwd()

const USAGE = `Usage: node e2e/inspect.mjs --target <spec> [options]

Targets (shorthands for the options below):
  dialog:<CmdId>        dispatch the command and audit the topmost .bp5-dialog
                        e.g. dialog:ui.aboutDialog
  view:<viewId>         show a sidebar view and audit .side-panel
                        e.g. view:explorer, view:selection
  catalog               enable the Component Catalog plugin and audit its view
  pane:<css selector>   audit any element already on screen

Options:
  --dispatch <CmdId>    command to dispatch before auditing (repeatable)
  --args <json>         argument object for the last --dispatch
  --view <viewId>       sidebar view to show
  --plugin <id>         plugin to switch on first (repeatable)
  --root <selector>     element to audit and screenshot
  --open <file>         file to open at launch (e.g. a PDB), repeatable
  --theme <list>        comma list of dark,light        (default dark,light)
  --size <list>         comma list of WxH content sizes (default 1400x900,1000x700)
  --ignore <selector>   subtree to skip in the audit (repeatable)
  --window              also save a full-window screenshot per shot
  --out <dir>           output directory (default <tmp>/cuemol-ui-inspect/<target>)
  --timeout <sec>       startup timeout (default 90)
`

// --- arguments ---

const { values: opt } = parseArgs({
  options: {
    target: { type: 'string' },
    dispatch: { type: 'string', multiple: true, default: [] },
    args: { type: 'string' },
    view: { type: 'string' },
    plugin: { type: 'string', multiple: true, default: [] },
    root: { type: 'string' },
    open: { type: 'string', multiple: true, default: [] },
    theme: { type: 'string', default: 'dark,light' },
    size: { type: 'string', default: '1400x900,1000x700' },
    ignore: { type: 'string', multiple: true, default: [] },
    window: { type: 'boolean', default: false },
    out: { type: 'string' },
    timeout: { type: 'string', default: '90' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (opt.help || (!opt.target && !opt.root)) {
  process.stdout.write(USAGE)
  process.exit(opt.help ? 0 : 2)
}

const plan = { dispatch: [...opt.dispatch], view: opt.view, plugins: [...opt.plugin], root: opt.root }
const lastArgs = opt.args ? JSON.parse(opt.args) : undefined
if (opt.target) {
  const [kind, ...rest] = opt.target.split(':')
  const value = rest.join(':')
  if (kind === 'dialog') {
    plan.dispatch.push(value)
    plan.root ??= '.bp5-dialog'
  } else if (kind === 'view') {
    plan.view = value
    plan.root ??= '.side-panel'
  } else if (kind === 'catalog') {
    plan.plugins.push('catalog')
    plan.view = 'catalog'
    plan.root ??= '.side-panel'
  } else if (kind === 'pane') {
    plan.root ??= value
  } else {
    process.stderr.write(`unknown target kind: ${kind}\n${USAGE}`)
    process.exit(2)
  }
}

const themes = opt.theme.split(',').map((s) => s.trim()).filter(Boolean)
const sizes = opt.size.split(',').map((s) => {
  const [w, h] = s.trim().split('x').map(Number)
  if (!w || !h) throw new Error(`bad --size entry: ${s}`)
  return { w, h }
})
const slug = (opt.target || plan.root).replace(/[^\w.-]+/g, '_')
const outDir = resolve(CALLER_CWD, opt.out || join(tmpdir(), 'cuemol-ui-inspect', slug))
mkdirSync(outDir, { recursive: true })

// --- helpers ---

const log = (...a) => console.log('[inspect]', ...a)

async function waitFor(fn, timeoutMs, what) {
  const t0 = Date.now()
  for (;;) {
    const v = await fn().catch(() => undefined)
    if (v) return v
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 200))
  }
}

/** Wait until the root's rect has stopped changing (dialog open animation). */
async function settle(page, selector) {
  let last = ''
  let stable = 0
  for (let i = 0; i < 50 && stable < 3; i++) {
    const cur = await page.evaluate((sel) => {
      const all = document.querySelectorAll(sel)
      const el = all[all.length - 1]
      if (!el) return 'none'
      const r = el.getBoundingClientRect()
      return [r.x, r.y, r.width, r.height].map(Math.round).join(',')
    }, selector)
    stable = cur === last && cur !== 'none' ? stable + 1 : 0
    last = cur
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  }
  if (last === 'none') throw new Error(`root not found: ${selector}`)
}

/** Draw a numbered red box over each issue, screenshot, then remove them. */
async function annotate(page, rootSel, issues, file) {
  await page.evaluate((list) => {
    const layer = document.createElement('div')
    layer.id = '__inspect_overlay'
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    list.forEach((it, i) => {
      const b = document.createElement('div')
      const color = it.severity === 'error' ? '#ff2d55' : '#ff9f0a'
      b.style.cssText = `position:fixed;left:${it.rect.x}px;top:${it.rect.y}px;width:${Math.max(it.rect.w, 2)}px;` +
        `height:${Math.max(it.rect.h, 2)}px;outline:2px solid ${color};outline-offset:0`
      const tag = document.createElement('span')
      tag.textContent = String(it.n ?? i + 1)
      tag.style.cssText = `position:absolute;left:-2px;top:-14px;font:bold 10px/12px sans-serif;color:#fff;background:${color};padding:0 3px`
      b.appendChild(tag)
      layer.appendChild(b)
    })
    document.body.appendChild(layer)
  }, issues)
  const all = page.locator(rootSel)
  await all.nth((await all.count()) - 1).screenshot({ path: file, animations: 'disabled' })
  await page.evaluate(() => document.getElementById('__inspect_overlay')?.remove())
}

/**
 * Screenshot each issue that is scrolled out of view: scroll it in, re-read
 * its rect, shoot the root with that one box drawn, then restore every
 * scroller. Returns issue id -> image path.
 */
async function shootOffscreen(page, rootSel, issues, base, outDir, limit) {
  const images = {}
  await page.evaluate(() => {
    const list = []
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el)
      if (/auto|scroll/.test(cs.overflowX + cs.overflowY)) list.push([el, el.scrollTop, el.scrollLeft])
    }
    window.__inspectScroll = list
  })
  for (const it of issues.slice(0, limit)) {
    const rect = await page.evaluate((id) => {
      const el = Array.from(document.querySelectorAll('[data-inspect-issue]'))
        .find((e) => e.getAttribute('data-inspect-issue').split(' ').includes(String(id)))
      if (!el) return null
      // Scroll only real scrollers: scrollIntoView would also shift an
      // overflow:hidden box and hide the very clipping being reported.
      for (let a = el.parentElement; a; a = a.parentElement) {
        const cs = getComputedStyle(a)
        const r = el.getBoundingClientRect()
        const ar = a.getBoundingClientRect()
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') {
          a.scrollTop += r.top + r.height / 2 - (ar.top + ar.height / 2)
        }
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') {
          a.scrollLeft += r.left + r.width / 2 - (ar.left + ar.width / 2)
        }
      }
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
    }, it.id)
    if (!rect) continue
    const file = join(outDir, `${base}_issue${it.n}.png`)
    await annotate(page, rootSel, [{ ...it, rect }], file)
    images[it.id] = file
  }
  await page.evaluate(() => {
    for (const [el, t, l] of window.__inspectScroll) { el.scrollTop = t; el.scrollLeft = l }
    delete window.__inspectScroll
  })
  return images
}

/** Close without hanging on the unsaved-changes prompt (tritium/CLAUDE.md). */
async function shutdown(app, page) {
  const closing = app.close().catch(() => {})
  const t0 = Date.now()
  while (Date.now() - t0 < 15000) {
    const done = await Promise.race([closing.then(() => true), new Promise((r) => setTimeout(() => r(false), 300))])
    if (done) return
    try {
      await page.locator('.bp5-dialog button', { hasText: "Don't Save" }).first().click({ timeout: 300 })
    } catch {
      /* no prompt, or the page is gone */
    }
  }
  app.process().kill('SIGKILL')
}

// --- run ---

const appLog = createWriteStream(join(outDir, 'app.log'))
let app
let page
let exitCode = 0
try {
  log('launching', APP_DIR)
  app = await _electron.launch({
    executablePath: require('electron'),
    args: ['.', ...opt.open.map((f) => resolve(CALLER_CWD, f))],
    cwd: APP_DIR,
    env: { ...process.env, CUEMOL_E2E: '1', CUEMOL_FRESH_PREFS: '1' },
    timeout: Number(opt.timeout) * 1000,
  })
  let shaderReady = false
  const onOut = (d) => {
    appLog.write(d)
    if (String(d).includes('shader program created OK')) shaderReady = true
  }
  app.process().stdout.on('data', onOut)
  app.process().stderr.on('data', onOut)

  page = await app.firstWindow()
  await waitFor(
    () => page.evaluate(() => {
      const s = window.__cuemolE2E?.status()
      return s && s.cueMolReady && s.layoutLoaded && s.themeLoaded && s.pluginsLoaded
    }),
    Number(opt.timeout) * 1000,
    'window.__cuemolE2E status (is out/ a dev build? run `task build_tritium`)',
  )
  await waitFor(async () => shaderReady, 30000, 'shader program created OK').catch(() =>
    log('warning: "shader program created OK" not seen; continuing'),
  )
  log('app ready')

  if (opt.open.length) {
    // A file opened at launch may raise the File Open options dialog; accept
    // it with its primary button so the file loads and the dialog under
    // inspection is the only one on screen.
    let quietSince = Date.now()
    const t0 = Date.now()
    while (Date.now() - quietSince < 2000 && Date.now() - t0 < 30000) {
      const btn = page.locator('.bp5-dialog .bp5-intent-primary').first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 2000 }).catch(() => {})
        quietSince = Date.now()
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    log('opened', opt.open.join(', '))
  }

  for (const id of plan.plugins) {
    await page.evaluate((pid) => window.__cuemolE2E.setPluginEnabled(pid, true), id)
  }
  if (plan.view) {
    // A plugin's view exists only once the switch above has re-rendered;
    // opening it earlier falls back to the Explorer.
    await waitFor(
      () => page.evaluate((v) => window.__cuemolE2E.views().includes(v), plan.view),
      10000,
      `sidebar view ${plan.view} (views: explorer, view, selection, crystal, or a plugin's)`,
    )
    await page.evaluate((v) => window.__cuemolE2E.openView(v), plan.view)
  }
  for (let i = 0; i < plan.dispatch.length; i++) {
    const id = plan.dispatch[i]
    const args = i === plan.dispatch.length - 1 ? lastArgs : undefined
    await waitFor(() => page.evaluate((c) => window.__cuemolE2E.has(c), id), 10000, `command ${id} registered`)
    await page.evaluate(([c, a]) => window.__cuemolE2E.dispatch(c, a), [id, args])
  }

  const shots = []
  for (const size of sizes) {
    await app.evaluate(({ BrowserWindow }, s) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.webContents.getURL().includes('render.html'))
      if (win.isMaximized()) win.unmaximize()
      win.setContentSize(s.w, s.h)
    }, size)
    await waitFor(
      () => page.evaluate((s) => window.innerWidth === s.w && window.innerHeight === s.h, size),
      5000,
      `window resize to ${size.w}x${size.h}`,
    ).catch(() => log(`warning: window did not reach ${size.w}x${size.h} (screen too small?)`))

    for (const theme of themes) {
      await page.evaluate((t) => window.__cuemolE2E.setTheme(t), theme)
      await settle(page, plan.root)
      const result = await page.evaluate(layoutAudit, { rootSelector: plan.root, ignore: opt.ignore })
      const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))
      const base = `${slug}_${theme}_${vp.w}x${vp.h}`
      const image = join(outDir, `${base}.png`)
      const all = page.locator(plan.root)
      await all.nth((await all.count()) - 1).screenshot({ path: image, animations: 'disabled' })
      let windowImage
      if (opt.window) {
        windowImage = join(outDir, `${base}_window.png`)
        await page.screenshot({ path: windowImage, animations: 'disabled' })
      }
      const flagged = result.issues.filter((i) => i.severity !== 'info')
      flagged.forEach((it, i) => { it.n = i + 1 })
      const shown = flagged.filter((i) => !i.offscreen)
      let annotated
      if (shown.length) {
        annotated = join(outDir, `${base}_issues.png`)
        await annotate(page, plan.root, shown, annotated)
      }
      const offImages = await shootOffscreen(page, plan.root, flagged.filter((i) => i.offscreen), base, outDir, 8)
      for (const it of flagged) if (offImages[it.id]) it.image = offImages[it.id]
      shots.push({ theme, viewport: vp, root: result.root, image, windowImage, annotated, issues: result.issues })
    }
  }

  const report = { target: opt.target ?? null, plan, outDir, shots }
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))

  // --- summary ---
  for (const s of shots) {
    const flagged = s.issues.filter((i) => i.severity !== 'info')
    const info = s.issues.length - flagged.length
    console.log(`\n== ${s.theme} ${s.viewport.w}x${s.viewport.h}  root=${JSON.stringify(s.root)}  ` +
      `issues=${flagged.length}${info ? ` (+${info} info)` : ''}`)
    console.log(`   image: ${s.image}`)
    if (s.annotated) console.log(`   annotated: ${s.annotated}`)
    flagged.slice(0, 15).forEach((i) => {
      console.log(`   ${i.n}. [${i.severity}] ${i.kind}  "${i.text}"  ${i.path}`)
      if (i.offscreen) console.log(`      (scrolled out of view)${i.image ? ` image: ${i.image}` : ''}`)
      if (i.detail && Object.keys(i.detail).length) console.log(`      ${JSON.stringify(i.detail)}`)
    })
    if (flagged.length > 15) console.log(`   ... ${flagged.length - 15} more in report.json`)
    if (flagged.length) exitCode = 1
  }
  console.log(`\nreport: ${join(outDir, 'report.json')}`)
} catch (e) {
  console.error('[inspect] FAILED:', e?.message ?? e)
  console.error(`[inspect] app log: ${join(outDir, 'app.log')}`)
  exitCode = 2
} finally {
  if (app) await shutdown(app, page)
  appLog.end()
}
process.exit(exitCode)
