import type { ViewCenterMark } from '../../shared/ipcTypes'
import type { AsyncCueMol } from '../worker/AsyncCueMol'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'

export function useViewCommands(opts: {
  cm: AsyncCueMol | null
  getActiveViewId: () => number | undefined
  onProjectionChanged?: (perspective: boolean) => void
  onCenterMarkChanged?: (centerMark: ViewCenterMark) => void
}): void {
  const { cm, getActiveViewId, onProjectionChanged, onCenterMarkChanged } = opts

  const setProjection = async (perspective: boolean): Promise<void> => {
    const viewId = getActiveViewId()
    if (!cm || viewId === undefined) return
    const result = await cm.setViewProjection(viewId, perspective)
    if (result?.ok) onProjectionChanged?.(result.perspective)
  }

  const setCenterMark = async (centerMark: ViewCenterMark): Promise<void> => {
    const viewId = getActiveViewId()
    if (!cm || viewId === undefined) return
    const result = await cm.setViewCenterMark(viewId, centerMark)
    if (result?.ok) onCenterMarkChanged?.(centerMark)
  }

  useRegisterCommand(CmdId.ViewPerspective, () => setProjection(true))
  useRegisterCommand(CmdId.ViewOrthographic, () => setProjection(false))
  useRegisterCommand(CmdId.ViewCenterMarkCross, () => setCenterMark('crosshair'))
  useRegisterCommand(CmdId.ViewCenterMarkAxis, () => setCenterMark('axis'))
  useRegisterCommand(CmdId.ViewCenterMarkNone, () => setCenterMark('none'))
}
