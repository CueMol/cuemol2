/**
 * @file hooks/sceneContextMenu/buildSceneCtxPayload.ts
 * @description Pre-fetch every piece of state the main-process menu
 * builder needs for a scene-tree right-click. Returns the payload object
 * that goes to `IPC.SCENE_CTX_SHOW`.
 *
 * Per-node-type gating (supportsColoring, canPaint, canGenSurfObj, ...)
 * mirrors the UXP `wsp*CtxtMenuShowing` filter logic and is keyed on
 * the node's `className` and `type`. Each pre-fetch failure is logged
 * and falls back to the safe default — the menu degrades gracefully.
 */

import type { AsyncCueMol } from '../../worker/client/AsyncCueMol'
import type { SceneTreeNode } from '../../worker/shared/sceneTreeTypes'

/**
 * Renderer type names that don't support a `coloring` property — matches
 * UXP `checkColoring` in `workspace_panel_ctxtmenu.js`. The Coloring
 * submenu is hidden for these types.
 */
export const RENDERER_TYPES_WITHOUT_COLORING = new Set([
    '*selection',
    '*namelabel',
    'atomintr',
])

export function nodeMenuLabel(node: SceneTreeNode): string {
    if (node.type === 'scene') return `Scene: ${node.name || 'Untitled'}`
    if (node.type === 'object') {
        return node.className ? `${node.name} (${node.className})` : node.name
    }
    if (node.type === 'renderer') {
        return node.className ? `${node.name} (${node.className})` : node.name
    }
    return node.name
}

export interface SceneCtxPayload {
    nodeType: SceneTreeNode['type']
    nodeLabel: string
    isVisible: boolean
    hasVisibility: boolean
    clipboardKind: 'object' | 'renderer' | 'style' | 'camera' | null
    supportsColoring: boolean
    paintStyles: { name: string; label: string }[]
    canPaint: boolean
    rendStyle?: {
        typeStyles: { name: string; label: string; pattern: string; flags: string }[]
        edgeStyles: { name: string; label: string; pattern: string; flags: string }[]
    }
    bgColor?: 'white' | 'black' | 'other'
    colorProofingEnabled: boolean
    supportsChangeSel: boolean
    canGenSurfObj: boolean
    rendChangeTypes: string[]
    styleInfo?: SceneTreeNode extends { styleInfo?: infer S } ? S : undefined
    cameraInfo?: SceneTreeNode extends { cameraInfo?: infer C } ? C : undefined
}

export async function buildSceneCtxPayload(
    cm: AsyncCueMol | null,
    sceneId: number | undefined,
    node: SceneTreeNode,
): Promise<SceneCtxPayload> {
    const hasVisibility =
        node.type === 'object' ||
        node.type === 'renderer' ||
        node.type === 'rendGroup'

    // Coloring submenu is renderer-only and hidden for the special
    // non-coloring renderer types (selection / label / atomintr).
    const supportsColoring =
        node.type === 'renderer' &&
        !RENDERER_TYPES_WITHOUT_COLORING.has(node.className)

    // Change sel submenu is renderer-only and hidden for `*selection`.
    const supportsChangeSel =
        node.type === 'renderer' && node.className !== '*selection'

    // Generate surface obj is isosurf-only.
    const canGenSurfObj =
        node.type === 'renderer' && node.className === 'isosurf'

    // Pre-fetch clipboard state so main can enable Paste items correctly.
    let clipboardKind: 'object' | 'renderer' | 'style' | 'camera' | null = null
    if (cm) {
        try {
            const r = await cm.invokeService('getClipboardKind', {})
            clipboardKind = r?.kind ?? null
        } catch (err) {
            console.warn('getClipboardKind failed:', err)
        }
    }

    // Pre-fetch renderer-specific submenu data in parallel.
    let paintStyles: { name: string; label: string }[] = []
    let canPaint = false
    let rendStyle: SceneCtxPayload['rendStyle'] | undefined
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

    // Object-row paint pre-fetch — drives the Paint color-picker submenu
    // gate (UXP `onPaintMol` object branch, hidden when sel is empty or
    // coloring is not PaintColoring).
    if (cm && node.type === 'object' && sceneId !== undefined) {
        try {
            const info = await cm.invokeService('getObjectPaintInfo', {
                sceneId, objId: node.id,
            })
            canPaint = info?.canPaint === true
        } catch (err) {
            console.warn('object paint pre-fetch failed:', err)
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

    // Style + Camera node payload data is just property reads on the
    // tree node — getSceneTree already populated both.
    const styleInfo = node.type === 'style' ? node.styleInfo : undefined
    const cameraInfo = node.type === 'camera' ? node.cameraInfo : undefined

    return {
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
        styleInfo: styleInfo as SceneCtxPayload['styleInfo'],
        cameraInfo: cameraInfo as SceneCtxPayload['cameraInfo'],
    }
}
