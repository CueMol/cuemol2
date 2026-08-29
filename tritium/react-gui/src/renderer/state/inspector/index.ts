/**
 * @file state/inspector/index.ts
 * @description The property inspector's target and property data.
 */

export { InspectorProvider, useInspector, useInspectorActions } from './InspectorProvider'
export type { InspectorTarget, NodeTarget, InspectorState, InspectorActions, PropWrite } from './InspectorProvider'
export { resolveNodeTarget } from './resolveNodeTarget'
