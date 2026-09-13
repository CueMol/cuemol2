/**
 * @file plugins/mdtools/renderer/useOpenMdTrajCommand.ts
 * @description The Open MD Trajectory flow: collect the files, pick the
 * initial renderer, then load everything in one undo txn.
 *
 * Two-step and deferred: the first dialog only collects a topology file plus
 * an ordered list of trajectory files, and the C++ load runs after the
 * renderer dialog is confirmed as well. Cancelling either one therefore loads
 * nothing, which is what the normal object-open flow does. The target scene is
 * resolved between the two, so a cancel before that leaves no stray empty tab.
 */

import {
  useCueMol,
  useEnsureActiveScene,
  useRegisterPluginCommand,
  useShowErrorAlert,
  useShowNewRendererDialog,
} from '@renderer/plugin-host/api'
import { mdtoolsServices } from '../calls'
import { OPEN_MD_TRAJ_COMMAND } from '../manifest'
import { useShowOpenMdTrajDialog } from './OpenMdTrajDialogProvider'

/** Object name fallback: the topology file's stem. */
function topologyStem(topologyPath: string): string {
  return topologyPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'trajectory'
}

/** Registers the plugin's open command. Call inside the dialog provider. */
export function useOpenMdTrajCommand(): void {
  const { cm } = useCueMol()
  const showOpenMdTrajDialog = useShowOpenMdTrajDialog()
  const showNewRendererDialog = useShowNewRendererDialog()
  const showErrorAlert = useShowErrorAlert()
  const ensureActiveScene = useEnsureActiveScene()

  useRegisterPluginCommand(OPEN_MD_TRAJ_COMMAND, () => {
    if (!cm) return
    ;(async () => {
      try {
        const picked = await showOpenMdTrajDialog({})
        if (!picked) return
        // Resolve/create the target scene only after files are chosen,
        // mirroring OpenObjByPath (no stray tab on cancel-before-this).
        const info = await ensureActiveScene()
        if (!info) return
        // Compatible renderers for a Trajectory object -- probes an empty
        // Trajectory, no file is loaded yet.
        const rendInfo = await mdtoolsServices.invoke(cm, 'getTrajectoryRendererInfo', {})
        if (rendInfo.types.length === 0) {
          await showErrorAlert({
            title: 'Cannot open trajectory',
            message: 'No compatible renderer was found for Trajectory objects.',
          })
          return
        }
        const rend = await showNewRendererDialog({
          sceneId: info.scene_uid,
          objName: topologyStem(picked.topologyPath),
          objClassName: rendInfo.objClassName || 'Trajectory',
          rendererTypes: rendInfo.types,
          defaultName: '',
          isMol: true,
        })
        if (!rend) return
        const loaded = await mdtoolsServices.invoke(cm, 'loadTrajectory', {
          sceneId: info.scene_uid,
          topologyPath: picked.topologyPath,
          trajPaths: picked.trajPaths,
          nevery: picked.nevery,
          renderer: rend.rendOpts,
        })
        if (!loaded.ok) {
          await showErrorAlert({
            title: 'Open MD Trajectory failed',
            message: `Failed to open trajectory:\n${loaded.error}`,
          })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('OpenMdTraj failed:', e)
        await showErrorAlert({
          title: 'Open MD Trajectory failed',
          message: `Failed to open trajectory:\n${msg}`,
        })
      }
    })()
  })
}
