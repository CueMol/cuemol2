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
    /**
     * Style-node metadata from `StyleManager.getStyleSetsJSON`. Only present
     * on `style` nodes; absent for everything else. Used by ctxmenu wiring
     * to drive Reload / Save / Read-only gates without an extra round-trip.
     */
    styleInfo?: StyleNodeInfo;
    /**
     * Camera-node metadata from `Scene.getCameraInfoJSON`. Only present on
     * `camera` nodes. Used by ctxmenu wiring to drive Reload (src present)
     * and Clear vis flags (vis_size > 0) gates. Cameras are keyed by name
     * (string) rather than uid, so the worker services take `cameraName`
     * from the SceneTreeNode `name` field directly.
     */
    cameraInfo?: CameraNodeInfo;
}

/**
 * Per-style-node metadata mirroring the fields produced by
 * `StyleMgr::getStyleSetsJSON`. `scopeId` is the StyleManager scope under
 * which this style set was registered (0 for global, scene.uid for
 * scene-local) -- the operation services key on it for create / destroy /
 * register / saveToFile.
 */
export interface StyleNodeInfo {
    scopeId: number;
    src: string;
    readonly: boolean;
    modified: boolean;
}

/** Per-camera-node metadata mirroring `Scene::getCameraInfoJSON`. */
export interface CameraNodeInfo {
    /** Source file path; empty for cameras created from a live view. */
    src: string;
    /** Count of saved visibility-flag entries on this camera. */
    visSize: number;
}

// - Raw JSON shapes from C++ (internal to the parser) -

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

/** Input shape for `buildCameraRoot` -- one entry per Camera. */
export interface CameraRootEntry {
    /** Camera name -- the lookup key in `Scene.{get,set,destroy}Camera`. */
    name: string;
    /** Source file path; empty for cameras saved from a live view. */
    src: string;
    /** Number of saved vis-flag entries on the camera (UXP `vis_size`). */
    visSize: number;
}

/**
 * Build a virtual `cameraRoot` node listing the given cameras. Cameras
 * are not part of `getSceneDataJSON`; the worker service fetches them via
 * `scene.getCameraInfoJSON()` and synthesises this branch so the tree
 * matches the UXP layout.
 *
 * Cameras have no C++ uid -- they're keyed by **name** at the Scene API
 * level. We expose the name through the existing `name` field; for the
 * synthesised tree `id` we hash a small negative integer per row so
 * unique-id callers still get distinct values, but worker services on
 * camera rows take the name from `node.name` rather than `node.id`.
 */
export function buildCameraRoot(entries: CameraRootEntry[]): SceneTreeNode {
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
        children: entries.map((e, idx) => ({
            id: -1000 - idx,
            name: e.name,
            type: 'camera' as SceneNodeType,
            // Mirror UXP `object_vis: "linked"` styling for file-linked
            // cameras (src.length > 0). The ScenePane keys the link icon
            // off this className hint.
            className: e.src.length > 0 ? 'linked' : '',
            visible: true,
            locked: false,
            uiCollapsed: false,
            uiOrder: idx,
            effectiveVisible: true,
            children: [],
            cameraInfo: { src: e.src, visSize: e.visSize },
        })),
    };
}

/** Input shape for `buildStyleRoot` -- one entry per StyleSet. */
export interface StyleRootEntry {
    /** Display name (UXP renders "" as "(anonymous)"). */
    name: string;
    /** Real C++ UID of the StyleSet -- used as `id` on the tree node. */
    uid: number;
    /** Scope id (0 for global, scene.uid for scene-local). */
    scopeId: number;
    src: string;
    readonly: boolean;
    modified: boolean;
}

/**
 * Build a virtual `styleRoot` node listing the given style sets. The root
 * itself uses a synthesised negative `id` (no real C++ uid), but each style
 * child carries the real StyleSet uid so worker services can resolve them
 * directly. `scopeId` / `readonly` / `modified` / `src` flow through to
 * `styleInfo` for ctxmenu gating.
 */
export function buildStyleRoot(entries: StyleRootEntry[]): SceneTreeNode {
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
        children: entries.map((e, idx) => ({
            id: e.uid,
            // UXP renders the empty-name case as "(anonymous)" so the row
            // is selectable; preserve that here. The real name on the
            // StyleSet is "" -- we don't write it back.
            name: e.name === '' ? '(anonymous)' : e.name,
            type: 'style' as SceneNodeType,
            // Surface readonly/global state as className-like hint so the
            // existing ScenePane row rendering can dim or lock-icon a row
            // without consulting styleInfo separately. Empty for editable
            // scene-local styles.
            className:
                e.scopeId === 0
                    ? 'global'
                    : e.readonly
                      ? 'readonly'
                      : '',
            // Style nodes have no visibility flag; report true so the
            // existing UI gates "hasVisibility" cleanly without special-cases.
            visible: true,
            // UXP gates "lock" on `scope==0 || readonly`. The tree-row
            // renderer keys off `locked` to show the lock badge.
            locked: e.scopeId === 0 || e.readonly,
            uiCollapsed: false,
            uiOrder: idx,
            effectiveVisible: true,
            children: [],
            styleInfo: {
                scopeId: e.scopeId,
                src: e.src,
                readonly: e.readonly,
                modified: e.modified,
            },
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
