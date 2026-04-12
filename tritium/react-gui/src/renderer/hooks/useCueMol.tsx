import React, { useState, useContext, useEffect, useMemo } from 'react'
import { AsyncCueMol } from '../worker/AsyncCueMol'
import { createAndInitCueMol } from '../createAndInitCueMol'

interface CueMolContextValue {
  cueMolReady: boolean
  cm: AsyncCueMol | null
}

const CueMolContext = React.createContext<CueMolContextValue | null>(null)

export function useCueMol(): CueMolContextValue {
  const ctx = useContext(CueMolContext)
  if (!ctx) throw new Error('useCueMol must be used inside CueMolProvider')
  return ctx
}

export function CueMolProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [cm, setCm] = useState<AsyncCueMol | null>(null)

  useEffect(() => {
    let instance: AsyncCueMol | null = null
    let cancelled = false
    ;(async () => {
      instance = await createAndInitCueMol()
      if (!cancelled) setCm(instance)
    })()
    return () => {
      cancelled = true
      instance?.terminateWorker()
    }
  }, [])

  const value = useMemo<CueMolContextValue>(
    () => ({ cueMolReady: cm !== null, cm }),
    [cm]
  )

  return <CueMolContext.Provider value={value}>{children}</CueMolContext.Provider>
}
