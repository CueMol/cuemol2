/**
 * @file plugin-host/usePluginCommand.ts
 * @description Registering a plugin command on the shared command bus.
 *
 * The mirror of `useRegisterCommand` for the string-keyed lane. Built-in
 * commands stay in the closed `CommandMap` (a missing row is still a compile
 * error there); a plugin id cannot join that map, so its args and result are
 * typed by the plugin itself through this hook's type parameters.
 */

import { useEffect, useRef } from 'react'
import { useCommands } from '@renderer/commands/CommandRegistry'
import type { PluginCommandId } from '@shared/types/pluginContrib'

/**
 * Register `handler` for `id` while the calling component is mounted.
 *
 * The handler is held in a ref, so it always sees the latest closure without
 * re-registering -- the same contract `useRegisterCommand` gives built-ins.
 */
export function useRegisterPluginCommand<TArgs = void, TResult = void>(
  id: PluginCommandId,
  handler: (args: TArgs) => TResult | Promise<TResult>,
): void {
  const ref = useRef(handler)
  ref.current = handler

  const { registerAny } = useCommands()

  useEffect(
    () => registerAny(id, (args) => ref.current(args as TArgs)),
    // registerAny is stable (created once in useMemo).
    [id, registerAny],
  )
}
