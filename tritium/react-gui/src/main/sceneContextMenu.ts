import { Menu } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import type {
    RendColoringId,
    SceneCtxAction,
    SceneCtxMenuPayload,
    SceneCtxNodeType,
} from '../shared/ipcTypes'

/**
 * Native context menu shown when the user right-clicks a row in `ScenePane`.
 *
 * Action contract: each menu item's `click` handler stores a discriminated
 * `SceneCtxAction` payload in a closure-captured `chosen` slot. Electron
 * fires `click` **before** the menu's `callback`, so by the time the
 * Promise resolves, `chosen` holds the action (or null for dismiss).
 * Mirrors the dispatch pattern in `main/naviContextMenu.ts`.
 *
 * Phase coverage:
 *   - 3a: Show/Hide, Rename, Delete, Properties (common items)
 *   - 3b: Selection submenu on object nodes
 *   - 3c (current): static Coloring submenu on renderer nodes
 */
export function showSceneContextMenu(
    mainWindow: BrowserWindow,
    payload: SceneCtxMenuPayload,
): Promise<SceneCtxAction | null> {
    return new Promise((resolve) => {
        let chosen: SceneCtxAction | null = null

        const action =
            (a: SceneCtxAction): MenuItemConstructorOptions['click'] =>
            () => {
                chosen = a
            }

        const template = buildTemplate(payload, action)
        const menu = Menu.buildFromTemplate(template)
        menu.popup({
            window: mainWindow,
            x: Math.round(payload.x),
            y: Math.round(payload.y),
            callback: () => resolve(chosen),
        })
    })
}

