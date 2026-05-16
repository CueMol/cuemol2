/**
 * @file contexts/composeProviders.tsx
 * @description Compose a flat array of children-only Provider components
 * into a single Provider, replacing manually-nested `<A><B><C>...` JSX.
 *
 * The first entry is the outermost Provider, the last entry is innermost.
 * Call once at module scope; the returned component is stable across
 * renders.
 */

import React from 'react'

type ChildrenOnlyProvider = React.ComponentType<{ children: React.ReactNode }>

export const composeProviders = (
  providers: ChildrenOnlyProvider[],
): React.FC<{ children: React.ReactNode }> => {
  const Composed: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    providers.reduceRight<React.ReactElement>(
      (child, Provider) => <Provider>{child}</Provider>,
      <>{children}</>,
    )
  return Composed
}
