/**
 * @file commands/CommandRegistry.tsx
 * @description Minimal command registry backed by a React Context.
 *
 * Usage:
 *   - Wrap the app in <CommandProvider>.
 *   - Register handlers with useRegisterCommand(id, handler).
 *   - Dispatch commands with useCommands().dispatch(id, args).
 */

import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandHandler<A = unknown, R = unknown> = (args?: A) => R | Promise<R>

interface CommandRegistryValue {
  /** Register a handler for a command ID. Returns an unregister function. */
  register(id: string, handler: CommandHandler): () => void
  /** Dispatch a command by ID. Rejects if the ID is not registered. */
  dispatch<A = unknown, R = unknown>(id: string, args?: A): Promise<R>
  /** Returns true if a handler is currently registered for id. */
  has(id: string): boolean
}

const CommandContext = createContext<CommandRegistryValue | null>(null)

export function CommandProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const map = useRef(new Map<string, CommandHandler>())

  const value = useMemo<CommandRegistryValue>(() => ({
    register(id, handler) {
      if (map.current.has(id)) {
        console.warn(`[CommandRegistry] command "${id}" already registered - overwriting`)
      }
      map.current.set(id, handler)
      return () => {
        if (map.current.get(id) === handler) {
          map.current.delete(id)
        }
      }
    },

    dispatch<A, R>(id: string, args?: A): Promise<R> {
      const h = map.current.get(id)
      if (!h) return Promise.reject(new Error(`[CommandRegistry] unknown command: ${id}`))
      return Promise.resolve(h(args) as R)
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
export function useRegisterCommand<A = unknown, R = unknown>(
  id: string,
  handler: CommandHandler<A, R>,
): void {
  const ref = useRef<CommandHandler<A, R>>(handler)
  ref.current = handler

  const { register } = useCommands()

  useEffect(
    () => register(id, ((a) => ref.current(a as A)) as CommandHandler),
    // register is stable (created once in useMemo); id changes trigger re-registration.
    [id, register],
  )
}
