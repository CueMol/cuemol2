/**
 * @file main/contextMenu/sceneCtxItems.ts
 * @description Leaf item / submenu builders for the scene-tree native
 * context menu. Each builder is a pure function returning Electron
 * `MenuItemConstructorOptions` (or an array of them, for gated items
 * that may be absent). Extracted from `sceneContextMenu.ts`, which keeps
 * the entry point, the per-node-type `buildTemplate` switch, and the
 * camera / style node builders.
 *
 * The shared `SceneCtxActionFn` records the chosen `SceneCtxAction` in a
 * closure slot — see `sceneContextMenu.ts` for the popup-callback
 * contract.
 */

import type { MenuItemConstructorOptions } from 'electron'
import type {
    RendColoringId,
    SceneCtxAction,
    SceneCtxMenuPayload,
    SceneCtxNodeType,
} from '../../shared/ipcTypes'

export type SceneCtxActionFn = (a: SceneCtxAction) => MenuItemConstructorOptions['click']

export function showHideItems(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    if (!payload.hasVisibility) return []
    if (payload.isVisible) {
        return [{ label: 'Hide', click: action({ kind: 'hide' }) }]
    }
    return [{ label: 'Show', click: action({ kind: 'show' }) }]
}

export function renameItem(action: SceneCtxActionFn): MenuItemConstructorOptions {
    return { label: 'Rename…', click: action({ kind: 'rename' }) }
}

export function deleteItem(action: SceneCtxActionFn): MenuItemConstructorOptions {
    return { label: 'Delete', click: action({ kind: 'delete' }) }
}

export function propertyItem(action: SceneCtxActionFn): MenuItemConstructorOptions {
    return { label: 'Properties…', click: action({ kind: 'property' }) }
}

export function copyItem(action: SceneCtxActionFn): MenuItemConstructorOptions {
    return { label: 'Copy', click: action({ kind: 'copy' }) }
}

/**
 * Paste menu item — only shown when the worker clipboard holds the
 * matching kind. Scene rows accept object pastes; object rows accept
 * renderer pastes.
 */
export function pasteItem(
    payload: SceneCtxMenuPayload,
    expectedKind: 'object' | 'renderer' | 'style' | 'camera',
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    if (payload.clipboardKind !== expectedKind) return []
    const label =
        expectedKind === 'object'
            ? 'Paste Object'
            : expectedKind === 'style'
              ? 'Paste Style'
              : expectedKind === 'camera'
                ? 'Paste Camera'
                : 'Paste Renderer'
    return [{ label, click: action({ kind: 'paste' }) }]
}

/**
 * Renderer Coloring submenu (Phase 3c).
 *
 * Static items (Phase 3c-1) plus dynamic Paint (Secondary str.) sub-submenu
 * (Phase 3c-2) populated from `payload.paintStyles`. Layout mirrors UXP
 * `wspcPanelRendColMenu`. Hidden entirely for renderer types that don't
 * support a `coloring` property — main process trusts the
 * renderer-supplied `supportsColoring` flag.
 */
export function coloringSubmenu(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    if (!payload.supportsColoring) return []
    const item = (label: string, coloringId: RendColoringId): MenuItemConstructorOptions => ({
        label,
        click: action({ kind: 'setRendColoring', coloringId }),
    })
    const submenu: MenuItemConstructorOptions[] = []
    const paintStyles = payload.paintStyles ?? []
    if (paintStyles.length > 0) {
        submenu.push({
            label: 'Paint (Secondary str.)',
            submenu: paintStyles.map((s) => ({
                label: s.label,
                click: action({ kind: 'setRendColoring', coloringId: `style-${s.name}` }),
            })),
        })
        submenu.push({ type: 'separator' })
    }
    submenu.push(
        item('CPK molcol', 'style-DefaultCPKColoring'),
        item('CPK dark gray', 'style-DarkCPKColoring'),
        item('CPK light gray', 'style-LightCPKColoring'),
        { type: 'separator' },
        item('B-factor', 'paint-type-bfac'),
        item('Rainbow', 'paint-type-rainbow'),
    )
    return [{ label: 'Coloring', submenu }]
}

/**
 * Renderer Paint color-picker submenu (Phase 3c-3a).
 *
 * Static replica of UXP `color-menu.xul` — eight color-family
 * sub-submenus with brightness / saturation variations. Gated by
 * `payload.canPaint` so the submenu only appears when the renderer's
 * coloring is `PaintColoring` and the parent mol has a non-empty
 * selection (UXP `checkPaintColoring` semantics).
 */
export function paintSubmenu(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    if (!payload.canPaint) return []
    return [{ label: 'Paint', submenu: buildPaintFamilyMenus(action) }]
}

interface PaintFamily {
    label: string
    items: { label: string; value: string }[]
}

