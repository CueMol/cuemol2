/**
 * @file e2e/lib/layoutAudit.mjs
 * @description In-page layout audit run by e2e/inspect.mjs through
 * `page.evaluate(layoutAudit, opts)`.
 *
 * Playwright ships the function to the page as source text, so it must stay
 * self-contained: no imports, no references to module scope.
 *
 * Every check measures the page as it is now against absolute rules (the
 * style guide's size tokens, nothing cut off, nothing overlapping). Nothing is
 * compared against an earlier run.
 */

/**
 * Audit the layout of the element tree under a root.
 *
 * @param {{ rootSelector: string, ignore?: string[] }} opts
 *   rootSelector - CSS selector of the subtree to audit (last match wins).
 *   ignore - extra CSS selectors whose subtrees are skipped.
 * @returns {{ root: object | null, issues: object[] }} the root's rect and
 *   the issues found, each `{ kind, severity, path, text, rect, detail }`.
 */
export function layoutAudit(opts) {
  const all = document.querySelectorAll(opts.rootSelector)
  const root = all[all.length - 1]
  if (!root) return { root: null, issues: [] }

  // Subtrees never audited: drag handles, the WebGL canvas, popovers that
  // belong to another surface. `data-audit-ignore` on an element skips the
  // listed kinds ("" = all) for it and its subtree.
  const IGNORE = [
    'canvas',
    '[class*="sash"]',
    '.bp5-tooltip',
    '.bp5-overlay-backdrop',
    ...(opts.ignore || []),
  ].join(',')

  const CONTROL = 'input,button,select,textarea,[role="button"],[role="checkbox"],[role="switch"],' +
    '[role="slider"],[role="tab"],[role="option"],[role="combobox"],[role="spinbutton"],.bp5-button,.bp5-tag'
  const TOL = 1
  const issues = []
  const seen = new Set()
  const vw = window.innerWidth
  const vh = window.innerHeight

  /** Short CSS-ish path from the root, for locating an element in source. */
  function pathOf(el) {
    const parts = []
    let cur = el
    while (cur && cur !== root.parentElement && parts.length < 6) {
      let p = cur.tagName.toLowerCase()
      const cls = Array.from(cur.classList).filter((c) => !c.startsWith('bp5-') || cur === el).slice(0, 2)
      if (cls.length) p += '.' + cls.join('.')
      const parent = cur.parentElement
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === cur.tagName)
        if (same.length > 1) p += `:nth-of-type(${same.indexOf(cur) + 1})`
      }
      parts.unshift(p)
      if (cur === root) break
      cur = parent
    }
    return parts.join(' > ')
  }

  function ownText(el) {
    let t = ''
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent
    return t.trim()
  }

  function textOf(el) {
    const t = (el.getAttribute('aria-label') || el.textContent || el.value || '').trim()
    return t.length > 40 ? t.slice(0, 40) + '...' : t
  }

  function ignoredKinds(el) {
    const host = el.closest('[data-audit-ignore]')
    if (!host || !root.contains(host)) return null
    const v = host.getAttribute('data-audit-ignore').trim()
    return v === '' ? '*' : v.split(',').map((s) => s.trim())
  }

  function r4(r) {
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
  }

  /**
   * Whether any of el is on screen once every non-visible overflow ancestor
   * (scrollers included) and the window are applied.
   */
  function shownRect(el) {
    const r = el.getBoundingClientRect()
    let l = Math.max(r.left, 0), t = Math.max(r.top, 0), rr = Math.min(r.right, vw), b = Math.min(r.bottom, vh)
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      const ar = a.getBoundingClientRect()
      if (cs.overflowX !== 'visible') { l = Math.max(l, ar.left); rr = Math.min(rr, ar.right) }
      if (cs.overflowY !== 'visible') { t = Math.max(t, ar.top); b = Math.min(b, ar.bottom) }
      if (cs.position === 'fixed') break
    }
    return { l, t, r: rr, b }
  }
  function onScreen(el) {
    const s = shownRect(el)
    return s.r - s.l > 0 && s.b - s.t > 0
  }

  for (const el of document.querySelectorAll('[data-inspect-issue]')) el.removeAttribute('data-inspect-issue')

  function add(kind, severity, el, detail, rect) {
    const ign = ignoredKinds(el)
    if (ign && (ign === '*' || ign.includes(kind))) return
    const path = pathOf(el)
    const key = kind + '|' + path
    if (seen.has(key)) return
    seen.add(key)
    // The tag lets the driver find the element again (to scroll it into view).
    const id = issues.length
    el.setAttribute('data-inspect-issue', (el.getAttribute('data-inspect-issue') || '') + ` ${id}`)
    issues.push({
      id, kind, severity, path, text: textOf(el), rect: r4(rect || el.getBoundingClientRect()),
      offscreen: !onScreen(el), detail,
    })
  }

  function visible(el) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 || r.height > 0
  }

  /** Elements a user reads or operates: controls, text holders, icons. */
  function isAtom(el) {
    if (el.matches(CONTROL)) return true
    if (el.tagName === 'svg' || el.classList.contains('bp5-icon')) return true
    return ownText(el) !== ''
  }

  /**
   * The part of el's rect left after the clipping ancestors, per axis.
   * An ancestor that scrolls on an axis ends the walk for that axis (content
   * scrolled out of view is reachable, not cut). Returns the clipped rect and
   * the ancestor that cut the most.
   */
  function clipInfo(el) {
    const r = el.getBoundingClientRect()
    let l = r.left, t = r.top, rr = r.right, b = r.bottom
    let doneX = false, doneY = false
    let clipper = null
    for (let a = el.parentElement; a && !(doneX && doneY); a = a.parentElement) {
      const cs = getComputedStyle(a)
      const ar = a.getBoundingClientRect()
      const clipX = cs.overflowX === 'hidden' || cs.overflowX === 'clip'
      const clipY = cs.overflowY === 'hidden' || cs.overflowY === 'clip'
      if (!doneX && clipX && (l < ar.left - TOL || rr > ar.right + TOL)) {
        l = Math.max(l, ar.left); rr = Math.min(rr, ar.right); clipper = clipper || a
      }
      if (!doneY && clipY && (t < ar.top - TOL || b > ar.bottom + TOL)) {
        t = Math.max(t, ar.top); b = Math.min(b, ar.bottom); clipper = clipper || a
      }
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') doneX = true
      if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') doneY = true
      if (cs.position === 'fixed') break
    }
    return { rect: r, clipped: { left: l, top: t, right: rr, bottom: b }, clipper }
  }

  function scrolledOut(el) {
    // Fully outside a scrolling ancestor: not on screen, but not broken.
    const r = el.getBoundingClientRect()
    for (let a = el.parentElement; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      const sx = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
      const sy = cs.overflowY === 'auto' || cs.overflowY === 'scroll'
      if (!sx && !sy) continue
      const ar = a.getBoundingClientRect()
      if ((sy && (r.bottom <= ar.top || r.top >= ar.bottom)) || (sx && (r.right <= ar.left || r.left >= ar.right))) return true
    }
    return false
  }

  const els = [root, ...root.querySelectorAll('*')].filter(
    (el) => !el.closest(IGNORE) && !(el instanceof SVGElement && el.tagName !== 'svg') && visible(el),
  )
  const atoms = els.filter(isAtom)

  // --- text that does not fit its own box ---
  for (const el of els) {
    if (el.matches('input,textarea,select')) continue
    if (!ownText(el)) continue
    const cs = getComputedStyle(el)
    if (cs.display.startsWith('inline') && cs.display !== 'inline-block' && cs.display !== 'inline-flex') continue
    const overX = el.scrollWidth > el.clientWidth + TOL && el.clientWidth > 0
    const overY = el.scrollHeight > el.clientHeight + TOL && el.clientHeight > 0
    if (!overX && !overY) continue
    const hidX = cs.overflowX === 'hidden' || cs.overflowX === 'clip'
    const hidY = cs.overflowY === 'hidden' || cs.overflowY === 'clip'
    const detail = { scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight }
    if (overX && hidX && cs.textOverflow === 'ellipsis') add('ellipsis', 'info', el, detail)
    else if ((overX && hidX) || (overY && hidY)) add('clipped-text', 'error', el, detail)
    else if ((overX && cs.overflowX === 'visible') || (overY && cs.overflowY === 'visible')) add('text-spill', 'warn', el, detail)
  }

  // --- text running out of its parent box (e.g. a wrapped title in a
  // fixed-height header): the parent does not clip, so it draws over the
  // neighbours instead ---
  for (const el of atoms) {
    if (!ownText(el) || el === root) continue
    let parent = el.parentElement
    while (parent && parent !== root && /^(inline|contents)/.test(getComputedStyle(parent).display)) parent = parent.parentElement
    if (!parent || !root.contains(parent)) continue
    const cs = getComputedStyle(el)
    if (cs.position === 'absolute' || cs.position === 'fixed') continue
    const pcs = getComputedStyle(parent)
    const r = el.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    const outX = pcs.overflowX === 'visible' && (r.left < pr.left - TOL || r.right > pr.right + TOL)
    const outY = pcs.overflowY === 'visible' && (r.top < pr.top - TOL || r.bottom > pr.bottom + TOL)
    if (outX || outY) {
      add('text-spill', 'warn', el, { parent: pathOf(parent), parentRect: r4(pr) })
    }
  }

  // --- atoms cut by a clipping ancestor, or off the window ---
  for (const el of atoms) {
    const { rect, clipped, clipper } = clipInfo(el)
    if (clipper) {
      const empty = clipped.right <= clipped.left || clipped.bottom <= clipped.top
      if (empty && scrolledOut(el)) continue
      // Report only the outermost cut atom: its descendants are cut with it.
      let anc = el.parentElement
      let covered = false
      for (; anc && anc !== root.parentElement; anc = anc.parentElement) {
        if (atoms.includes(anc) && seen.has('clipped|' + pathOf(anc))) { covered = true; break }
      }
      if (covered) continue
      add('clipped', empty ? 'warn' : 'error', el, {
        by: pathOf(clipper),
        visible: r4({ left: clipped.left, top: clipped.top, width: Math.max(0, clipped.right - clipped.left), height: Math.max(0, clipped.bottom - clipped.top) }),
      }, rect)
    }
    if (rect.right > vw + TOL || rect.bottom > vh + TOL || rect.left < -TOL || rect.top < -TOL) {
      if (!scrolledOut(el)) add('out-of-viewport', 'error', el, { viewport: { w: vw, h: vh } }, rect)
    }
  }

  // --- collapsed atoms (in the layout but zero-sized on one axis) ---
  for (const el of atoms) {
    const r = el.getBoundingClientRect()
    if ((r.width < 1 || r.height < 1) && (el.matches(CONTROL) || ownText(el))) add('collapsed', 'warn', el, {})
  }

  // --- overlapping atoms (neither inside the other, both in normal flow) ---
  function positioned(el, stop) {
    for (let a = el; a && a !== stop; a = a.parentElement) {
      const p = getComputedStyle(a).position
      if (p === 'absolute' || p === 'fixed' || p === 'sticky') return true
    }
    return false
  }
  // What is actually on screen: content scrolled under a header is not
  // overlapping it.
  const boxes = atoms.map((el) => ({ el, ...shownRect(el) }))
  for (let i = 0; i < boxes.length; i++) {
    const A = boxes[i]
    for (let j = i + 1; j < boxes.length; j++) {
      const B = boxes[j]
      const w = Math.min(A.r, B.r) - Math.max(A.l, B.l)
      const h = Math.min(A.b, B.b) - Math.max(A.t, B.t)
      if (w <= TOL || h <= TOL) continue
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue
      let common = A.el.parentElement
      while (common && !common.contains(B.el)) common = common.parentElement
      if (positioned(A.el, common) || positioned(B.el, common)) continue
      add('overlap', 'error', A.el, { with: pathOf(B.el), withText: textOf(B.el), area: Math.round(w * h) })
    }
  }

  // --- size tokens: a rule that sets (min-)height from a size token ---
  // Elements are audited when a control-size token rule (--field-*, --row-h,
  // ...) matches them; any token-valued height rule that also matches them
  // (a kit's own compact variant, e.g. --icon-md) counts as an allowed value.
  const TOKEN_RE = /var\(\s*(--[\w-]+)\s*\)/
  const SIZE_TOKEN_RE = /^--(?:field|form|row|ctrl|panel-header)/
  const sizeRules = []
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    const walk = (list) => {
      for (const rule of list) {
        if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules); continue }
        if (!rule.selectorText || !rule.style) continue
        for (const prop of ['height', 'min-height']) {
          const m = TOKEN_RE.exec(rule.style.getPropertyValue(prop))
          if (m && rule.style.getPropertyValue(prop).trim().startsWith('var(')) {
            sizeRules.push({ selector: rule.selectorText, prop, token: m[1] })
          }
        }
      }
    }
    walk(rules)
  }
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;width:0;padding:0;border:0;box-sizing:border-box'
  const tokenPx = (el, token) => {
    el.parentElement.appendChild(probe)
    probe.style.height = `var(${token})`
    const px = probe.getBoundingClientRect().height
    probe.remove()
    return px
  }
  const expect = new Map()
  for (const rule of sizeRules) {
    let matched
    try { matched = root.querySelectorAll(rule.selector) } catch { continue }
    for (const el of matched) {
      if (!els.includes(el) || !el.parentElement) continue
      if (!expect.has(el)) expect.set(el, [])
      expect.get(el).push(rule)
    }
  }
  for (const [el, rules] of expect) {
    if (!rules.some((r) => SIZE_TOKEN_RE.test(r.token))) continue
    const cs = getComputedStyle(el)
    if (cs.display.startsWith('inline') && cs.display !== 'inline-block' && cs.display !== 'inline-flex') continue
    const actual = parseFloat(cs.height)
    if (!Number.isFinite(actual)) continue
    const fixed = rules.filter((r) => r.prop === 'height')
    const mins = rules.filter((r) => r.prop === 'min-height')
    if (fixed.length) {
      const want = fixed.map((r) => ({ token: r.token, px: tokenPx(el, r.token) }))
      if (!want.some((w) => Math.abs(w.px - actual) <= 0.5)) {
        add('size-mismatch', 'error', el, { actual, expected: want, rule: fixed.map((r) => r.selector) })
      }
    } else if (mins.length) {
      const want = mins.map((r) => ({ token: r.token, px: tokenPx(el, r.token) }))
      // Only reachable through a later rule lowering min-height, which a
      // shared stylesheet does on purpose in places (dialog checkboxes):
      // reported for reference, not flagged.
      if (want.every((w) => actual < w.px - 0.5)) {
        add('min-size-override', 'info', el, {
          actual, expectedMin: want, computedMinHeight: cs.minHeight, rule: mins.map((r) => r.selector),
        })
      }
    }
  }

  // --- horizontal scrollbars on the root or any scroller inside it ---
  for (const el of els) {
    const cs = getComputedStyle(el)
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + TOL) {
      add('h-scroll', 'warn', el, { scrollW: el.scrollWidth, clientW: el.clientWidth })
    }
  }

  return { root: r4(root.getBoundingClientRect()), issues }
}