function buildTemplate(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
    // Phase 4c: when multiple nodes are selected, the multi menu wins
    // and the type-specific branches below are bypassed. UXP equivalent:
    // `wspcPanelMulCtxtMenu` (workspace_panel.xul).
    const multi = payload.multiNodeIds ?? []
    if (multi.length > 1) {
        return [
            { label: `${multi.length} items selected`, enabled: false },
            { type: 'separator' },
            { label: 'Show', click: action({ kind: 'multiShow' }) },
            { label: 'Hide', click: action({ kind: 'multiHide' }) },
            { type: 'separator' },
            { label: 'Delete', click: action({ kind: 'multiDelete' }) },
        ]
    }

    const header: MenuItemConstructorOptions[] = [
        { label: payload.nodeLabel || nodeTypeLabel(payload.nodeType), enabled: false },
        { type: 'separator' },
    ]

    // Phase 3a/3b contents per node type. Items disabled here will be
    // enabled as later phases land their backing services.
    switch (payload.nodeType) {
        case 'scene':
            return [
                ...header,
                bgColorSubmenu(payload, action),
                colorProofingItem(payload, action),
                { type: 'separator' },
                ...pasteItem(payload, 'object', action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'object':
            return [
                ...header,
                ...showHideItems(payload, action),
                selectionSubmenu(action),
                ...paintSubmenu(payload, action),
                { type: 'separator' },
                renameItem(action),
                copyItem(action),
                ...pasteItem(payload, 'renderer', action),
                newRendererItem(action),
                newRendGroupItem(action),
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'renderer':
            return [
                ...header,
                ...showHideItems(payload, action),
                ...changeSelSubmenu(payload, action),
                ...changeTypeSubmenu(payload, action),
                ...coloringSubmenu(payload, action),
                ...paintSubmenu(payload, action),
                ...styleSubmenu(payload, action),
                { label: 'Edit style…', click: action({ kind: 'editRendStyle' }) },
                { label: 'Create style…', click: action({ kind: 'createRendStyle' }) },
                ...generateSurfObjItem(payload, action),
                { type: 'separator' },
                renameItem(action),
                copyItem(action),
                newRendererItem(action),
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'rendGroup':
            return [
                ...header,
                ...showHideItems(payload, action),
                renameItem(action),
                copyItem(action),
                ...pasteItem(payload, 'renderer', action),
                newRendererItem(action),
                deleteItem(action),
                { type: 'separator' },
                propertyItem(action),
            ]

        case 'camera':
            return buildCameraNodeMenu(payload, header, action)

        case 'cameraRoot':
            return buildCameraRootMenu(payload, header, action)

        case 'style':
            return buildStyleNodeMenu(payload, header, action)

        case 'styleRoot':
            return buildStyleRootMenu(payload, header, action)

        default:
            return [
                { label: payload.nodeLabel || nodeTypeLabel(payload.nodeType), enabled: false },
            ]
    }
}

/**
 * Camera row context menu (Phase 5b) — UXP `wspcPanelCameraCtxtMenu` with
 * `onCamCtxtShowing` gating:
 *   - Copy / Paste — Copy enabled for cameras; Paste enabled when the
 *     worker clipboard holds a 'camera' entry
 *   - Delete — enabled
 *   - Camera file submenu — Reload only when src is non-empty
 *   - Save/Apply view + Save/Apply scene (with vis flags) — enabled
 *   - Edit vis flags... — dialog dep (Phase 6c); item is rendered but
 *     dispatches a stub (renderer logs and no-ops, matching the UXP
 *     `visflagset-edit-dlg.xul` flow that we do not migrate here)
 *   - Clear vis flags — enabled only when vis_size > 0
 *   - Rename — enabled
 */
function buildCameraNodeMenu(
    payload: SceneCtxMenuPayload,
    header: MenuItemConstructorOptions[],
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
    const info = payload.cameraInfo
    const hasSrc = (info?.src ?? '').length > 0
    const hasVis = (info?.visSize ?? 0) > 0

    return [
        ...header,
        { label: 'New Camera…', click: action({ kind: 'newCamera' }) },
        { type: 'separator' },
        { label: 'Copy', click: action({ kind: 'copy' }) },
        ...pasteItem(payload, 'camera', action),
        { label: 'Delete', click: action({ kind: 'delete' }) },
        { type: 'separator' },
        {
            label: 'Camera file',
            submenu: [
                { label: 'Load…', click: action({ kind: 'cameraLoad' }) },
                {
                    label: 'Reload',
                    enabled: hasSrc,
                    click: action({ kind: 'cameraReload' }),
                },
                { label: 'Save', click: action({ kind: 'cameraSave' }) },
                { label: 'Save As…', click: action({ kind: 'cameraSaveAs' }) },
            ],
        },
        { type: 'separator' },
        {
            label: 'Save from view',
            click: action({ kind: 'cameraSaveFromView', withVisFlags: false }),
        },
        {
            label: 'Apply to view',
            click: action({ kind: 'cameraApplyToView', withVisFlags: false }),
        },
        { type: 'separator' },
        {
            label: 'Save from scene (with vis flags)',
            click: action({ kind: 'cameraSaveFromView', withVisFlags: true }),
        },
        {
            label: 'Apply to scene (with vis flags)',
            click: action({ kind: 'cameraApplyToView', withVisFlags: true }),
        },
        {
            label: 'Edit vis flags…',
            enabled: false,
            click: action({ kind: 'cameraEditVisFlags' }),
        },
        {
            label: 'Clear vis flags',
            enabled: hasVis,
            click: action({ kind: 'cameraClearVisFlags' }),
        },
        { type: 'separator' },
        renameItem(action),
        { type: 'separator' },
        propertyItem(action),
    ]
}

/**
 * Camera root row context menu (Phase 5b). UXP `wspcPanelCameraCtxtMenu`
 * disables everything except New Camera + Camera-file Load + Paste when
 * the selected element is the cameraRoot rather than an individual camera.
 */
function buildCameraRootMenu(
    payload: SceneCtxMenuPayload,
    header: MenuItemConstructorOptions[],
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
    return [
        ...header,
        { label: 'New Camera…', click: action({ kind: 'newCamera' }) },
        ...pasteItem(payload, 'camera', action),
        { type: 'separator' },
        {
            label: 'Camera file',
            submenu: [{ label: 'Load…', click: action({ kind: 'cameraLoad' }) }],
        },
    ]
}

/**
 * Style row context menu (Phase 5c) — UXP `wspcStyleCtxtMenu` with
 * `onStyCtxtShowing` gating:
 *   - Copy / Paste — Copy disabled on global rows (scope==0); Paste enabled
 *     when the worker clipboard holds a 'style' entry
 *   - Delete — disabled on global rows
 *   - Style file submenu — Reload only when src is non-empty (external);
 *     Save / Save As disabled on global rows
 *   - Read-only checkbox — disabled on global rows OR when modified
 *   - Rename — UXP has no JS implementation; omitted
 *   - Edit — re-uses the per-row Properties stub (Phase 5a will replace).
 */
function buildStyleNodeMenu(
    payload: SceneCtxMenuPayload,
    header: MenuItemConstructorOptions[],
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
    const info = payload.styleInfo
    const isGlobal = info?.scopeId === 0
    const hasSrc = (info?.src ?? '').length > 0
    const isReadOnly = info?.readonly === true
    const isModified = info?.modified === true

    return [
        ...header,
        { label: 'New Style…', click: action({ kind: 'newStyle' }) },
        { type: 'separator' },
        {
            label: 'Copy',
            enabled: !isGlobal,
            click: action({ kind: 'copy' }),
        },
        ...pasteItem(payload, 'style', action),
        {
            label: 'Delete',
            enabled: !isGlobal,
            click: action({ kind: 'delete' }),
        },
        { type: 'separator' },
        {
            label: 'Style file',
            submenu: [
                { label: 'Load…', click: action({ kind: 'styleLoad' }) },
                {
                    label: 'Reload',
                    enabled: hasSrc,
                    click: action({ kind: 'styleReload' }),
                },
                {
                    label: 'Save',
                    enabled: !isGlobal,
                    click: action({ kind: 'styleSave' }),
                },
                {
                    label: 'Save As…',
                    enabled: !isGlobal,
                    click: action({ kind: 'styleSaveAs' }),
                },
            ],
        },
        { type: 'separator' },
        {
            label: 'Read-only',
            type: 'checkbox',
            checked: isReadOnly,
            // Mirrors UXP `onStyCtxtShowing`: disable on global rows and on
            // RW-but-modified rows (transition to RO is unsafe).
            enabled: !isGlobal && !(isReadOnly === false && isModified),
            click: action({ kind: 'styleToggleReadOnly' }),
        },
        { type: 'separator' },
        propertyItem(action),
    ]
}

/**
 * Style root row context menu (Phase 5c). Mirrors UXP onStyCtxtShowing
 * fall-through branch for the styles top-node: only New Style + Paste
 * (when clipboard has a style entry) + Load File apply.
 */
function buildStyleRootMenu(
    payload: SceneCtxMenuPayload,
    header: MenuItemConstructorOptions[],
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
    return [
        ...header,
        { label: 'New Style…', click: action({ kind: 'newStyle' }) },
        ...pasteItem(payload, 'style', action),
        { type: 'separator' },
        {
            label: 'Style file',
            submenu: [{ label: 'Load…', click: action({ kind: 'styleLoad' }) }],
        },
    ]
}

function showHideItems(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
    if (!payload.hasVisibility) return []
    if (payload.isVisible) {
        return [{ label: 'Hide', click: action({ kind: 'hide' }) }]
    }
    return [{ label: 'Show', click: action({ kind: 'show' }) }]
}

function renameItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Rename…', click: action({ kind: 'rename' }) }
}

function deleteItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Delete', click: action({ kind: 'delete' }) }
}

function propertyItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Properties…', click: action({ kind: 'property' }) }
}

function copyItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'Copy', click: action({ kind: 'copy' }) }
}