const PAINT_FAMILIES: PaintFamily[] = [
    {
        label: 'Monochrome',
        items: [
            { label: 'White', value: '#FFF' },
            { label: '75% Gray', value: 'rgb(0.75,0.75,0.75)' },
            { label: '50% Gray', value: 'rgb(0.5,0.5,0.5)' },
            { label: '25% Gray', value: 'rgb(0.25,0.25,0.25)' },
            { label: 'Black', value: '#000' },
        ],
    },
    ...(['Red', 0, 'Orange', 30, 'Yellow', 60, 'Green', 120,
        'Cyan', 180, 'Blue', 240, 'Purple', 300] as const)
        .reduce<PaintFamily[]>((acc, _, i, arr) => {
            if (i % 2 !== 0) return acc
            const label = arr[i] as string
            const hue = arr[i + 1] as number
            acc.push({
                label,
                items: [
                    { label, value: `hsb(${hue}, 1.0, 1.0)` },
                    { label: `${label}, sat 25%`, value: `hsb(${hue}, 0.25, 1.0)` },
                    { label: `${label}, sat 50%`, value: `hsb(${hue}, 0.5, 1.0)` },
                    { label: `${label}, sat 75%`, value: `hsb(${hue}, 0.75, 1.0)` },
                    { label: `${label}, bri 75%`, value: `hsb(${hue}, 1.0, 0.75)` },
                    { label: `${label}, bri 50%`, value: `hsb(${hue}, 1.0, 0.50)` },
                    { label: `${label}, bri 25%`, value: `hsb(${hue}, 1.0, 0.25)` },
                ],
            })
            return acc
        }, []),
]

function buildPaintFamilyMenus(action: SceneCtxActionFn): MenuItemConstructorOptions[] {
    return PAINT_FAMILIES.map(({ label, items }) => ({
        label,
        submenu: items.map((it) => ({
            label: it.label,
            click: action({ kind: 'paintRend', colorValue: it.value }),
        })),
    }))
}

/**
 * Renderer Style (shape) submenu (Phase 3c-3b).
 *
 * Two groups separated by a separator, populated from
 * `payload.rendStyle.{typeStyles, edgeStyles}`. Each item dispatches
 * `applyRendStyle` with the style name plus the regex pattern used to
 * strip pre-existing entries. The submenu disappears entirely when both
 * groups are empty.
 */
export function styleSubmenu(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    const rs = payload.rendStyle
    if (!rs) return []
    const typeStyles = rs.typeStyles ?? []
    const edgeStyles = rs.edgeStyles ?? []
    if (typeStyles.length === 0 && edgeStyles.length === 0) return []

    const submenu: MenuItemConstructorOptions[] = []
    for (const s of typeStyles) {
        submenu.push({
            label: s.label,
            click: action({
                kind: 'applyRendStyle',
                styleName: s.name,
                pattern: s.pattern,
                flags: s.flags,
            }),
        })
    }
    if (typeStyles.length > 0 && edgeStyles.length > 0) {
        submenu.push({ type: 'separator' })
    }
    for (const s of edgeStyles) {
        submenu.push({
            label: s.label,
            click: action({
                kind: 'applyRendStyle',
                styleName: s.name,
                pattern: s.pattern,
                flags: s.flags,
            }),
        })
    }
    return [{ label: 'Style', submenu }]
}

/**
 * Scene-row Background color submenu. UXP only exposes White / Black
 * presets here. Radio state reflects `payload.bgColor`.
 */
