/**
 * @file plugins/getpdb/renderer/useGetPdbCommand.ts
 * @description The Get PDB flow: ask for an accession code, then stream the
 * chosen files straight into the scene.
 *
 * Ordering follows the normal object-open flow. The target scene is resolved
 * only after the dialog is confirmed, so cancelling never leaves a stray
 * empty tab; the coordinate file goes through the same file-open option
 * dialog a local file would; the density maps skip it and take the worker's
 * preset contour colour and sigma (UXP `openMapImpl`), and a cryo-EM map the
 * cryo-EM default style at the EMDB author's recommended level.
 *
 * Downloads are streamed by `StreamManager.supplyDataAsync`, so nothing is
 * written to a temporary file. See
 * docs/migration/adr/ADR-0008-get-pdb-streaming.md.
 */

import {
  useCueMol,
  useEnsureActiveScene,
  useRegisterPluginCommand,
  useShowErrorAlert,
  useShowFileOpenOptionDialog,
  useStreamProgressDialog,
} from '@renderer/plugin-host/api'
import type { AsyncCueMol, StreamProgressApi } from '@renderer/plugin-host/api'
import { fetchPresetTypes } from '@renderer/features/file-io/fetchPresetTypes'
import type { Result } from '@renderer/worker/shared/result'
import { GET_PDB_COMMAND } from '../manifest'
import { useShowGetPdbDialog } from './GetPdbDialogProvider'
import type { EmMapRequest, MapServerType } from './GetPdbDialog'
import { pickEmdbMapUrl, pickMapUrl } from './pdbUrls'
import { structureFetch } from '@renderer/worker/shared/dbSources'
import { buildDefaultFormatOptions, formatKindForReader, getDefaultRendererOptions } from '@renderer/worker/shared/fileOpenDefaults'
import type { FileOpenOptions } from '@renderer/worker/shared/fileOpenTypes'
import { pushHistory as pushPdbIdHistory } from './pdbIdHistory'

