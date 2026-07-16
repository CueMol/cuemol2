/**
 * Degrade-detection tests for the clipboard menu plumbing.
 *
 * Three contracts are pinned:
 *
 * 1. APP_MENU's Edit group carries cut/copy/paste as *pure role* items (no
 *    ipcChannel) so main/menu.ts delegates them natively to Electron -- without
 *    these on macOS Cmd+C/X/V are not delivered and clipboard fails app-wide.
 *
 * 2. Select All is NOT a native role (that selects the whole document); it is
 *    an ipcChannel item ('menu:select-all') routed to the renderer's scoped
 *    selectAllInScope.
 *
 * 3. buildTextContextMenuTemplate's branch behaviour, including the
 *    "non-editable + no selection -> empty template" gate that stops the
 *    generic right-click menu from colliding with the scene-tree / navi
 *    context menus, and that Select All uses the scoped callback not a role.
 */

import { describe, it, expect, vi } from 'vitest'
import { APP_MENU, type AppMenuItem } from '../../shared/menuTemplate'
import { buildTextCtxMenuNodes } from '../../shared/textCtxMenu'
import { isSeparatorNode } from '../../shared/menuNodes'

// textContextMenu.ts imports `Menu` from electron at module load; mock it so the
// pure template builder can be exercised under jsdom without a real Electron.
vi.mock('electron', () => ({ Menu: { buildFromTemplate: vi.fn() } }))

const { buildTextContextMenuTemplate } = await import('../../main/textContextMenu')

function editItem(id: string): AppMenuItem | undefined {
  const edit = APP_MENU.find((g) => g.label === 'Edit')
  return edit?.submenu.find((i) => i.id === id)
}

describe('APP_MENU Edit clipboard items', () => {
  it.each([
    ['cut', 'cut'],
    ['copy', 'copy'],
    ['paste', 'paste'],
  ])('%s is a pure role item delegated to Electron', (id, role) => {
    const item = editItem(id)
    expect(item).toBeDefined()
    expect(item?.role).toBe(role)
    // No ipcChannel -> main/menu.ts hands it to Electron natively.
    expect(item?.ipcChannel).toBeUndefined()
  })

  it('select-all is a scoped ipcChannel item, not a native role', () => {
    const item = editItem('select-all')
    expect(item).toBeDefined()
    expect(item?.role).toBeUndefined()
    expect(item?.ipcChannel).toBe('menu:select-all')
    expect(item?.accelerator).toBe('CmdOrCtrl+A')
  })
})

const ALL_TRUE = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }

describe('buildTextContextMenuTemplate', () => {
  it('editable field: cut/copy/paste + select all, enabled per editFlags', () => {
    const onSelectAll = vi.fn()
    const t = buildTextContextMenuTemplate(
      {
        isEditable: true,
        selectionText: '',
        editFlags: { canCut: true, canCopy: true, canPaste: false, canSelectAll: true },
      },
      onSelectAll,
    )
    expect(t.map((i) => i.role ?? i.type ?? i.label)).toEqual([
      'cut',
      'copy',
      'paste',
      'separator',
      'Select All',
    ])
    expect(t.find((i) => i.role === 'paste')?.enabled).toBe(false)
    expect(t.find((i) => i.role === 'cut')?.enabled).toBe(true)
  })

  it('Select All uses the scoped callback, not a native role', () => {
    const onSelectAll = vi.fn()
    const t = buildTextContextMenuTemplate(
      { isEditable: true, selectionText: '', editFlags: ALL_TRUE },
      onSelectAll,
    )
    const selectAll = t.find((i) => i.label === 'Select All')
    expect(selectAll?.role).toBeUndefined()
    selectAll?.click?.(undefined as never, undefined as never, undefined as never)
    expect(onSelectAll).toHaveBeenCalledOnce()
  })

  it('non-editable with selected text: copy + select all only (no cut/paste)', () => {
    const t = buildTextContextMenuTemplate(
      { isEditable: false, selectionText: 'hello', editFlags: ALL_TRUE },
      vi.fn(),
    )
    expect(t.map((i) => i.role ?? i.type ?? i.label)).toEqual(['copy', 'separator', 'Select All'])
    expect(t.some((i) => i.role === 'cut')).toBe(false)
    expect(t.some((i) => i.role === 'paste')).toBe(false)
  })

  it('non-editable with no selection: empty template (gate for scene-tree / canvas)', () => {
    const t = buildTextContextMenuTemplate(
      { isEditable: false, selectionText: '   ', editFlags: ALL_TRUE },
      vi.fn(),
    )
    expect(t).toEqual([])
  })
})

// The Windows/Linux React path renders shared MenuNodes instead of native
// roles; pin that its branch gating mirrors buildTextContextMenuTemplate,
// especially the empty gate that also guards the main->renderer push.
describe('buildTextCtxMenuNodes (win/linux React path)', () => {
  const labelsOf = (nodes: ReturnType<typeof buildTextCtxMenuNodes>) =>
    nodes.map((n) => (isSeparatorNode(n) ? 'separator' : n.label))

  it('editable field: cut/copy/paste + select all, enabled per editFlags', () => {
    const nodes = buildTextCtxMenuNodes({
      isEditable: true,
      selectionText: '',
      editFlags: { canCut: true, canCopy: true, canPaste: false, canSelectAll: true },
    })
    expect(labelsOf(nodes)).toEqual(['Cut', 'Copy', 'Paste', 'separator', 'Select All'])
    const paste = nodes.find((n) => !isSeparatorNode(n) && n.label === 'Paste')
    expect(paste && !isSeparatorNode(paste) ? paste.enabled : undefined).toBe(false)
    const paste2 = nodes.find((n) => !isSeparatorNode(n) && n.label === 'Cut')
    expect(paste2 && !isSeparatorNode(paste2) ? paste2.enabled : undefined).toBe(true)
  })

  it('non-editable with selected text: copy + select all only', () => {
    const nodes = buildTextCtxMenuNodes({
      isEditable: false, selectionText: 'hello', editFlags: ALL_TRUE,
    })
    expect(labelsOf(nodes)).toEqual(['Copy', 'separator', 'Select All'])
  })

  it('non-editable with no selection: empty (gate for scene-tree / canvas)', () => {
    const nodes = buildTextCtxMenuNodes({
      isEditable: false, selectionText: '   ', editFlags: ALL_TRUE,
    })
    expect(nodes).toEqual([])
  })
})
