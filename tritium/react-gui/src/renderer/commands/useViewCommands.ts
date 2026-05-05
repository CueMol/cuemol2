import type { AsyncCueMol } from '../worker/AsyncCueMol'
import { useRegisterCommand } from './CommandRegistry'
import { CmdId } from './ids'

export function useViewCommands(opts: {
  cm: AsyncCueMol | null
  getActiveViewId: () => number | undefined
  onProjectionChanged?: (perspective: boolean) => void
}): void {
  const { cm, getActiveViewId, onProjectionChanged } = opts

  const setProjection = async (perspective: boolean): Promise<void> => {
    const viewId = getActiveViewId()
    if (!cm || viewId === undefined) return
    const result = await cm.setViewProjection(viewId, perspective)
    if (result?.ok) onProjectionChanged?.(result.perspective)
  }

  useRegisterCommand(CmdId.ViewPerspective, () => setProjection(true))
  useRegisterCommand(CmdId.ViewOrthographic, () => setProjection(false))
}
