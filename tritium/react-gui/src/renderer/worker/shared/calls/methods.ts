/**
 * @file worker/shared/calls/methods.ts
 * @description The two variadic dispatch tables and the DOM-event shapes
 * they carry.
 *
 * `MethodMap` and `RpcMap` are dispatched as `fn.apply(this, args)` on the
 * worker side, unlike the single-arg services in the sibling slices -- see
 * `calls/index.ts` for the split.
 */

// -
// Serialized DOM events (worker side cannot read live DOM events)
// -

/** Mouse event fields that inputApi forwards to the worker. */
export interface SerializedMouseEvent {
  clientX: number; clientY: number
  screenX: number; screenY: number
  offsetX: number; offsetY: number
  buttons: number; button: number
  ctrlKey: boolean; shiftKey: boolean
}

/** Wheel event fields that inputApi forwards to the worker. */
export interface SerializedWheelEvent {
  offsetX: number; offsetY: number
  screenX: number; screenY: number
  deltaX: number; deltaY: number
  ctrlKey: boolean; shiftKey: boolean; altKey: boolean
}

/** Synthetic gesture event built by inputApi (axisID + delta). */
export interface SerializedGestureEvent {
  offsetX: number; offsetY: number
  screenX: number; screenY: number
  ctrlKey: boolean; shiftKey: boolean; altKey: boolean
  axisID: number; delta: number
}

// -
// MethodMap (infrastructure / hot-path -- `_methods` table)
// -

export interface MethodMap {
  initCueMol:              { args: [loadPath?: string];                                                    result: boolean }
  loadUserStyle:           { args: [userStylePath?: string];                                               result: boolean }
  saveUserStyle:           { args: [userStylePath: string];                                                result: boolean }
  setViewInputConfigStyle: { args: [styleName: string];                                                    result: boolean }
  terminateWorker:         { args: [];                                                                      result: void }
  addEventListener:        { args: [aCatStr: string, aSrcType: number, aEvtType: number, aSrcID: number]; result: number }
  removeEventListener:     { args: [nID: number];                                                           result: unknown }
  bindCanvas:              { args: [canvas: OffscreenCanvas, view_id: number, dpr: number, width: number, height: number]; result: boolean }
  addView:                 { args: [view_id: number, dpr: number];                                          result: boolean }
  activateView:            { args: [view_id: number];                                                       result: void }
  removeView:              { args: [view_id: number];                                                       result: boolean }
  resized:                 { args: [view_id: number, w: number, h: number, dpr: number];                   result: void }
  mouseDown:               { args: [view_id: number, event: SerializedMouseEvent];                         result: void }
  mouseUp:                 { args: [view_id: number, event: SerializedMouseEvent];                         result: void }
  mouseMove:               { args: [view_id: number, event: SerializedMouseEvent];                         result: void }
  wheel:                   { args: [view_id: number, event: SerializedWheelEvent];                         result: void }
  gesture:                 { args: [view_id: number, event: SerializedGestureEvent];                       result: void }
}

export type MethodKey = keyof MethodMap
export type MethodArgs<K extends MethodKey> = MethodMap[K]['args']
export type MethodResult<K extends MethodKey> = MethodMap[K]['result']

/** Worker-side method implementation signature (variadic positional). */
export type MethodFn<K extends MethodKey> = (
  ...args: MethodArgs<K>
) => MethodResult<K> | Promise<MethodResult<K>>

// -
// RpcMap (class-registry queries -- `_methods` table, dispatched as RPCs)
// -

export interface RpcMap {
  hasClass:             { args: [className: string];                                                  result: boolean }
  getAllClassNamesJSON: { args: [];                                                                    result: string }
}

export type RpcKey = keyof RpcMap
export type RpcArgs<K extends RpcKey> = RpcMap[K]['args']
export type RpcResult<K extends RpcKey> = RpcMap[K]['result']