/** A request id the progress events can be matched against. */
function makeReqId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `getpdb-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Show the streaming progress dialog, subscribe to progress events, invoke
 * the worker service, and tear everything down on the way out. Used by both
 * the coordinate and the density-map paths.
 */
async function streamWithProgress(
  cm: AsyncCueMol,
  streamProgress: StreamProgressApi,
  title: string,
  invoke: (reqId: string) => Promise<Result<object>>,
): Promise<Result<object>> {
  const reqId = makeReqId()
  streamProgress.show({
    title,
    onCancel: () => {
      cm.invokeService('cancelStreamLoad', { reqId })
        .catch((e: unknown) => console.warn('cancelStreamLoad invoke failed:', e))
    },
  })
  const unsub = cm.subscribeStreamProgress((id, bytes) => {
    if (id === reqId) streamProgress.update(bytes)
  })
  try {
    return await invoke(reqId)
  } finally {
    unsub()
    streamProgress.hide()
  }
}

/** How a PubChem compound opens: the reader's defaults, a ball-and-stick renderer, the view centred on it. */
function compoundOpenOptions(name: string, readerName: string): FileOpenOptions {
  return {
    format: buildDefaultFormatOptions(formatKindForReader(readerName)),
    renderer: { ...getDefaultRendererOptions(name, 'ballstick'), objectName: name, centerView: true },
  }
}

/** Register the Get PDB command for as long as the plugin is enabled. */
export function useGetPdbCommand(): void {
  const { cm } = useCueMol()
  const ensureActiveScene = useEnsureActiveScene()
  const showGetPdbDialog = useShowGetPdbDialog()
  const showFileOpenOptionDialog = useShowFileOpenOptionDialog()
  const showErrorAlert = useShowErrorAlert()
  const streamProgress = useStreamProgressDialog()

  useRegisterPluginCommand(GET_PDB_COMMAND, () => {
    if (!cm) return
    ;(async () => {
      const inputs = await showGetPdbDialog()
      if (!inputs) return

      // Resolve the target scene after the dialog is confirmed (so a cancel
      // never leaves a stray new tab), creating a new scene + view when none
      // is active.
      const info = await ensureActiveScene()
      if (!info) return

      // Persist the accepted ID to the dropdown history (LRU, dedup,
      // capped) so future invocations can quickly recall it.
      pushPdbIdHistory(inputs.entryId)
      // The maps below are a PDB / EMDB entry's; entryId is its accession then.
      const pdbid = inputs.entryId

      const tasks: Array<() => Promise<Result<object>>> = []

      // Coord task: same flow as Open File... + pre-resolved readerName.
      // The URL, reader and name come from the source table, as fetch_entry's do.
      const coordFetch = inputs.coord ? structureFetch(inputs.coord.source, inputs.entryId, inputs.coord.format) : null
      if (coordFetch && !coordFetch.ok) {
        await showErrorAlert({ title: 'Get PDB failed', message: coordFetch.error })
      } else if (coordFetch && inputs.coord) {
        const { source, format } = inputs.coord
        const { url, readerName, gzip, name } = coordFetch.spec
        const virtualFilename = `${name}.${readerName === 'mmcif' ? 'cif' : readerName}`
        // Pass readerName explicitly so the renderer-list lookup matches the
        // load reader. Skipping it re-introduces the .cif ambiguity
        // (mmcifmap wins by JSON order).
        const { types: rendererTypes, objType } = await cm.getCompatibleRendererNames(
          virtualFilename,
          readerName,
        )
        if (!rendererTypes || rendererTypes.length === 0) {
          console.warn(`Get PDB: no compatible renderer for ${virtualFilename}`)
          await showErrorAlert({
            title: 'Get PDB failed',
            message:
              `Could not find a compatible reader for the requested entry:\n${virtualFilename}\n\n` +
              'The selected server type may not provide this entry, or the format is unsupported.',
          })
        } else {
          // A PubChem compound is one small molecule: drawn as ball-and-stick
          // and centred on, without asking how.
          const options = source === 'pubchem'
            ? compoundOpenOptions(name, readerName)
            : await showFileOpenOptionDialog({
                filePath: virtualFilename,
                sceneId: info.scene_uid,
                rendererTypes,
                presetTypes: await fetchPresetTypes(cm, info.scene_uid, objType),
                objType,
                readerName,
              })
          if (options !== null) {
            tasks.push(() =>
              streamWithProgress(cm, streamProgress, `Downloading ${name}...`, (reqId) =>
                cm.invokeService('streamLoadFromUrl', {
                  reqId,
                  url,
                  readerName,
                  objectName: name,
                  sceneId: info.scene_uid,
                  options,
                  gzip,
                  // The RCSB keeps being recorded as fetch_pdb, with the reader
                  // options read here; another source as fetch_entry.
                  ...(source === 'pdb' ? {} : { entry: { source, id: inputs.entryId, format, defaultName: name } }),
                }),
              ),
            )
          }
        }
      }

      // 2Fo-Fc / Fo-Fc tasks: skip FileOpenOptionDialog, use preset contour
      // color/sigma in the worker (UXP openMapImpl).
      const buildMapTask = (server: MapServerType, mapType: '2fofc' | 'fofc') => {
        const { url, readerName, gzip } = pickMapUrl(pdbid, server, mapType)
        const objectName = `${pdbid}_${mapType}`
        return () =>
          streamWithProgress(cm, streamProgress, `Downloading ${objectName}...`, (reqId) =>
            cm.invokeService('streamLoadDensityMap', {
              reqId,
              url,
              readerName,
              gzip,
              mapType,
              objectName,
              sceneId: info.scene_uid,
              viewId: info.view_id,
            }),
          )
      }
      if (inputs.map2fofc) tasks.push(buildMapTask(inputs.map2fofc.serverType, '2fofc'))
      if (inputs.mapFofc) tasks.push(buildMapTask(inputs.mapFofc.serverType, 'fofc'))

      // EMDB maps: also no option dialog; the worker marks the map cryo-EM and
      // draws it at the recommended level the dialog read from EMDB.
      const buildEmMapTask = (req: EmMapRequest) => {
        const num = req.emdbId.replace(/^EMD-/i, '')
        const { url, readerName, gzip } = pickEmdbMapUrl(num, req.serverType)
        const objectName = `emd_${num}`
        return () =>
          streamWithProgress(cm, streamProgress, `Downloading ${req.emdbId}...`, (reqId) =>
            cm.invokeService('streamLoadDensityMap', {
              reqId,
              url,
              readerName,
              gzip,
              mapType: 'em',
              objectName,
              contourLevel: req.contourLevel,
              sceneId: info.scene_uid,
              viewId: info.view_id,
            }),
          )
      }
      for (const req of inputs.emMaps) tasks.push(buildEmMapTask(req))

      // Run sequentially. Stop the chain on user cancel or on any failure.
      // Failures arrive as a Result now (never a rejection): the try/catch
      // below is for genuine bugs only.
      for (const task of tasks) {
        try {
          const result = await task()
          if (result.ok) continue
          if (result.code === 'canceled') break
          console.error('Get PDB chain item failed:', result.error)
          await showErrorAlert({
            title: 'Get PDB failed',
            message: `A download or load step failed:\n\n${result.error}`,
          })
          break
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('Get PDB chain item threw:', e)
          await showErrorAlert({
            title: 'Get PDB failed',
            message: `A download or load step failed:\n\n${msg}`,
          })
          break
        }
      }
    })().catch(async (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('Get PDB handler failed:', e)
      await showErrorAlert({ title: 'Get PDB failed', message: msg })
    })
  })
}