/**
 * Paste menu item — only shown when the worker clipboard holds the
 * matching kind. Scene rows accept object pastes; object rows accept
 * renderer pastes.
 */
function pasteItem(
    payload: SceneCtxMenuPayload,
    expectedKind: 'object' | 'renderer' | 'style' | 'camera',
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
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
 * `wspcPanelRendColMenu`:
 *
 *   - "Paint (Secondary str.)" sub-submenu (only when paintStyles is non-empty)
 *   - "CPK molcol"     → applyStyles DefaultCPKColoring
 *   - "CPK dark gray"  → applyStyles DarkCPKColoring
 *   - "CPK light gray" → applyStyles LightCPKColoring
 *   - "B-factor"       → create BfacColoring + assign
 *   - "Rainbow"        → create RainbowColoring + assign
 *
 * Hidden entirely for renderer types that don't support a `coloring`
 * property (`*selection`, `*namelabel`, `atomintr`) — main process trusts
 * the renderer-supplied `supportsColoring` flag.
 */
function coloringSubmenu(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
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
 * sub-submenus with brightness / saturation variations. Each leaf
 * dispatches `paintRend` with the corresponding CueMol color value
 * (`#FFF`, `hsb(0, 1.0, 1.0)`, etc.).
 *
 * Gated by `payload.canPaint` so the submenu only appears when the
 * renderer's coloring is `PaintColoring` and the parent mol has a
 * non-empty selection (UXP `checkPaintColoring` semantics).
 */
function paintSubmenu(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
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

function buildPaintFamilyMenus(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions[] {
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
 * `payload.rendStyle.{typeStyles, edgeStyles}`:
 *   - Type-suffix styles matching `<renderer_type>$/i`
 *   - Edge styles matching `^EgLine` (omitted for blocklist types)
 *
 * Each item dispatches `applyRendStyle` with the style name plus the
 * regex pattern used to strip pre-existing entries (so the worker can
 * apply the same strip / push transformation UXP `styleMol` performs).
 *
 * The submenu disappears entirely when both groups are empty.
 */
function styleSubmenu(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
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
 * presets here (the Menu bar has a richer color picker; this ctx item
 * is a one-click shortcut). Radio state reflects `payload.bgColor`.
 */
function bgColorSubmenu(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
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
function colorProofingItem(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return {
        label: 'Use color proofing',
        type: 'checkbox',
        checked: payload.colorProofingEnabled === true,
        click: action({ kind: 'toggleColorProofing' }),
    }
}

/**
 * Renderer-row "Change sel" submenu. Mirrors UXP `wspcPanelRendSelMenu`
 * (`workspace_panel.xul`). The submenu is hidden for the `*selection`
 * renderer (controlled by `payload.supportsChangeSel`), matching UXP's
 * `selitem.hidden = ... type_name=="*selection"` gate.
 */
function changeSelSubmenu(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
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
 * `payload.rendChangeTypes` (pre-fetched via `getRendererChangeTypes`).
 * Hidden when the list is empty — that doubles as the visibility gate
 * since the worker filters synthetic / current-type entries out.
 */
function changeTypeSubmenu(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
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
function generateSurfObjItem(
    payload: SceneCtxMenuPayload,
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
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
 * The renderer side prompts for the group name (with an auto-generated
 * default) before dispatching to the worker.
 */
function newRendGroupItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'New Group…', click: action({ kind: 'newRendGroup' }) }
}

/**
 * "New Renderer..." item on object / renderer / rendGroup rows.
 * The renderer side resolves the target obj + (optional) group name from
 * the clicked row (UXP `onNewCmd`), shows the shared NewRendererDialog,
 * and dispatches `createRendererOnObject`.
 */
function newRendererItem(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
    return { label: 'New Renderer…', click: action({ kind: 'newRenderer' }) }
}

function selectionSubmenu(
    action: (a: SceneCtxAction) => MenuItemConstructorOptions['click'],
): MenuItemConstructorOptions {
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

function nodeTypeLabel(nodeType: SceneCtxNodeType): string {
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
