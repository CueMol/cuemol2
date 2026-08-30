/**
 * @file worker/server/services/anim/targets.ts
 * @description What an element can be pointed at.
 *
 * The inspector offers the scene's renderers, cameras and molecules as
 * choices; this reads them out of the live scene each time it is asked, so a
 * list cannot go stale behind an open inspector.
 */
import type { WorkerContext } from "@renderer/worker/server/types/WorkerContext";
import { getSceneOrNull } from "@renderer/worker/server/services/helpers/sceneResolver";
import type {
  AnimCameraOption,
  AnimMolOption,
  AnimRendererOption,
  GetAnimTargetOptionsArgs,
  GetAnimTargetOptionsResult,
} from "./types";
import { parseSceneTreeJSON, type SceneTreeNode } from "@renderer/worker/shared/sceneTreeTypes";
// --- detail shapes ---

/** Recurse renderer groups, collecting leaf renderers under `objName`. */
function collectRenderers(
  node: SceneTreeNode,
  objName: string,
  out: AnimRendererOption[],
): void {
  for (const child of node.children ?? []) {
    if (child.type === "renderer") {
      if (child.name) out.push({ name: child.name, objName, type: child.className ?? "" });
    } else if (child.type === "rendGroup") {
      collectRenderers(child, objName, out);
    }
  }
}

/** List renderer / camera / mol names for the target-picker dropdowns. */
export function getAnimTargetOptions(
  ctx: WorkerContext,
  args: GetAnimTargetOptionsArgs,
): GetAnimTargetOptionsResult {
  const empty: GetAnimTargetOptionsResult = {
    ok: false,
    renderers: [],
    cameras: [],
    mols: [],
  };
  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return empty;

  const renderers: AnimRendererOption[] = [];
  const mols: AnimMolOption[] = [];
  let tree: SceneTreeNode | null = null;
  try {
    tree = parseSceneTreeJSON(scene.getSceneDataJSON());
  } catch {
    tree = null;
  }
  if (tree) {
    for (const objNode of tree.children ?? []) {
      if (objNode.type !== "object") continue;
      if (objNode.className === "MorphMol") mols.push({ name: objNode.name });
      collectRenderers(objNode, objNode.name, renderers);
    }
  }

  const cameras: AnimCameraOption[] = [];
  try {
    const arr = JSON.parse(scene.getCameraInfoJSON()) as Array<{ name?: string }>;
    for (const c of arr) {
      if (c?.name) cameras.push({ name: c.name });
    }
  } catch {
    /* no cameras */
  }

  return { ok: true, renderers, cameras, mols };
}
