/**
 * Typed model for the scene tree exposed by the worker to the renderer.
 *
 * The C++ `Scene::getSceneDataJSON(true)` API emits a flat top-level array
 * `[scene, ...objects]`. Each object carries a `rends` array which may
 * contain renderers and renderer groups (groups have a `childNodes` field
 * that holds nested renderers). See `src/qsys/Scene.cpp` and
 * `src/qsys/Object.cpp` for the producer side.
 *
 * Worker side parses that string into a single rooted `SceneTreeNode`
 * (the scene) whose `children` are the objects, each containing renderers
 * and groups recursively. Renderer side consumes `SceneTreeNode` directly.
 */

export type SceneNodeType =
    | 'scene'
    | 'object'
    | 'renderer'
    | 'rendGroup'
    | 'cameraRoot'
    | 'styleRoot'
    | 'camera'
    | 'style';

export interface SceneTreeNode {
    /** C++ UID of the scene / object / renderer / group. */
    id: number;
    /** Display name (no class-name suffix; UI layer adds decoration). */
    name: string;
    /** Discriminator for type-specific UI behaviour. */
    type: SceneNodeType;
    /**
     * For `object` nodes this is the C++ class name (e.g. "PDBMol").
     * For `renderer` / `rendGroup` nodes this is the renderer type name
     * (e.g. "cartoon", "*group"). Empty string for the scene node.
     */
    className: string;
    /** Own visibility flag from C++. Scene has no real visibility and is always true. */
    visible: boolean;
    /** Lock flag from C++. */
    locked: boolean;
    /** UI collapse hint from C++ (objects and groups only; false for others). */
    uiCollapsed: boolean;
    /** Render order from C++ (used for drag-drop in later phases). */
    uiOrder: number;
    /**
     * Visibility taking ancestors into account: false if any ancestor
     * object/group has `visible=false`. Used to render dimmed "disabled"
     * eye icons matching UXP's `object_vis: "disabled"` state.
     */
    effectiveVisible: boolean;
    /** Recursive children. Empty for leaf renderers. */
    children: SceneTreeNode[];
}

// ─── Raw JSON shapes from C++ (internal to the parser) ────────────────────

interface RawSceneItem {
    name?: string;
    type: '';
    ID: number;
}

interface RawObjectItem {
    name?: string;
    type: string;
    ID: number;
    visible?: boolean;
    locked?: boolean;
    ui_collapsed?: boolean;
    ui_order?: number;
    rends?: RawRendItem[];
}

interface RawRendItem {
    name?: string;
    type: string;
    ID: number;
    visible?: boolean;
    locked?: boolean;
    ui_collapsed?: boolean;
    ui_order?: number;
    /** Only present on renderer groups. */
    childNodes?: RawRendItem[];
}

/**
 * Parse the JSON string emitted by `Scene::getSceneDataJSON(true)` into a
 * single rooted `SceneTreeNode`. Returns `null` on malformed input.
 */
export function parseSceneTreeJSON(json: string): SceneTreeNode | null {
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return null;
    }
    if (!Array.isArray(raw) || raw.length === 0) return null;

    const sceneItem = raw[0] as RawSceneItem;
    if (typeof sceneItem?.ID !== 'number') return null;

    const objectNodes: SceneTreeNode[] = [];
    for (let i = 1; i < raw.length; i++) {
        const obj = raw[i] as RawObjectItem;
        if (typeof obj?.ID !== 'number') continue;
        const own = obj.visible ?? true;
        objectNodes.push({
            id: obj.ID,
            name: obj.name ?? '',
            type: 'object',
            className: obj.type ?? '',
            visible: own,
            locked: obj.locked ?? false,
            uiCollapsed: obj.ui_collapsed ?? false,
            uiOrder: obj.ui_order ?? 0,
            effectiveVisible: own,
            children: buildRendNodes(obj.rends, own),
        });
    }

    return {
        id: sceneItem.ID,
        name: sceneItem.name ?? '',
        type: 'scene',
        className: '',
        visible: true,
        locked: false,
        uiCollapsed: false,
        uiOrder: 0,
        effectiveVisible: true,
        children: objectNodes,
    };
}

/**
 * Build a virtual `cameraRoot` node listing the given camera names. Cameras
 * are not part of `getSceneDataJSON`; the worker service fetches them via
 * `scene.cameraNames` and synthesises this branch so the tree matches the
 * UXP layout. `id` is negative to avoid collision with real C++ UIDs.
 */
export function buildCameraRoot(cameraNames: string[]): SceneTreeNode {
    return {
        id: -1,
        name: 'Camera',
        type: 'cameraRoot',
        className: '',
        visible: true,
        locked: false,
        uiCollapsed: true,
        uiOrder: 0,
        effectiveVisible: true,
        children: cameraNames.map((name, idx) => ({
            id: -1000 - idx,
            name,
            type: 'camera' as SceneNodeType,
            className: '',
            visible: true,
            locked: false,
            uiCollapsed: false,
            uiOrder: idx,
            effectiveVisible: true,
            children: [],
        })),
    };
}

/**
 * Build a virtual `styleRoot` node listing the given style-set names.
 * Same rationale as `buildCameraRoot`.
 */
export function buildStyleRoot(styleNames: string[]): SceneTreeNode {
    return {
        id: -2,
        name: 'Styles',
        type: 'styleRoot',
        className: '',
        visible: true,
        locked: false,
        uiCollapsed: true,
        uiOrder: 0,
        effectiveVisible: true,
        children: styleNames.map((name, idx) => ({
            id: -2000 - idx,
            name,
            type: 'style' as SceneNodeType,
            className: '',
            visible: true,
            locked: false,
            uiCollapsed: false,
            uiOrder: idx,
            effectiveVisible: true,
            children: [],
        })),
    };
}

function buildRendNodes(
    items: RawRendItem[] | undefined,
    ancestorVisible: boolean,
): SceneTreeNode[] {
    if (!Array.isArray(items)) return [];
    const out: SceneTreeNode[] = [];
    for (const it of items) {
        if (typeof it?.ID !== 'number') continue;
        const own = it.visible ?? true;
        const effective = ancestorVisible && own;
        const isGroup = Array.isArray(it.childNodes);
        out.push({
            id: it.ID,
            name: it.name ?? '',
            type: isGroup ? 'rendGroup' : 'renderer',
            className: it.type ?? '',
            visible: own,
            locked: it.locked ?? false,
            uiCollapsed: it.ui_collapsed ?? false,
            uiOrder: it.ui_order ?? 0,
            effectiveVisible: effective,
            children: isGroup ? buildRendNodes(it.childNodes, effective) : [],
        });
    }
    return out;
}
