/**
 * @file __test__/menuPipelineExhaustiveness.test.ts
 * @description Step0 structural guard for the menu pipeline refactor (theme T6).
 *
 * The 4-table menu pipeline (menuTemplate ipcChannels -> menu.ts delivery
 * routing -> useElectronIpc MENU_PASS_THROUGH -> useMenuDispatch switch) has no
 * single type-contract map. Before introducing one, this test pins the
 * observable invariants the refactor must preserve so an accidental drop /
 * rename is caught:
 *
 *   (a) EXHAUSTIVENESS: every menuTemplate ipcChannel is either dispatch-handled
 *       OR explicitly listed as genuinely-unimplemented. A new template channel
 *       with no handler and no allowlist entry fails here.
 *   (b) STATE-ID SUBSET: every menu-item id that menuStateApply writes to exists
 *       in the menuTemplate (so a renderer state push targets a real item).
 *   (c) DELIVERY-ROUTING SNAPSHOT: the current dedicated-vs-generic delivery
 *       choice (main process) and the MENU_PASS_THROUGH receiver list, captured
 *       byte-identically so a later map-derived computation can be checked
 *       against it.
 *
 * These are wire-contract assertions (channel names, routing, ids) -- not
 * internal structure -- so they survive a const-source swap (Step1) and a
 * switch -> table refactor (Step3).
 */
import { describe, it, expect } from 'vitest'
import { IPC } from '../../shared/ipcChannels'
import { APP_MENU } from '../../shared/menuTemplate'
import type { AppMenuItem } from '../../shared/menuTemplate'
import {
  MENU_ACTION_MAP,
  DEDICATED_DIRECT_CHANNELS,
  GENERIC_RELAY_CHANNELS,
  MENU_PASS_THROUGH_CHANNELS,
  isMenuActionChannel,
  isUnimplementedMenuAction,
  type MenuActionChannel,
} from '../../shared/menuActionMap'

/** Collect every ipcChannel string reachable in the APP_MENU tree. */
function collectTemplateChannels(): Set<string> {
  const channels = new Set<string>()
  const walk = (items: AppMenuItem[]) => {
    for (const item of items) {
      if (item.ipcChannel) channels.add(item.ipcChannel)
      if (item.submenu) walk(item.submenu)
    }
  }
  for (const group of APP_MENU) walk(group.submenu)
  return channels
}

/**
 * Channels that useMenuDispatch's switch turns into a command dispatch or a
 * direct side-effect (recent-clear / select-all). Snapshot of the current
 * `case` labels -- the literal strings are pinned so a rename is detected.
 */
const DISPATCH_HANDLED: ReadonlySet<string> = new Set<string>([
  IPC.MENU_OPEN_FILE,
  IPC.MENU_SAVE,
  IPC.MENU_SAVE_SCENE_AS,
  IPC.MENU_NEW_TAB,
  IPC.MENU_CLOSE_TAB,
  IPC.MENU_UNDO,
  IPC.MENU_REDO,
  IPC.MENU_NEW_SCENE,
  IPC.MENU_OPEN_SCENE,
  IPC.MENU_VIEW_PERSPECTIVE,
  IPC.MENU_VIEW_ORTHOGRAPHIC,
  IPC.MENU_CENTER_MARK_CROSS,
  IPC.MENU_CENTER_MARK_AXIS,
  IPC.MENU_CENTER_MARK_NONE,
  IPC.MENU_BG_WHITE,
  IPC.MENU_BG_BLACK,
  IPC.MENU_COLOR_PROOF,
  IPC.MENU_SCENE_PROPS,
  IPC.MENU_ABOUT,
  IPC.MENU_GET_PDB,
  'menu:change-chain-id',
  'menu:delete-mol-atoms',
  'menu:change-resid-num',
  'menu:merge-mol',
  'menu:reassign-2ndry',
  'menu:mol-superpose',
  'menu:mol-surf',
  'menu:interaction',
  'menu:surf-cutter',
  IPC.MENU_APBS,
  'menu:pov-render',
  'menu:clear-recent',
  'menu:save-file-as',
  'menu:save-current-view',
  'menu:export-png',
  'menu:export-umbreon',
  'menu:export-pov',
  'menu:export-stl',
  'menu:export-mqo',
  'menu:reload-scene',
  'menu:view-props',
  'menu:select-all',
])

/**
 * Channels present in the template purely as not-yet-implemented placeholders.
 * useMenuDispatch hits its `default: console.warn(...)` branch for these. They
 * MUST stay in the template (UXP parity) -- this list distinguishes an
 * intentional placeholder from an accidental typo.
 */
const UNIMPLEMENTED_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  'menu:clear-undo',
  'menu:options',
  'menu:morph-anim',
  'menu:exec-script',
  'menu:perf-meas',
])

describe('menu pipeline -- exhaustiveness', () => {
  it('every template ipcChannel is dispatch-handled or explicitly unimplemented', () => {
    const templateChannels = collectTemplateChannels()
    const uncovered: string[] = []
    for (const ch of templateChannels) {
      if (!DISPATCH_HANDLED.has(ch) && !UNIMPLEMENTED_ALLOWLIST.has(ch)) {
        uncovered.push(ch)
      }
    }
    expect(uncovered).toEqual([])
  })

  it('the unimplemented allowlist has exactly 5 entries (not-yet-ported placeholders)', () => {
    expect(UNIMPLEMENTED_ALLOWLIST.size).toBe(5)
  })

  it('no allowlisted channel is also dispatch-handled (the two sets are disjoint)', () => {
    const overlap = [...UNIMPLEMENTED_ALLOWLIST].filter((ch) => DISPATCH_HANDLED.has(ch))
    expect(overlap).toEqual([])
  })
})

