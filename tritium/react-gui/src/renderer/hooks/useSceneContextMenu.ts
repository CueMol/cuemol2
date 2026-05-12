import { useCallback } from 'react'
import type {
    ChangeRendSelKind,
    RendColoringId,
    SceneCtxAction,
    SelectMolKind,
} from '../../shared/ipcTypes'
import { IPC } from '../../shared/ipcChannels'
import type { SceneTreeNode } from '../worker/shared/sceneTreeTypes'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useShowTextPromptDialog } from '../components/dialogs/TextPromptDialogProvider'

/**
 * Renderer type names that don't support a `coloring` property — matches
 * UXP `checkColoring` in `workspace_panel_ctxtmenu.js`. The Coloring submenu
 * is hidden for these types.
 */
const RENDERER_TYPES_WITHOUT_COLORING = new Set([
    '*selection',
    '*namelabel',
    'atomintr',
])

/**
 * Opens the native scene-tree context menu and dispatches the returned
 * action against the appropriate worker service via the callbacks supplied
 * by `useSceneTree`. Mirrors the pattern in `useNaviContextMenu`.
 *
 * Phase 3a: Show / Hide, Rename (window.prompt-based), Delete, Properties.
 * Phase 3b: object Selection submenu (selectMol-* actions).
 * Phase 3c-1: renderer Coloring submenu (static items).
 * Phase 3c-2: dynamic Paint (Secondary str.) sub-submenu populated from
 *             StyleManager.getStyleNamesJSON via getPaintColoringStyles.
 * Phase 3c-3a: Paint color-picker submenu (color-menu.xul replica) gated
 *              by getRendererPaintInfo.canPaint.
 * Phase 3c-3b: Style (shape) submenu populated from getRendererStyleEntries.
 */
export interface UseSceneContextMenuOptions {
    cm: AsyncCueMol | null
    /** Active scene UID — required to pre-fetch dynamic Paint(SS) styles. */
    sceneId: number | undefined
    toggleVisibility: (id: string) => void
    deleteNode: (id: string) => Promise<boolean>
    renameNode: (id: string, newName: string) => Promise<boolean>
    showProperty: (id: string) => Promise<void> | void
    selectObjectMol: (id: string, kind: SelectMolKind) => Promise<boolean>
    copyNode: (node: SceneTreeNode) => Promise<boolean>
    pasteNode: (node: SceneTreeNode) => Promise<boolean>
    setRendererColoring: (id: string, coloringId: RendColoringId) => Promise<boolean>
    paintRendererSelection: (id: string, colorValue: string) => Promise<boolean>
    applyRendererStyle: (
        id: string, styleName: string, pattern: string, flags: string,
    ) => Promise<boolean>
    setSceneBackgroundColor: (color: 'white' | 'black') => Promise<boolean>
    toggleSceneColorProofing: () => Promise<boolean>
    setRendererSelection: (id: string, selKind: ChangeRendSelKind) => Promise<boolean>
    generateRendererSurfObj: (id: string) => Promise<boolean>
    createRendererGroup: (objId: string, name: string) => Promise<boolean>
    changeRendererType: (rendId: string, newType: string) => Promise<boolean>
}

