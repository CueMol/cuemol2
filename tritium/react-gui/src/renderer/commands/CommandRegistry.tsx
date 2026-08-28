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
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react'
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

interface CommandRegistryValue {
  /** Register a typed handler for a command ID. Returns an unregister function. */
  register<K extends CommandKey>(id: K, handler: CommandHandler<K>): () => void
  /** Dispatch a command by ID. Rejects if the ID is not registered. */
  dispatch<K extends CommandKey>(
    id: K,
    ...args: CommandDispatchArgs<K>
  ): Promise<CommandResult<K>>
  /** Returns true if a handler is currently registered for id. */
  has(id: CommandKey): boolean
}

const CommandContext = createContext<CommandRegistryValue | null>(null)

export function CommandProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const map = useRef(new Map<CommandKey, AnyHandler>())

  const value = useMemo<CommandRegistryValue>(() => ({
    register<K extends CommandKey>(id: K, handler: CommandHandler<K>): () => void {
      if (map.current.has(id)) {
        console.warn(`[CommandRegistry] command "${id}" already registered - overwriting`)
      }
      map.current.set(id, handler as AnyHandler)
      return () => {
        if (map.current.get(id) === (handler as AnyHandler)) {
          map.current.delete(id)
        }
      }
    },

    dispatch<K extends CommandKey>(
      id: K,
      ...args: CommandDispatchArgs<K>
    ): Promise<CommandResult<K>> {
      const h = map.current.get(id)
      if (!h) return Promise.reject(new Error(`[CommandRegistry] unknown command: ${id}`))
      // Call inside the try so a handler that throws synchronously comes back
      // as a rejected promise. Callers attach `.catch(...)` to the return
      // value; a synchronous throw would bypass that and escape through
      // whatever invoked dispatch (an IPC push callback, a menu click).
      try {
        return Promise.resolve(h(args[0]) as CommandResult<K>)
      } catch (e) {
        return Promise.reject(e)
      }
    },

    has(id) { return map.current.has(id) },
  }), [])

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
