/**
 * @file __test__/helpers/paneEnv.ts
 * @description Stand-in for the CueMol bridge and the active scene in pane
 * tests.
 *
 * The side panes read `cm` from `useCueMol()` and the active scene / view
 * from `useActiveScene()`. A test mocks both modules with the factories here
 * and wraps each mount in `withPaneEnv(cm, sceneId, viewId, <Pane />)`.
 */

export const paneEnv: {
  cm: unknown
  activeSceneId: number | undefined
  activeMolViewId: number | undefined
} = { cm: null, activeSceneId: undefined, activeMolViewId: undefined }

/** The `vi.mock` factory for `hooks/cuemol/useCueMol`. */
export function mockCueMolModule() {
  return { useCueMol: () => ({ cm: paneEnv.cm, cueMolReady: paneEnv.cm !== null }) }
}

/** The `vi.mock` factory for `state/workspace`. */
export function mockWorkspaceModule() {
  return {
    useActiveScene: () => ({
      activeSceneId: paneEnv.activeSceneId,
      activeMolViewId: paneEnv.activeMolViewId,
      hasScene: paneEnv.activeMolViewId !== undefined,
    }),
  }
}

/** Set the bridge and the active scene for the next mount; returns `element`. */
export function withPaneEnv<T>(
  cm: unknown,
  activeSceneId: number | undefined,
  activeMolViewId: number | undefined,
  element: T,
): T {
  paneEnv.cm = cm
  paneEnv.activeSceneId = activeSceneId
  paneEnv.activeMolViewId = activeMolViewId
  return element
}
