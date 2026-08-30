/**
 * @file worker/server/services/props/selContext.ts
 * @description Which molecule a selection property belongs to.
 *
 * A selection string compiles against a molecule, and the node being edited
 * is not always one: a renderer's molecule is its client object, a surface's
 * is whatever it names as its target. Getting this wrong compiles the
 * selection in the wrong scope, which fails silently.
 */
import type { BaseWrapper } from '@cuemol/core/src/BaseWrapper';
import type { Renderer } from '@cuemol/core/src/wrappers/Renderer';
import type { Scene } from '@cuemol/core/src/wrappers/Scene';
import { safeRead } from '@renderer/worker/server/services/helpers/safeRead';
import type { PropTargetType } from '@renderer/worker/shared/genericProps';

/**
 * Scene.name is a read-only property -- its `.qif` declares
 * `redirect(getName, XXX) (readonly)`, so there is no `setProp` setter -- but a
 * scene CAN be renamed via `Scene::setName()`, which also fires the
 * `propChanged("name")` event the scene tree and tab strip rely on. So a scene
 * name write coming from the inspector is routed through `setName()` here. The
 * entries keep their honest `readonly: true`; only the Properties tab presents
 * the Name field as editable (the Generic tab stays read-only).
 */
export function isSceneNameWrite(nodeType: PropTargetType, propName: string): boolean {
    return nodeType === 'scene' && propName === 'name';
}

/**
 * Property names that hold the NAME of a molecule a non-molecular renderer
 * evaluates its selection against, in the order they are consulted: the
 * surface renderer's reference molecule, then a map renderer's display-limit
 * boundary molecule.
 */
const MOL_NAME_PROPS = ['target', 'bndry_molname'];

/** True for MolCoord and the subclasses the object lists treat as molecules. */
function isMoleculeClass(className: string): boolean {
    return (
        className === 'MolCoord' || className === 'Trajectory' || className.endsWith('Mol')
    );
}

/** `obj`'s uid when it is a molecule, else undefined. */
function molUidOf(obj: unknown): number | undefined {
    if (!obj) return undefined;
    const rec = obj as { getClassName?: () => string; uid?: number };
    const className = safeRead(() => rec.getClassName?.() ?? '') ?? '';
    if (!isMoleculeClass(className)) return undefined;
    const uid = safeRead(() => rec.uid);
    return typeof uid === 'number' ? uid : undefined;
}

/**
 * The molecule a node's selection properties are about.
 *
 * A molecular renderer is attached to its molecule, so its client object is
 * the answer. A surface or map renderer is attached to something else and
 * names its reference molecule in a string property instead, so fall back to
 * resolving that name in the scene. An Object node answers for itself.
 *
 * Returns undefined when the node has no molecule (a density map, a scene, a
 * renderer whose named target has since been deleted); the selection picker
 * then simply has no atom count to show.
 */
export function resolveSelContextMol(
    scene: Scene | null,
    target: BaseWrapper,
    nodeType: PropTargetType,
): number | undefined {
    if (nodeType === 'object') return molUidOf(target);
    if (nodeType !== 'renderer' && nodeType !== 'rendGroup') return undefined;

    const client = safeRead(() => (target as unknown as Renderer).getClientObj());
    const clientMol = molUidOf(client);
    if (clientMol !== undefined) return clientMol;

    if (!scene) return undefined;
    const rec = target as unknown as Record<string, unknown>;
    for (const propName of MOL_NAME_PROPS) {
        const name = safeRead(() => rec[propName]);
        if (typeof name !== 'string' || name === '') continue;
        const uid = molUidOf(safeRead(() => scene.getObjectByName(name)));
        if (uid !== undefined) return uid;
    }
    return undefined;
}
