/**
 * Degrade-detection test for useNewSceneAction (the shared
 * "create scene + view + register tab" entry shared by useAppInitialization
 * and useNewTabCommand). Mirrors the contract that UXP's onNewScene held:
 *
 *   1. Without a name -> asks the worker for the default ("Untitled N") via
 *      proposeNewTabNames, then forwards that name to createNewSceneAndView
 *      and registers the tab using the same name (no "Scene <uid>" string).
 *   2. With an explicit name -> skips proposeNewTabNames and forwards the name
 *      directly.
 *   3. The bindView option flows through to createNewSceneAndView so the
 *      launch path can opt out (canvas not yet bound).
 */

import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import type { AsyncCueMol } from '../worker/client/AsyncCueMol'
import { useNewSceneAction } from '../hooks/useNewSceneAction'
import { makeRenderHook, flushPromises } from './helpers/testHarness'

void React

vi.mock('@cuemol/core/src/wrappers/wrapper-loader', () => ({ wrapper_map: {} }))
vi.mock('@cuemol/core/src/BaseWrapper', () => ({ BaseWrapper: class {} }))

interface MockCm {
  // After the apis/* facade collapse, `proposeNewTabNames` is reached via
  // `cm.invokeService('proposeNewTabNames', {})`. `createNewSceneAndView`
  // keeps its dedicated facade method (default-on-failure unwrap).
  invokeService: ReturnType<typeof vi.fn>
  createNewSceneAndView: ReturnType<typeof vi.fn>
}

const defaultTabNames = {
  currentSceneName: null,
  defaultSceneName: 'Untitled 1',
  defaultViewName: '1',
}

function makeMockCm(overrides: { tabNames?: unknown } = {}): MockCm {
  return {
    invokeService: vi.fn(async (name: string, _args: unknown) =>
      name === 'proposeNewTabNames' ? (overrides.tabNames ?? defaultTabNames) : undefined,
    ),
    createNewSceneAndView: vi.fn().mockImplementation(async (_dpr: number, name?: string) => ({
      scene_uid: 10,
      view_uid: 20,
      scene_name: name ?? '',
      view_name: '0',
    })),
  }
}

/** Recorded `invokeService` payloads for a given service name. */
function callsFor(cm: MockCm, name: string): unknown[] {
  return cm.invokeService.mock.calls
    .filter((c) => c[0] === name)
    .map((c) => c[1])
}

describe('useNewSceneAction', () => {
  it('without name: fetches default and registers tab as "<scene>:<view>"', async () => {
    const cm = makeMockCm()
    const addMolTab = vi.fn()
    const addMolViewTab = vi.fn()

    const h = makeRenderHook(() =>
      useNewSceneAction({
        cm: cm as unknown as AsyncCueMol,
        addMolTab,
        addMolViewTab,
      }),
    )

    let result: Awaited<ReturnType<typeof h.result>> | null = null
    await flushPromises()
    await (async () => {
      result = await h.result()
    })()

    expect(callsFor(cm, 'proposeNewTabNames')).toContainEqual({})
    expect(cm.createNewSceneAndView).toHaveBeenCalledWith(expect.any(Number), 'Untitled 1', undefined)
    expect(addMolTab).toHaveBeenCalledWith('Untitled 1:0', 20, 10)
    expect(addMolViewTab).toHaveBeenCalledWith('Untitled 1:0', 20)
    expect(result).toEqual({
      scene_uid: 10,
      view_uid: 20,
      scene_name: 'Untitled 1',
      view_name: '0',
      tab_title: 'Untitled 1:0',
    })

    h.unmount()
  })

  it('with explicit name: skips proposeNewTabNames and uses "<name>:0"', async () => {
    const cm = makeMockCm()
    const addMolTab = vi.fn()
    const addMolViewTab = vi.fn()

    const h = makeRenderHook(() =>
      useNewSceneAction({
        cm: cm as unknown as AsyncCueMol,
        addMolTab,
        addMolViewTab,
      }),
    )

    await flushPromises()
    await h.result({ name: 'MyScene' })

    expect(callsFor(cm, 'proposeNewTabNames')).toHaveLength(0)
    expect(cm.createNewSceneAndView).toHaveBeenCalledWith(expect.any(Number), 'MyScene', undefined)
    expect(addMolTab).toHaveBeenCalledWith('MyScene:0', 20, 10)
    expect(addMolViewTab).toHaveBeenCalledWith('MyScene:0', 20)

    h.unmount()
  })

  it('passes bindView=false to createNewSceneAndView (launch path)', async () => {
    const cm = makeMockCm()
    const addMolTab = vi.fn()
    const addMolViewTab = vi.fn()

    const h = makeRenderHook(() =>
      useNewSceneAction({
        cm: cm as unknown as AsyncCueMol,
        addMolTab,
        addMolViewTab,
      }),
    )

    await flushPromises()
    await h.result({ bindView: false })

    expect(cm.createNewSceneAndView).toHaveBeenCalledWith(expect.any(Number), 'Untitled 1', false)

    h.unmount()
  })

  it('returns null and skips tab registration when cm is null', async () => {
    const addMolTab = vi.fn()
    const addMolViewTab = vi.fn()

    const h = makeRenderHook(() =>
      useNewSceneAction({
        cm: null,
        addMolTab,
        addMolViewTab,
      }),
    )

    await flushPromises()
    const result = await h.result()

    expect(result).toBeNull()
    expect(addMolTab).not.toHaveBeenCalled()
    expect(addMolViewTab).not.toHaveBeenCalled()

    h.unmount()
  })
})
