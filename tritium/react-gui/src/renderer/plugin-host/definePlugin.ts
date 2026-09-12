/**
 * @file plugin-host/definePlugin.ts
 * @description The declaration point of a plugin, and the checks that run on it.
 *
 * The manifest and the components it names are two halves of one thing, and
 * nothing in the type system ties them together: a manifest can declare a
 * pane whose component was never written, or a menu row pointing at a command
 * nobody registers. Those fail at mount as an empty pane or a dead menu row,
 * which reads as a bug in the shell rather than in the plugin. The checks
 * here name the plugin and the missing piece instead.
 */

import type { RendererPlugin } from './types'

const PLUGIN_ID_RE = /^[a-z][a-z0-9-]*$/

/**
 * Everything wrong with `plugin`, as messages.
 *
 * Exported separately from {@link definePlugin} so a test can assert on the
 * findings without reading the console.
 */
export function validatePlugin(plugin: RendererPlugin): string[] {
  const errors: string[] = []
  const { manifest } = plugin
  const id = manifest.id

  if (!PLUGIN_ID_RE.test(id)) {
    errors.push(`id "${id}" must be lower-case alphanumeric with dashes, starting with a letter`)
  }

  const contributes = manifest.contributes ?? {}
  const commandPrefix = `plugin.${id}.`
  const declared = new Set<string>()

  for (const cmd of contributes.commands ?? []) {
    if (!cmd.id.startsWith(commandPrefix)) {
      errors.push(`command "${cmd.id}" must start with "${commandPrefix}"`)
    }
    if (declared.has(cmd.id)) errors.push(`command "${cmd.id}" is declared twice`)
    declared.add(cmd.id)
  }

  const checkCommand = (command: string, where: string): void => {
    if (!declared.has(command)) {
      errors.push(`${where} names command "${command}", which contributes.commands does not declare`)
    }
  }

  for (const menu of contributes.menus ?? []) {
    for (const item of menu.items) checkCommand(item.command, `menu item "${item.id}"`)
  }
  for (const group of contributes.toolbar ?? []) {
    for (const item of group.items) checkCommand(item.command, `toolbar item "${item.id}"`)
  }

  for (const view of contributes.views ?? []) {
    for (const pane of view.panes) {
      if (!plugin.panes?.[pane.id]) {
        errors.push(`view "${view.id}" declares pane "${pane.id}", which has no component`)
      }
    }
  }
  for (const tab of contributes.bottomTabs ?? []) {
    if (!plugin.bottomTabs?.[tab.id]) {
      errors.push(`bottom tab "${tab.id}" has no component`)
    }
  }

  return errors
}

/**
 * Declare a plugin.
 *
 * Reports every inconsistency between the manifest and the components, then
 * returns the plugin unchanged: a broken contribution is better shown as an
 * error the author can read than hidden by dropping it silently.
 *
 * Put a pure annotation on the call at the definition site (the built-in
 * plugins show the form). It only bites for a `devOnly` plugin: without it
 * the bundler has to assume the call matters and keeps the module, so the
 * `__DEV_UI__` branch in `plugins/index.ts` folds away the reference but
 * ships the plugin anyway.
 */
export function definePlugin(plugin: RendererPlugin): RendererPlugin {
  for (const message of validatePlugin(plugin)) {
    console.error(`[plugin:${plugin.manifest.id}] ${message}`)
  }
  return plugin
}
