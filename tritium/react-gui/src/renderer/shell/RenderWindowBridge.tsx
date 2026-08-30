/**
 * @file shell/RenderWindowBridge.tsx
 * @description Drives the modeless Rendering window from this renderer.
 *
 * All render UI lives in that window, but the CueMol worker exists only
 * here: the bridge owns the job lifecycle, executes commands relayed from
 * the window, and pushes job / target state back. It renders nothing, so
 * the tab-strip subscription its Target dropdown needs does not re-render
 * the chrome.
 */

import React, { useMemo } from 'react'
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol'
import { useRenderWindowBridge } from '@renderer/features/render/useRenderWindowBridge'
import { useRenderConfig } from '@renderer/contexts/RenderConfigContext'
import { useActiveScene, useWorkspaceDispatch, useWorkspaceTabs } from '@renderer/state/workspace'
import { useActiveViewValues } from '@renderer/state/activeView'

export const RenderWindowBridge: React.FC = () => {
  const { cm } = useCueMol()
  const { activateTab } = useWorkspaceDispatch()
  const { tabs, molViewEntries } = useWorkspaceTabs()
  const { activeMolViewId } = useActiveScene()
  const { exportAvailable } = useActiveViewValues()
  // Persistent render binary paths (POV-Ray / blendpng) from SettingsPane.
  const { binaries } = useRenderConfig()

  // Renderable targets offered in the render window's Target dropdown. The
  // scene name is the tab title minus its ":<viewIdx>" suffix; the entries
  // are the strip's own records, so a rename is already reflected here.
  const views = useMemo(
    () =>
      molViewEntries.map((e) => ({
        viewId: e.view_id,
        sceneId: e.scene_uid,
        sceneName: e.title.replace(/:\d+$/, ''),
        title: e.title,
      })),
    [molViewEntries],
  )

  useRenderWindowBridge({
    cm,
    views,
    activeViewId: activeMolViewId,
    tabs,
    setActiveTab: activateTab,
    binaries,
    // Scene-exporter availability is probed by ActiveViewStateProvider; the
    // umbreon capability is forwarded to the modeless render window.
    umbreonAvailable: exportAvailable?.includes('umbreon') ?? false,
  })

  return null
}
