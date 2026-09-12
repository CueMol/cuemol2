/**
 * @file plugin-host/PluginRoots.tsx
 * @description Mounts the enabled plugins' roots.
 *
 * A plugin root renders no UI of its own: it is where the plugin registers
 * its command handlers and mounts its dialog providers. Mounting it here, a
 * sibling of `AppCommands`, means switching a plugin off unmounts both -- the
 * commands unregister themselves and the dialogs go with them -- without the
 * shell having to know what the plugin owns.
 *
 * Placed inside the app-state and dialog providers, so a plugin root may use
 * the active scene, the core dialogs and the command bus.
 */

import React from 'react'
import { usePlugins } from './PluginProvider'

export const PluginRoots: React.FC = () => {
  const { active } = usePlugins()
  return (
    <>
      {active.map((plugin) => {
        const Root = plugin.Root
        return Root ? <Root key={plugin.manifest.id} /> : null
      })}
    </>
  )
}
PluginRoots.displayName = 'PluginRoots'
