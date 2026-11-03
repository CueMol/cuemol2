/**
 * @file plugins/console/renderer/useDialectMetas.ts
 * @description The dialects the console speaks right now: native, and those of switched-on plugins.
 *
 * A dialect plugin declares its `DialectMeta` under the `console.dialect`
 * extension point; only switched-on plugins' entries reach here, so a
 * plugin switched off disappears from the panel's switch, its history and
 * `tritium_cli` (whose endpoint checks against this list). A value without
 * a meta's shape is skipped.
 */

import { useMemo } from 'react'
import { usePluginExtensions } from '@renderer/plugin-host/api'
import { DIALECT_EXTENSION, isDialectMeta, NATIVE_META } from '../shared/dialectMeta'
import type { DialectMeta } from '../shared/dialectMeta'

export function useDialectMetas(): readonly DialectMeta[] {
  const contributed = usePluginExtensions(DIALECT_EXTENSION)
  return useMemo(() => {
    const out: DialectMeta[] = [NATIVE_META]
    for (const v of contributed) if (isDialectMeta(v) && !out.some((m) => m.id === v.id)) out.push(v)
    return out
  }, [contributed])
}