export function bgColorSubmenu(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions {
    const current = payload.bgColor ?? 'other'
    return {
        label: 'Background color',
        submenu: [
            {
                label: 'White',
                type: 'radio',
                checked: current === 'white',
                click: action({ kind: 'setSceneBgColor', color: 'white' }),
            },
            {
                label: 'Black',
                type: 'radio',
                checked: current === 'black',
                click: action({ kind: 'setSceneBgColor', color: 'black' }),
            },
        ],
    }
}

/**
 * "Use color proofing" checkbox item. Combined-gate display matches UXP
 * `onSceneMenuShowing`: checked iff `use_colproof && icc_filename !== ""`.
 */
export function colorProofingItem(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions {
    return {
        label: 'Use color proofing',
        type: 'checkbox',
        checked: payload.colorProofingEnabled === true,
        click: action({ kind: 'toggleColorProofing' }),
    }
}

/**
 * Renderer-row "Change sel" submenu. Mirrors UXP `wspcPanelRendSelMenu`.
 * Hidden for the `*selection` renderer (controlled by
 * `payload.supportsChangeSel`).
 */
export function changeSelSubmenu(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    if (!payload.supportsChangeSel) return []
    const item = (
        label: string,
        selKind: 'current' | 'all' | 'protein' | 'nucleic' | 'water' | 'ligand' | 'sugar',
    ): MenuItemConstructorOptions => ({
        label,
        click: action({ kind: 'setRendSel', selKind }),
    })
    return [{
        label: 'Change sel',
        submenu: [
            item('Current', 'current'),
            item('All', 'all'),
            { type: 'separator' },
            item('Protein', 'protein'),
            item('Nucleic acid', 'nucleic'),
            item('Water', 'water'),
            item('Ligand', 'ligand'),
            item('Sugar', 'sugar'),
        ],
    }]
}

/**
 * Renderer "Change type" submenu (Phase 6b). Populated from
 * `payload.rendChangeTypes`. Hidden when the list is empty — that doubles
 * as the visibility gate since the worker filters synthetic / current-type
 * entries out.
 */
export function changeTypeSubmenu(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    const types = payload.rendChangeTypes
    if (!types || types.length === 0) return []
    return [{
        label: 'Change type',
        submenu: types.map((name) => ({
            label: name,
            click: action({ kind: 'changeRendType', typeName: name }),
        })),
    }]
}

/**
 * "Generate surface obj" item. Visible only for isosurf renderers
 * (mirrors UXP `gensurfitem.hidden` gate driven by `checkRend("isosurf")`).
 */
export function generateSurfObjItem(
    payload: SceneCtxMenuPayload,
    action: SceneCtxActionFn,
): MenuItemConstructorOptions[] {
    if (!payload.canGenSurfObj) return []
    return [{
        label: 'Generate surface obj',
        click: action({ kind: 'generateSurfObj' }),
    }]
}

/**
 * Object-row "New Group..." item — creates an empty `*group` renderer
 * under the targeted mol. Mirrors UXP `wspcPanelObjCtxtMenu` New Group.
 */
export function newRendGroupItem(action: SceneCtxActionFn): MenuItemConstructorOptions {
    return { label: 'New Group…', click: action({ kind: 'newRendGroup' }) }
}

/**
 * "New Renderer..." item on object / renderer / rendGroup rows. The
 * renderer side resolves the target obj + (optional) group name from the
 * clicked row (UXP `onNewCmd`), shows the shared NewRendererDialog, and
 * dispatches `createRendererOnObject`.
 */
export function newRendererItem(action: SceneCtxActionFn): MenuItemConstructorOptions {
    return { label: 'New Renderer…', click: action({ kind: 'newRenderer' }) }
}

export function selectionSubmenu(action: SceneCtxActionFn): MenuItemConstructorOptions {
    const aroundItem = (
        label: string,
        selectKind:
            | 'around3' | 'around5' | 'around7' | 'around10'
            | 'aroundByres3' | 'aroundByres5' | 'aroundByres7',
    ): MenuItemConstructorOptions => ({
        label,
        click: action({ kind: 'selectMol', selectKind }),
    })
    return {
        label: 'Selection',
        submenu: [
            { label: 'All', click: action({ kind: 'selectMol', selectKind: 'all' }) },
            { label: 'Unselect', click: action({ kind: 'selectMol', selectKind: 'unselect' }) },
            { label: 'Invert', click: action({ kind: 'selectMol', selectKind: 'invert' }) },
            { type: 'separator' },
            { label: 'Protein', click: action({ kind: 'selectMol', selectKind: 'protein' }) },
            { label: 'Nucleic', click: action({ kind: 'selectMol', selectKind: 'nucleic' }) },
            { label: 'Water', click: action({ kind: 'selectMol', selectKind: 'water' }) },
            { label: 'Sugar', click: action({ kind: 'selectMol', selectKind: 'sugar' }) },
            { label: 'Hydrogen', click: action({ kind: 'selectMol', selectKind: 'hydrogen' }) },
            { type: 'separator' },
            { label: 'Toggle Sidechain', click: action({ kind: 'selectMol', selectKind: 'sidechain' }) },
            { type: 'separator' },
            {
                label: 'Around',
                submenu: [
                    aroundItem('3 Å', 'around3'),
                    aroundItem('5 Å', 'around5'),
                    aroundItem('7 Å', 'around7'),
                    aroundItem('10 Å', 'around10'),
                ],
            },
            {
                label: 'Around (byres)',
                submenu: [
                    aroundItem('3 Å', 'aroundByres3'),
                    aroundItem('5 Å', 'aroundByres5'),
                    aroundItem('7 Å', 'aroundByres7'),
                ],
            },
        ],
    }
}

export function nodeTypeLabel(nodeType: SceneCtxNodeType): string {
    switch (nodeType) {
        case 'scene': return 'Scene'
        case 'object': return 'Object'
        case 'renderer': return 'Renderer'
        case 'rendGroup': return 'Renderer Group'
        case 'cameraRoot': return 'Cameras'
        case 'styleRoot': return 'Styles'
        case 'camera': return 'Camera'
        case 'style': return 'Style'
        default: return ''
    }
}
