/**
 * @file commands/CommandRegistry.tsx
 * @description Minimal command registry backed by a React Context.
 *
 * Usage:
 *   - Wrap the app in <CommandProvider>.
 *   - Register handlers with useRegisterCommand(id, handler).
 *   - Dispatch commands with useCommands().dispatch(id, args).
 *
 * Type contracts come from `CommandMap`: each `CmdId` is paired with its
 * `args` and `result` types. `dispatch` and `register` are both generic over
 * the map, so the args / handler shape is enforced at every call site.
 *
 * Plugins use the same bus through `registerAny` / `dispatchAny`, which take
 * a string id. `CommandMap` stays closed -- a built-in id without a row is
 * still a compile error -- because the alternative is to give up that check
 * for every command in the app in order to accommodate a handful of plugin
 * ones. A plugin id is namespaced (`plugin.<pluginId>.<name>`) so the two
 * lanes cannot collide in the one map they share at runtime.
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import type { PluginCommandId } from '@shared/types/pluginContrib'
import type {
  CommandArgs,
  CommandDispatchArgs,
  CommandHandler,
  CommandKey,
  CommandResult,
} from './CommandMap'

// Erased handler shape stored in the per-id map (per-key types are enforced
// by the generic register / dispatch entry points).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (args: any) => any

/** Handler shape of the string-keyed (plugin) lane. */
type PluginHandler = (args?: unknown) => unknown

interface CommandRegistryValue {
  /** Register a typed handler for a command ID. Returns an unregister function. */
  register<K extends CommandKey>(id: K, handler: CommandHandler<K>): () => void
  /**
   * Register a plugin command. Returns an unregister function.
   *
   * Args and result are untyped here; the plugin types them at its own
   * `useRegisterPluginCommand` call site.
   */
  registerAny(id: PluginCommandId, handler: PluginHandler): () => void
  /** Dispatch a command by ID. Rejects if the ID is not registered. */
  dispatch<K extends CommandKey>(
    id: K,
    ...args: CommandDispatchArgs<K>
  ): Promise<CommandResult<K>>
  /**
   * Dispatch by string id. Rejects if the ID is not registered.
   *
   * For call sites that hold an id whose type is not known statically: a menu
   * row or a toolbar button that may name either a built-in command or a
   * plugin one.
   */
  dispatchAny(id: string, args?: unknown): Promise<unknown>
  /** Returns true if a handler is currently registered for id. */
  has(id: CommandKey | string): boolean
}

const CommandContext = createContext<CommandRegistryValue | null>(null)

export function CommandProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  // String-keyed: the built-in ids are a subset of the keys, narrowed by the
  // typed entry points rather than by the map itself.
  const map = useRef(new Map<string, AnyHandler>())

  const value = useMemo<CommandRegistryValue>(() => {
    const registerImpl = (id: string, handler: AnyHandler): (() => void) => {
      if (map.current.has(id)) {
        console.warn(`[CommandRegistry] command "${id}" already registered - overwriting`)
      }
      map.current.set(id, handler)
      return () => {
        if (map.current.get(id) === handler) {
          map.current.delete(id)
        }
      }
    }

    const dispatchImpl = (id: string, args: unknown): Promise<unknown> => {
      const h = map.current.get(id)
      if (!h) return Promise.reject(new Error(`[CommandRegistry] unknown command: ${id}`))
      // Call inside the try so a handler that throws synchronously comes back
      // as a rejected promise. Callers attach `.catch(...)` to the return
      // value; a synchronous throw would bypass that and escape through
      // whatever invoked dispatch (an IPC push callback, a menu click).
      try {
        return Promise.resolve(h(args))
      } catch (e) {
        return Promise.reject(e)
      }
    }

    return {
      register<K extends CommandKey>(id: K, handler: CommandHandler<K>): () => void {
        return registerImpl(id, handler as AnyHandler)
      },

      registerAny(id: PluginCommandId, handler: PluginHandler): () => void {
        return registerImpl(id, handler as AnyHandler)
      },

      dispatch<K extends CommandKey>(
        id: K,
        ...args: CommandDispatchArgs<K>
      ): Promise<CommandResult<K>> {
        return dispatchImpl(id, args[0]) as Promise<CommandResult<K>>
      },

      dispatchAny(id: string, args?: unknown): Promise<unknown> {
        return dispatchImpl(id, args)
      },

      has(id: string) { return map.current.has(id) },
    }
  }, [])

  return (
    <CommandContext.Provider value={value}>
      {children}
    </CommandContext.Provider>
  )
}

/** Returns the command registry. Must be used inside a <CommandProvider>. */
export function useCommands(): CommandRegistryValue {
  const ctx = useContext(CommandContext)
  if (!ctx) throw new Error('useCommands must be used inside <CommandProvider>')
  return ctx
}

/**
 * Registers a command handler for the lifetime of the calling component.
 *
 * The handler is stored in a ref so it always sees the latest closure
 * without requiring re-registration on every render.
 */
export function useRegisterCommand<K extends CommandKey>(
  id: K,
  handler: CommandHandler<K>,
): void {
  const ref = useRef<CommandHandler<K>>(handler)
  ref.current = handler

  const { register } = useCommands()

  useEffect(
    () => register(id, ((a: CommandArgs<K>) => ref.current(a)) as CommandHandler<K>),
    // register is stable (created once in useMemo); id changes trigger re-registration.
    [id, register],
  )
}
