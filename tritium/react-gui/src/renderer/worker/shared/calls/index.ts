/**
 * @file worker/shared/calls/index.ts
 * @description Typed contract for the renderer <-> Web Worker boundary.
 *
 * Three categories of calls flow over the same wire (`postMessage` with
 * `[method, seqno, ...args]`) but have distinct dispatch semantics on the
 * worker side; we mirror that split with three maps:
 *
 *   - ServiceMap  -> business-logic services registered via `register(name, fn)`.
 *                   Wire form: `invokeService(name, args)`. Worker side:
 *                   `fn(ctx, args[0])` (single-arg).
 *   - MethodMap   -> infrastructure / hot-path methods declared in
 *                   `WorkerService._methods`. Wire form:
 *                   `invokeMethod(name, ...positional)`. Worker side:
 *                   `fn.apply(this, args)` (variadic).
 *   - RpcMap      -> class-registry query handlers (hasClass,
 *                   getAllClassNamesJSON). Same variadic dispatch as
 *                   MethodMap, kept separate to document the query intent.
 *
 * `ServiceMap` is assembled from one slice per domain (`./scene`, `./anim`,
 * ...) so that adding a service touches only its own domain's file instead of
 * the one file every domain shares. Two keys with the same name in different
 * slices is a compile error here (`extends` cannot merge conflicting members),
 * and `index.test.ts` checks the slices against the worker's registry.
 *
 * Adding a service: add a row (and its key) to the right slice, then implement
 * it on the worker side. Type-checking flows from here outward.
 */

import { APP_KEYS, type AppCalls } from './app'
import { SCENE_KEYS, type SceneCalls } from './scene'
import { UNDO_KEYS, type UndoCalls } from './undo'
import { SCENE_TREE_KEYS, type SceneTreeCalls } from './sceneTree'
import { PROPS_KEYS, type PropsCalls } from './props'
import { FILE_KEYS, type FileCalls } from './file'
import { RENDER_KEYS, type RenderCalls } from './render'
import { VIEW_KEYS, type ViewCalls } from './view'
import { COLOR_KEYS, type ColorCalls } from './color'
import { COLORING_KEYS, type ColoringCalls } from './coloring'
import { REND_KEYS, type RendCalls } from './rend'
import { STYLE_KEYS, type StyleCalls } from './style'
import { CAMERA_KEYS, type CameraCalls } from './camera'
import { SELECT_KEYS, type SelectCalls } from './select'
import { NAVI_KEYS, type NaviCalls } from './navi'
import { MOLOPS_KEYS, type MolopsCalls } from './molops'
import { APBS_KEYS, type ApbsCalls } from './apbs'
import { MAP_KEYS, type MapCalls } from './map'
import { ANIM_KEYS, type AnimCalls } from './anim'
import { TRAJ_KEYS, type TrajCalls } from './traj'

export * from './methods'
export type { AppCalls, SceneCalls, UndoCalls, SceneTreeCalls, PropsCalls, FileCalls, RenderCalls, ViewCalls, ColorCalls, ColoringCalls, RendCalls, StyleCalls, CameraCalls, SelectCalls, NaviCalls, MolopsCalls, ApbsCalls, MapCalls, AnimCalls, TrajCalls }
export { APP_KEYS, SCENE_KEYS, UNDO_KEYS, SCENE_TREE_KEYS, PROPS_KEYS, FILE_KEYS, RENDER_KEYS, VIEW_KEYS, COLOR_KEYS, COLORING_KEYS, REND_KEYS, STYLE_KEYS, CAMERA_KEYS, SELECT_KEYS, NAVI_KEYS, MOLOPS_KEYS, APBS_KEYS, MAP_KEYS, ANIM_KEYS, TRAJ_KEYS }

import type { WorkerContext } from '@renderer/worker/server/types/WorkerContext'

export interface ServiceMap
  extends AppCalls,
    SceneCalls,
    UndoCalls,
    SceneTreeCalls,
    PropsCalls,
    FileCalls,
    RenderCalls,
    ViewCalls,
    ColorCalls,
    ColoringCalls,
    RendCalls,
    StyleCalls,
    CameraCalls,
    SelectCalls,
    NaviCalls,
    MolopsCalls,
    ApbsCalls,
    MapCalls,
    AnimCalls,
    TrajCalls {}

export type ServiceKey = keyof ServiceMap
export type ServiceArgs<K extends ServiceKey> = ServiceMap[K]['args']
export type ServiceResult<K extends ServiceKey> = ServiceMap[K]['result']

/** Worker-side service implementation signature. */
export type ServiceFn<K extends ServiceKey> = (
  ctx: WorkerContext,
  args: ServiceArgs<K>,
) => ServiceResult<K> | Promise<ServiceResult<K>>

/** Every service key as a value, in slice order. */
export const ALL_SERVICE_KEYS = [
  ...APP_KEYS,
  ...SCENE_KEYS,
  ...UNDO_KEYS,
  ...SCENE_TREE_KEYS,
  ...PROPS_KEYS,
  ...FILE_KEYS,
  ...RENDER_KEYS,
  ...VIEW_KEYS,
  ...COLOR_KEYS,
  ...COLORING_KEYS,
  ...REND_KEYS,
  ...STYLE_KEYS,
  ...CAMERA_KEYS,
  ...SELECT_KEYS,
  ...NAVI_KEYS,
  ...MOLOPS_KEYS,
  ...APBS_KEYS,
  ...MAP_KEYS,
  ...ANIM_KEYS,
  ...TRAJ_KEYS,
] as const

/**
 * Compile-time cover check: a key present in `ServiceMap` but missing from
 * `ALL_SERVICE_KEYS` (or vice versa) makes this alias `never`, which the
 * assignment below rejects.
 */
type KeysAreCovered =
  [ServiceKey] extends [(typeof ALL_SERVICE_KEYS)[number]]
    ? [(typeof ALL_SERVICE_KEYS)[number]] extends [ServiceKey]
      ? true
      : never
    : never
const _keysAreCovered: KeysAreCovered = true
void _keysAreCovered