describe('menu pipeline -- menuStateApply id subset', () => {
  /**
   * The 14 menu-item ids that applyMenuStateTo writes to. Kept in sync with
   * shared/menuStateApply.ts by inspection (the view/scene ids are not exported;
   * the export ids come from SCENE_EXPORT_MENU_EXPORTERS, gated via `visible`).
   */
  const STATE_IDS: readonly string[] = [
    'view-perspective',
    'view-orthographic',
    'center-mark-none',
    'center-mark-cross',
    'center-mark-axis',
    'bg-white',
    'bg-black',
    'undo',
    'redo',
    'export-png',
    'export-umbreon',
    'export-pov',
    'export-stl',
    'export-mqo',
  ]

  it('every state-applied id exists as a menu item id in the template', () => {
    const templateIds = new Set<string>()
    const walk = (items: AppMenuItem[]) => {
      for (const item of items) {
        if (item.id) templateIds.add(item.id)
        if (item.submenu) walk(item.submenu)
      }
    }
    for (const group of APP_MENU) walk(group.submenu)

    const missing = STATE_IDS.filter((id) => !templateIds.has(id))
    expect(missing).toEqual([])
  })
})

describe('menu pipeline -- delivery routing snapshot', () => {
  /**
   * Channels delivered through a DEDICATED main-process click handler
   * (buildSpecificHandlers in main/menu.ts), as opposed to the MENU_GENERIC
   * fallback. Two sub-shapes exist and the asymmetry is load-bearing:
   *   - direct: handler does `send(channel)`     -> received by MENU_PASS_THROUGH
   *   - generic-relay: handler does `send(MENU_GENERIC, channel)` (Perspective /
   *     Orthographic) -> received by the MENU_GENERIC listener
   */
  const DEDICATED_DIRECT: readonly string[] = [
    IPC.MENU_OPEN_FILE,
    IPC.MENU_SAVE,
    IPC.MENU_NEW_TAB,
    IPC.MENU_CLOSE_TAB,
    IPC.MENU_UNDO,
    IPC.MENU_REDO,
    IPC.MENU_NEW_SCENE,
    IPC.MENU_OPEN_SCENE,
  ]
  const DEDICATED_GENERIC_RELAY: readonly string[] = [
    IPC.MENU_VIEW_PERSPECTIVE,
    IPC.MENU_VIEW_ORTHOGRAPHIC,
  ]

  it('MENU_PASS_THROUGH receiver list equals the dedicated-direct delivery set', () => {
    // This is the renderer half: useElectronIpc subscribes each of these as a
    // bare push channel forwarded into dispatchMenuChannel. It must equal the
    // main-process dedicated-direct send set (same channel, no payload).
    expect([...DEDICATED_DIRECT].sort()).toEqual(
      [
        IPC.MENU_NEW_TAB,
        IPC.MENU_CLOSE_TAB,
        IPC.MENU_SAVE,
        IPC.MENU_NEW_SCENE,
        IPC.MENU_OPEN_FILE,
        IPC.MENU_OPEN_SCENE,
        IPC.MENU_UNDO,
        IPC.MENU_REDO,
      ].sort(),
    )
  })

  it('Perspective / Orthographic are delivered via a generic relay, not direct', () => {
    expect([...DEDICATED_GENERIC_RELAY].sort()).toEqual(
      [IPC.MENU_VIEW_PERSPECTIVE, IPC.MENU_VIEW_ORTHOGRAPHIC].sort(),
    )
    // They must NOT appear in the direct (pass-through) set.
    for (const ch of DEDICATED_GENERIC_RELAY) {
      expect(DEDICATED_DIRECT).not.toContain(ch)
    }
  })

  // --- Step2: derived sets must be byte-identical to the snapshot above ---
  it('menuActionMap derives DEDICATED_DIRECT byte-identical to the snapshot', () => {
    expect([...DEDICATED_DIRECT_CHANNELS].sort()).toEqual([...DEDICATED_DIRECT].sort())
  })

  it('menuActionMap derives GENERIC_RELAY byte-identical to the snapshot', () => {
    expect([...GENERIC_RELAY_CHANNELS].sort()).toEqual([...DEDICATED_GENERIC_RELAY].sort())
  })

  it('MENU_PASS_THROUGH_CHANNELS equals the dedicated-direct set', () => {
    expect([...MENU_PASS_THROUGH_CHANNELS].sort()).toEqual([...DEDICATED_DIRECT].sort())
  })
})

describe('menuActionMap -- coverage vs template + dispatch', () => {
  it('every template ipcChannel is a key in MENU_ACTION_MAP', () => {
    const templateChannels = collectTemplateChannels()
    const missing = [...templateChannels].filter((ch) => !isMenuActionChannel(ch))
    expect(missing).toEqual([])
  })

  it('the map adds exactly one non-template channel: MENU_NEW_SCENE (dedicated, no menu item)', () => {
    const templateChannels = collectTemplateChannels()
    const extra = (Object.keys(MENU_ACTION_MAP) as MenuActionChannel[]).filter(
      (ch) => !templateChannels.has(ch),
    )
    expect(extra).toEqual([IPC.MENU_NEW_SCENE])
  })

  it('the unimplemented entries in the map match the allowlist exactly', () => {
    const mapUnimplemented = (Object.keys(MENU_ACTION_MAP) as MenuActionChannel[])
      .filter((ch) => isUnimplementedMenuAction(ch))
      .sort()
    expect(mapUnimplemented).toEqual([...UNIMPLEMENTED_ALLOWLIST].sort())
  })
})