export function useSceneContextMenu(opts: UseSceneContextMenuOptions): {
    openContextMenu: (node: SceneTreeNode, x: number, y: number) => Promise<void>
} {
    const {
        cm, sceneId, toggleVisibility, deleteNode, renameNode, showProperty,
        selectObjectMol, copyNode, pasteNode, setRendererColoring,
        paintRendererSelection, applyRendererStyle,
        setSceneBackgroundColor, toggleSceneColorProofing,
        setRendererSelection, generateRendererSurfObj,
        createRendererGroup, changeRendererType,
    } = opts

    // Electron disables window.prompt — use the in-app Blueprint dialog
    // for Rename / New Group text input flows instead.
    const showTextPrompt = useShowTextPromptDialog()

    const openContextMenu = useCallback(
        async (node: SceneTreeNode, x: number, y: number): Promise<void> => {
            const hasVisibility =
                node.type === 'object' ||
                node.type === 'renderer' ||
                node.type === 'rendGroup'

            // Coloring submenu is renderer-only and hidden for the special
            // non-coloring renderer types (selection / label / atomintr).
            const supportsColoring =
                node.type === 'renderer' &&
                !RENDERER_TYPES_WITHOUT_COLORING.has(node.className)

            // Change sel submenu is renderer-only and hidden for `*selection`
            // (matches UXP `onRendCtxtMenuShowing` selitem.hidden gate).
            const supportsChangeSel =
                node.type === 'renderer' && node.className !== '*selection'

            // Generate surface obj is isosurf-only (UXP gensurfitem gate).
            const canGenSurfObj =
                node.type === 'renderer' && node.className === 'isosurf'

            // Pre-fetch clipboard state so main can enable Paste items correctly.
            let clipboardKind: 'object' | 'renderer' | null = null
            if (cm) {
                try {
                    const r = await cm.invokeService('getClipboardKind', {})
                    clipboardKind = r?.kind ?? null
                } catch (err) {
                    console.warn('getClipboardKind failed:', err)
                }
            }

            // Pre-fetch renderer-specific submenu data in parallel.
            // Coloring (paint styles + canPaint) is gated by supportsColoring;
            // Style entries are pre-fetched whenever the node is a renderer
            // since the gate (typeStyles/edgeStyles emptiness) is computed
            // worker-side.
            let paintStyles: { name: string; label: string }[] = []
            let canPaint = false
            let rendStyle:
                | {
                    typeStyles: {
                        name: string; label: string; pattern: string; flags: string
                    }[]
                    edgeStyles: {
                        name: string; label: string; pattern: string; flags: string
                    }[]
                }
                | undefined
            let rendChangeTypes: string[] = []
            if (cm && node.type === 'renderer' && sceneId !== undefined) {
                try {
                    const coloringPromises = supportsColoring
                        ? ([
                              cm.invokeService('getPaintColoringStyles', { sceneId }),
                              cm.invokeService('getRendererPaintInfo', {
                                  sceneId, rendId: node.id,
                              }),
                          ] as const)
                        : ([Promise.resolve(null), Promise.resolve(null)] as const)
                    const stylePromise = cm.invokeService('getRendererStyleEntries', {
                        sceneId, rendId: node.id,
                    })
                    const changeTypesPromise = cm.invokeService('getRendererChangeTypes', {
                        sceneId, rendId: node.id,
                    })
                    const [styles, paintInfo, styleEntries, changeTypes] = await Promise.all([
                        coloringPromises[0], coloringPromises[1], stylePromise, changeTypesPromise,
                    ])
                    paintStyles = styles?.entries ?? []
                    canPaint = paintInfo?.canPaint === true
                    if (styleEntries?.ok) {
                        rendStyle = {
                            typeStyles: styleEntries.typeStyles,
                            edgeStyles: styleEntries.edgeStyles,
                        }
                    }
                    rendChangeTypes = changeTypes?.typeNames ?? []
                } catch (err) {
                    console.warn('renderer ctx pre-fetch failed:', err)
                }
            }

            // Pre-fetch scene-row submenu state (bg color + color proofing).
            let bgColor: 'white' | 'black' | 'other' | undefined
            let colorProofingEnabled = false
            if (cm && node.type === 'scene' && sceneId !== undefined) {
                try {
                    const [bg, cp] = await Promise.all([
                        cm.invokeService('getSceneBgColor', { sceneId }),
                        cm.invokeService('getSceneColorProofing', { sceneId }),
                    ])
                    bgColor = bg?.bgColor
                    colorProofingEnabled = cp?.enabled === true
                } catch (err) {
                    console.warn('scene ctx pre-fetch failed:', err)
                }
            }

            const action: SceneCtxAction | null = await window.electronAPI.invoke(
                IPC.SCENE_CTX_SHOW,
                {
                    x,
                    y,
                    nodeType: node.type,
                    nodeLabel: nodeMenuLabel(node),
                    isVisible: node.visible,
                    hasVisibility,
                    clipboardKind,
                    supportsColoring,
                    paintStyles,
                    canPaint,
                    rendStyle,
                    bgColor,
                    colorProofingEnabled,
                    supportsChangeSel,
                    canGenSurfObj,
                    rendChangeTypes,
                },
            )

            if (!action) return
            const idStr = String(node.id)

            switch (action.kind) {
                case 'show':
                case 'hide':
                    toggleVisibility(idStr)
                    break
                case 'rename': {
                    const next = await showTextPrompt({
                        title: 'Rename',
                        label: `Rename ${node.name} to:`,
                        defaultValue: node.name,
                    })
                    if (next == null) break
                    if (next === node.name) break
                    await renameNode(idStr, next)
                    break
                }
                case 'delete':
                    await deleteNode(idStr)
                    break
                case 'property':
                    await showProperty(idStr)
                    break
                case 'selectMol':
                    if (node.type !== 'object') break
                    await selectObjectMol(idStr, action.selectKind)
                    break
                case 'copy':
                    await copyNode(node)
                    break
                case 'paste':
                    await pasteNode(node)
                    break
                case 'setRendColoring':
                    if (node.type !== 'renderer') break
                    await setRendererColoring(idStr, action.coloringId)
                    break
                case 'paintRend':
                    if (node.type !== 'renderer') break
                    await paintRendererSelection(idStr, action.colorValue)
                    break
                case 'applyRendStyle':
                    if (node.type !== 'renderer') break
                    await applyRendererStyle(
                        idStr, action.styleName, action.pattern, action.flags,
                    )
                    break
                case 'setSceneBgColor':
                    if (node.type !== 'scene') break
                    await setSceneBackgroundColor(action.color)
                    break
                case 'toggleColorProofing':
                    if (node.type !== 'scene') break
                    await toggleSceneColorProofing()
                    break
                case 'setRendSel':
                    if (node.type !== 'renderer') break
                    await setRendererSelection(idStr, action.selKind)
                    break
                case 'generateSurfObj':
                    if (node.type !== 'renderer') break
                    await generateRendererSurfObj(idStr)
                    break
                case 'changeRendType':
                    if (node.type !== 'renderer') break
                    await changeRendererType(idStr, action.typeName)
                    break
                case 'newRendGroup': {
                    if (node.type !== 'object') break
                    // Pre-fetch a scene-wide-unique default name so the
                    // prompt matches UXP `onNewRendGrp` (suggested name
                    // pre-filled, user may accept or edit).
                    let suggestion = 'group1'
                    if (cm && sceneId !== undefined) {
                        try {
                            const r = await cm.invokeService('proposeUniqName', {
                                kind: 'sceneRenderer',
                                prefix: 'group',
                                sceneId,
                            })
                            suggestion = r?.name ?? suggestion
                        } catch (err) {
                            console.warn('proposeUniqName failed:', err)
                        }
                    }
                    const entered = await showTextPrompt({
                        title: 'New Renderer Group',
                        label: 'Name for new group:',
                        defaultValue: suggestion,
                        confirmLabel: 'Create',
                    })
                    if (entered == null) break
                    await createRendererGroup(idStr, entered)
                    break
                }
            }
        },
        [
            cm, sceneId, toggleVisibility, deleteNode, renameNode, showProperty,
            selectObjectMol, copyNode, pasteNode, setRendererColoring,
            paintRendererSelection, applyRendererStyle,
            setSceneBackgroundColor, toggleSceneColorProofing,
            setRendererSelection, generateRendererSurfObj,
            createRendererGroup, changeRendererType, showTextPrompt,
        ],
    )

    return { openContextMenu }
}

function nodeMenuLabel(node: SceneTreeNode): string {
    if (node.type === 'scene') return `Scene: ${node.name || 'Untitled'}`
    if (node.type === 'object') {
        return node.className ? `${node.name} (${node.className})` : node.name
    }
    if (node.type === 'renderer') {
        return node.className ? `${node.name} (${node.className})` : node.name
    }
    return node.name
}
