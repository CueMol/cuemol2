/**
 * @file plugin-host/openPluginSettings.ts
 * @description Open Settings at a plugin's own page.
 */

import { useCallback } from 'react'
import { CmdId } from '@renderer/commands/ids'
import { useCommands } from '@renderer/commands/CommandRegistry'
import {
  PLUGINS_PARENT_CATEGORY,
  pluginSettingCategory,
} from '@renderer/features/settings/settings/pluginSettings'
import { selectSettingsCategory } from '@renderer/features/settings/settings/useSettingsPaneNav'

/** A function that opens the Settings tab at `pluginId`'s page. */
export function useOpenPluginSettings(pluginId: string): () => void {
  const { dispatch } = useCommands()
  return useCallback(() => {
    selectSettingsCategory(pluginSettingCategory(pluginId), PLUGINS_PARENT_CATEGORY)
    void dispatch(CmdId.UiSettingsTab)
  }, [dispatch, pluginId])
}
