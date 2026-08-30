/**
 * @file worker/server/services/apbs/naming.ts
 * @description Naming the potential map a job produces.
 */
import type { Object as CueMolObject } from '@cuemol/core/src/wrappers/Object';
import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext';
import { type ProposeElepotNameArgs, type ProposeElepotNameResult } from '@renderer/worker/shared/apbsTypes';
import { getSceneOrNull } from '@renderer/worker/server/services/helpers/sceneResolver';
/**
 * Pick the first available name from `${prefix}`, `${prefix}(1)`, ... --
 * matches UXP `util.makeUniqName2` / `makeMolSurf.service` `uniqName`.
 */
export function uniqName(prefix: string, exists: (name: string) => boolean): string {
  if (!exists(prefix)) return prefix;
  for (let i = 1; i < 10000; i++) {
    const candidate = `${prefix}(${i})`;
    if (!exists(candidate)) return candidate;
  }
  return prefix;
}

/**
 * Suggest the default elepot-object name for a molecule -- a unique
 * `pot_<molname>`, mirroring UXP `makeSugName`. The dialog calls this to
 * prefill the name field when the target molecule changes.
 */
export function proposeElepotName(
  ctx: WorkerContext,
  args: ProposeElepotNameArgs,
): ProposeElepotNameResult {
  const scene = getSceneOrNull(ctx, args.sceneId);
  if (!scene) return { name: '' };
  const mol = scene.getObject(args.objId) as CueMolObject | null;
  if (!mol) return { name: '' };
  const molName = (mol as unknown as { name: string }).name ?? 'mol';
  return { name: uniqName(`pot_${molName}`, (n) => !!scene.getObjectByName(n)) };
}
