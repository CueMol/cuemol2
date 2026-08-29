/**
 * @file state/sceneTree/commands/SceneTreeCommands.tsx
 * @description Registers every scene-tree command handler.
 *
 * Mounted by `SceneTreeProvider`, which is the only place holding both the
 * tree operations and the active scene these need. It renders nothing.
 */

import React from 'react'
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol'
import type { UseSceneTreeResult } from '@renderer/hooks/useSceneTree'
import { useSceneNodeCommands } from './useSceneNodeCommands'
import { useRendererCommands } from './useRendererCommands'
import { useStyleCommands } from './useStyleCommands'
import { useCameraCommands } from './useCameraCommands'
import type { SceneNewFlows } from './useSceneNewFlows'

export interface SceneTreeCommandsProps extends SceneNewFlows {
  cm: AsyncCueMol | null
  sceneId: number | undefined
  activeViewId: number | undefined
  scene: UseSceneTreeResult
  beginInlineRename: (id: string) => void
}

export const SceneTreeCommands: React.FC<SceneTreeCommandsProps> = ({
  cm,
  sceneId,
  activeViewId,
  scene,
  beginInlineRename,
  openNewRendererFlow,
  openNewCameraFlow,
}) => {
  useSceneNodeCommands({ scene, beginInlineRename })
  useRendererCommands({ cm, sceneId, scene, openNewRendererFlow })
  useStyleCommands({ cm, sceneId, scene })
  useCameraCommands({ cm, sceneId, activeViewId, scene, openNewCameraFlow })
  return null
}
