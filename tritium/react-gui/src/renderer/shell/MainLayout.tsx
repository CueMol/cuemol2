/**
 * @file shell/MainLayout.tsx
 * @description The resizable frame: activity bar, sidebar, centre column
 * and inspector.
 *
 * Owns which activity-bar view is showing and mirrors Allotment's
 * snap-collapses back into that state. The splitter sizes themselves are
 * write-only from here (state/layout stores them in a ref and persists on a
 * debounce), so a drag re-renders nothing.
 */

import React, { useCallback, useState } from 'react'
import { Allotment } from 'allotment'
import 'allotment/dist/style.css'

import { ActivityBar, type ActivityView } from './ActivityBar'
import { SidePanel } from './SidePanel'
import { ContentArea } from './ContentArea'
import { BottomPanel } from './BottomPanel'
import { InspectorPanel } from '@renderer/features/inspector/InspectorPanel'
import { useLayout, useLayoutDispatch } from '@renderer/state/layout'
import { useInspector } from '@renderer/state/inspector'

export const MainLayout: React.FC = () => {
  const { loaded, inspectorOpen, savedSizes } = useLayout()
  const { setMainSizes, setRightPanelSizes, setCenterSizes, setInspectorOpen } =
    useLayoutDispatch()
  const inspectorHasTarget = useInspector().target !== null

  const [activeView, setActiveView] = useState<ActivityView | null>('explorer')

  const handleActivitySelect = useCallback((view: ActivityView) => {
    setActiveView((prev) => (prev === view ? null : view))
  }, [])

  /**
   * Mirror a snap-driven collapse/reopen of the sidebar pane into
   * `activeView`, the source of truth for its controlled `visible` prop.
   *
   * Allotment's onVisibleChange cannot be used for this: it is only
   * emitted on drag end, but onChange re-renders the parent during the
   * drag and allotment's controlled-visible sync effect restores the pane
   * to the stale prop value first, so the drag-collapse never sticks and
   * onVisibleChange never fires (verified against allotment 1.20.2).
   * Instead detect the collapse from the sizes onChange reports: a
   * snapped-hidden pane has size 0, and a hidden pane can never report a
   * non-zero size (its maximumSize is 0 while hidden).
   */
  const handleMainSizesChange = useCallback(
    (sizes: number[]) => {
      setMainSizes(sizes)
      // All-zero sizes mean the container itself has no layout yet; that
      // must not be mistaken for a collapsed sidebar.
      if (sizes[0] === undefined || !sizes.some((s) => s > 0)) return
      setActiveView((prev) => (sizes[0] > 0 ? (prev ?? 'explorer') : null))
    },
    [setMainSizes],
  )

  /**
   * Same snap-collapse mirroring for the inspector pane. Only the open flag
   * is mirrored; the inspector target is kept so a drag-hide / drag-show
   * round trip restores the same content. The equality guard keeps the
   * per-drag-event onChange stream from re-persisting an unchanged flag.
   */
  const handleRightPanelSizesChange = useCallback(
    (sizes: number[]) => {
      setRightPanelSizes(sizes)
      if (sizes[1] === undefined || !sizes.some((s) => s > 0)) return
      const wantOpen = sizes[1] > 0
      if (wantOpen !== inspectorOpen) setInspectorOpen(wantOpen)
    },
    [setRightPanelSizes, inspectorOpen, setInspectorOpen],
  )

  return (
    <div className="main-layout">
      <div className="main-layout-inner">
        <ActivityBar activeView={activeView} onSelect={handleActivitySelect} />

        <div className="main-content-area">
          {loaded && (
            <Allotment
              onChange={handleMainSizesChange}
              defaultSizes={
                savedSizes.mainSizes.length > 0 ? savedSizes.mainSizes : undefined
              }
            >
              {/* Left: Sidebar */}
              <Allotment.Pane
                minSize={180}
                preferredSize={260}
                visible={activeView !== null}
                snap
              >
                <SidePanel activeView={activeView ?? 'explorer'} />
              </Allotment.Pane>

              {/* Right section: center + inspector */}
              <Allotment.Pane>
                <Allotment
                  onChange={handleRightPanelSizesChange}
                  defaultSizes={
                    savedSizes.rightPanelSizes.length > 0
                      ? savedSizes.rightPanelSizes
                      : undefined
                  }
                >
                  {/* Center: ContentArea + BottomPanel (vertical split) */}
                  <Allotment.Pane>
                    <Allotment
                      vertical
                      onChange={setCenterSizes}
                      defaultSizes={
                        savedSizes.centerSizes.length > 0
                          ? savedSizes.centerSizes
                          : undefined
                      }
                    >
                      <Allotment.Pane>
                        <ContentArea />
                      </Allotment.Pane>
                      <Allotment.Pane minSize={100} preferredSize={200} snap>
                        <BottomPanel />
                      </Allotment.Pane>
                    </Allotment>
                  </Allotment.Pane>

                  {/* Right: Inspector.
                      Collapse the pane whenever nothing is being inspected
                      (no target), even if the open flag is still set -- an
                      empty inspector shows no useful content, so it should
                      not take space. Selecting a node re-applies a target
                      (which also re-opens) and the pane reappears. */}
                  <Allotment.Pane
                    minSize={240}
                    preferredSize={300}
                    visible={inspectorOpen && inspectorHasTarget}
                    snap
                  >
                    <InspectorPanel />
                  </Allotment.Pane>
                </Allotment>
              </Allotment.Pane>
            </Allotment>
          )}
        </div>
      </div>
    </div>
  )
}
