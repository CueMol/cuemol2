/**
 * @file renderer/event.ts
 * @description CueMol event-manager filter constants, re-exported.
 *
 * The definitions live in `worker/shared/eventConst.ts` because the worker
 * names them too; this module is the renderer-side spelling that the hooks
 * import.
 */

export * from './worker/shared/eventConst';
