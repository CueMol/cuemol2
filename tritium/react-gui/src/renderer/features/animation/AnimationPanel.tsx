/**
 * @file components/panels/AnimationPanel.tsx
 * @description Blender-style animation timeline panel (strip model).
 *
 * Renders the active scene's `AnimMgr` elements as time-ranged strips: one lane
 * per `AnimObj`, each bar spanning `absStart`..`absEnd` on a shared millisecond
 * time axis (left edge = start, width = duration). The channel list on the left
 * names each element and carries the edit toolbar (add / delete / reorder); the
 * scrollable area on the right holds the time ruler, the strip lanes, and the
 * playhead.
 *
 * ## Layout
 *
 * ```
 * +-----------------------------------------------------------------+
 * | [|<][>/||][#][>|] 0:02.500/0:10.000 Start cam[v] Loop[x] Elem 3 FPS 30 [Fit -+] |
 * +----------------+------------------------------------------------+
 * |  (channel list)|  0      1.0s     2.0s     3.0s   <- ruler/scrub |
 * |  (cam) Cam0    |  #====== Cam0 ======#                          |
 * |  (spin) Spin1  |              #=== Spin1 ===#                   |
 * | [+][x][^][v]   |                                                |
 * +----------------+------------------------------------------------+
 *   ^ edit toolbar  ^ each lane = 1 AnimObj; bar = absStart..absEnd  |
 * ```
 *
 * Playback is driven in C++; the renderer issues transport ops and polls
 * `elapsed` while playing (see `useAnimTransport`). The ruler scrubs the
 * playhead; a strip body drags to move the element and its edge grips resize it,
 * each committing a single edit on release. Adds auto-chain to the previous
 * element (`timeRefName`); detail (per-type target) editing lands in a later phase.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Popover, Menu, MenuItem } from "@blueprintjs/core";
import { AppIcon } from "@renderer/h3-kit/primitives";
import { ButtonRow, FormButton } from "@renderer/h3-kit/form";
import type { AsyncCueMol } from "@renderer/worker/client/AsyncCueMol";
import type { AnimAddType, AnimElement } from "@renderer/types";
import { useAnimTimeline } from "./useAnimTimeline";
import { useAnimTransport } from "./useAnimTransport";
import { useAnimEdit } from "./useAnimEdit";
import { useInspectorActions } from "@renderer/state/inspector";
import { AnimTransport } from "@renderer/features/animation/anim/AnimTransport";
import { AnimTimeRuler } from "@renderer/features/animation/anim/AnimTimeRuler";
import { AnimStrip, type AnimStripEditMode } from "@renderer/features/animation/anim/AnimStrip";
import { typeIcon } from "@renderer/features/animation/anim/animElementMeta";
import {
  DEFAULT_PX_PER_MS,
  clampPxPerMs,
  msToPx,
  timelineWidthPx,
  fitPxPerMs,
} from "@renderer/features/animation/anim/timelineGeometry";

interface AnimationPanelProps {
  cm: AsyncCueMol | null;
  /** Active scene UID; undefined when no scene is active. */
  activeSceneId: number | undefined;
  /** Active mol-view UID; required for playback / scrub (transport disabled without it). */
  activeMolViewId: number | undefined;
}

/** Step factor for the zoom in / out buttons. */
const ZOOM_FACTOR = 1.4;
/** Min pixel travel before a strip mousedown counts as a drag (vs a click). */
const DRAG_THRESHOLD_PX = 3;

/** Add-menu entries (UXP parity). Maps to AnimObj subclasses worker-side. */
const ADD_TYPES: { id: AnimAddType; label: string }[] = [
  { id: "SimpleSpin", label: "Simple spin" },
  { id: "CamMotion", label: "Camera motion" },
  { id: "ShowAnim", label: "Show" },
  { id: "HideAnim", label: "Hide" },
  { id: "SlideInAnim", label: "Slide in" },
  { id: "SlideOutAnim", label: "Slide out" },
  { id: "MolAnim", label: "Mol morphing" },
  { id: "NoopAnimObj", label: "No operation" },
];

/**
 * Span a strip is drawn at instead of its fetched one.
 *
 * Live while dragging, then HELD after release (`committed`) until the refetched
 * timeline carries the edit -- otherwise the strip would jump back to its old
 * place for the length of the worker round trip plus the SEM_ANIM debounce, and
 * only then move to where it was dropped.
 */
interface DragPreview {
  uid: number;
  absStartMs: number;
  absEndMs: number;
  /** The edit is in flight; drop this the moment fresh data arrives. */
  committed?: boolean;
}

/**
 * Animation timeline panel. Reads live `AnimMgr` data for the active scene,
 * draws each element as a strip, drives playback / scrub, and edits the
 * timeline (move / resize / add / delete / reorder).
 */
export const AnimationPanel: React.FC<AnimationPanelProps> = ({
  cm,
  activeSceneId,
  activeMolViewId,
}) => {
  const { timeline } = useAnimTimeline({ cm, sceneId: activeSceneId });
  const transport = useAnimTransport({
    cm,
    sceneId: activeSceneId,
    viewId: activeMolViewId,
    baseMgr: timeline?.mgr ?? null,
  });
  const { addElement, removeElement, moveElement, setElementTime } = useAnimEdit({
    cm,
    sceneId: activeSceneId,
    viewId: activeMolViewId,
    // An add can seed the start camera (UXP parity); that fires no event, so
    // the returned snapshot is what keeps the header select current.
    onMgrState: transport.adoptMgr,
  });

  const [pxPerMs, setPxPerMs] = useState(DEFAULT_PX_PER_MS);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  // Non-null only while scrubbing the ruler -- previews the playhead.
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  // Non-null only while dragging a strip -- previews its span.
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const labelScrollRef = useRef<HTMLDivElement>(null);

  const elements = timeline?.elements ?? [];
  const tmgr = transport.mgr;
  const lengthMs = tmgr.lengthMs;

  // Time-axis extent: the manager length, but never less than the furthest
  // element end (length auto-grows on the C++ side; guard regardless).
  const contentMs = useMemo(() => {
    const maxAbsEnd = elements.reduce((m, e) => Math.max(m, e.absEndMs), 0);
    return Math.max(lengthMs, maxAbsEnd, 1000);
  }, [elements, lengthMs]);

  const widthPx = timelineWidthPx(contentMs, pxPerMs);
  const playheadMs = scrubMs ?? tmgr.elapsedMs;
  const playheadLeft = msToPx(playheadMs, pxPerMs);

  const { seek, canControl } = transport;

  // Index of the selected element (for the edit toolbar); null when none.
  const selectedIndex = useMemo(() => {
    if (selectedUid === null) return null;
    const el = elements.find((e) => e.uid === selectedUid);
    return el ? el.index : null;
  }, [elements, selectedUid]);

  const handleZoomIn = useCallback(
    () => setPxPerMs((p) => clampPxPerMs(p * ZOOM_FACTOR)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setPxPerMs((p) => clampPxPerMs(p / ZOOM_FACTOR)),
    [],
  );
  const handleFit = useCallback(() => {
    const avail = timelineScrollRef.current?.clientWidth ?? 0;
    setPxPerMs(fitPxPerMs(contentMs, avail));
  }, [contentMs]);

  /** Mirror vertical scroll onto the (hidden-scroll) channel list. */
  const handleTimelineScroll = useCallback(() => {
    if (timelineScrollRef.current && labelScrollRef.current) {
      labelScrollRef.current.scrollTop = timelineScrollRef.current.scrollTop;
    }
  }, []);

  /**
   * Begin a playhead scrub on the ruler. Tracks the position locally during
   * the drag (no service calls) and commits a single seek on mouse-up. A bare
   * click (no movement) also commits one seek at the click position.
   */
  const handleRulerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || !canControl) return;
      e.preventDefault();
      const toMs = (clientX: number): number => {
        const sc = timelineScrollRef.current;
        if (!sc) return 0;
        const rect = sc.getBoundingClientRect();
        const x = clientX - rect.left + sc.scrollLeft;
        return Math.max(0, Math.min(contentMs, x / pxPerMs));
      };
      setScrubMs(toMs(e.clientX));
      const onMove = (ev: MouseEvent) => setScrubMs(toMs(ev.clientX));
      const onUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        const ms = toMs(ev.clientX);
        setScrubMs(null);
        seek(ms);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [canControl, contentMs, pxPerMs, seek],
  );

  /**
   * Begin a strip move / resize drag. Previews the new span locally (without a
   * service call) and commits a single `setElementTime` on release. A bare
   * click (no movement) is left to the strip's onClick to select. The relative
   * delta equals the absolute delta because the chain reference is fixed during
   * the drag; chained-after elements re-resolve only on commit (via refetch).
   */
  const handleStripEditDown = useCallback(
    (el: AnimElement, mode: AnimStripEditMode, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const { startMs: relStart, endMs: relEnd, absStartMs: absStart, absEndMs: absEnd } = el;
      let moved = false;

      // Lower bound on the delta. The absolute start stays >= 0, and a CHAINED
      // element's relative start does too: a relative time is an offset from the
      // reference's end, so a negative one would place the element before the
      // element it chains after finishes -- not a supported state (it resolves
      // to an absolute time that can fall before zero). The relative bound is
      // the binding one whenever the reference does not itself start at 0.
      const minDelta = -Math.min(absStart, el.timeRefName ? relStart : Infinity);

      const deltaFor = (clientX: number): number => {
        const raw = (clientX - startX) / pxPerMs;
        if (mode === "move") return Math.max(raw, minDelta);
        if (mode === "resize-left")
          return Math.max(Math.min(raw, absEnd - absStart), minDelta); // start in [0, end]
        return Math.max(raw, absStart - absEnd); // resize-right: end stays >= start
      };

      const onMove = (ev: MouseEvent) => {
        if (!moved && Math.abs(ev.clientX - startX) > DRAG_THRESHOLD_PX) moved = true;
        if (!moved) return;
        const d = deltaFor(ev.clientX);
        if (mode === "move")
          setDragPreview({ uid: el.uid, absStartMs: absStart + d, absEndMs: absEnd + d });
        else if (mode === "resize-left")
          setDragPreview({ uid: el.uid, absStartMs: absStart + d, absEndMs: absEnd });
        else setDragPreview({ uid: el.uid, absStartMs: absStart, absEndMs: absEnd + d });
      };

      const onUp = (ev: MouseEvent) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (!moved) {
          setDragPreview(null);
          return; // click selects via onClick
        }
        const d = deltaFor(ev.clientX);
        let newStart = relStart;
        let newEnd = relEnd;
        if (mode === "move") {
          newStart = relStart + d;
          newEnd = relEnd + d;
        } else if (mode === "resize-left") {
          newStart = relStart + d;
        } else {
          newEnd = relEnd + d;
        }
        // Keep drawing the dropped span until the refetch reflects it (see
        // DragPreview); the effect below drops it when fresh data arrives.
        setDragPreview((p) => (p ? { ...p, committed: true } : p));
        setElementTime(el.index, newStart, newEnd).then((ok) => {
          // The write failed, so no SEM_ANIM event and no refetch is coming --
          // release the preview or the strip would be stuck at a span the C++
          // side never took.
          if (!ok) setDragPreview(null);
        });
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [pxPerMs, setElementTime],
  );

  const addInsertIndex = selectedIndex !== null ? selectedIndex + 1 : undefined;

  /**
   * Delete the selected element and move the selection to its neighbour -- the
   * following element, or the preceding one when the last was deleted (the list
   * convention). Without this the toolbar disables itself after every delete and
   * clearing a timeline means re-selecting between each click.
   */
  const handleDelete = useCallback(() => {
    if (selectedIndex === null) return;
    const next = elements[selectedIndex + 1] ?? elements[selectedIndex - 1] ?? null;
    removeElement(selectedIndex);
    setSelectedUid(next?.uid ?? null);
  }, [selectedIndex, elements, removeElement]);

  // Reset the selection on scene switch so a stale uid from the previous scene
  // is never emitted against the new scene's inspector.
  useEffect(() => {
    setSelectedUid(null);
  }, [activeSceneId]);

  // Release a held (committed) drag preview as soon as a fresh timeline lands:
  // the fetched strip now carries the edit, so the two agree and the handover is
  // invisible. `elements` identity changes once per fetch.
  useEffect(() => {
    setDragPreview((p) => (p?.committed ? null : p));
  }, [elements]);

  // Drive the right Inspector from the strip selection. When the selected
  // element is gone (deleted via SEM_ANIM refetch), clear both the local
  // selection and the inspector target.
  const { showAnimElement, clearAnimElement } = useInspectorActions();
  useEffect(() => {
    if (activeSceneId === undefined) return;
    if (selectedUid === null) {
      clearAnimElement(activeSceneId);
      return;
    }
    const el = elements.find((e) => e.uid === selectedUid);
    if (el) {
      showAnimElement(activeSceneId, el.uid);
    } else {
      setSelectedUid(null);
      clearAnimElement(activeSceneId);
    }
  }, [selectedUid, activeSceneId, elements, showAnimElement, clearAnimElement]);

  // --- Empty (no scene) state ---

  if (!cm || activeSceneId === undefined) {
    return (
      <div className="animation-panel">
        <div className="anim-placeholder">
          <AppIcon name="panel.animation" size={48} className="placeholder-icon" aria-hidden />
          <div>No active scene</div>
        </div>
      </div>
    );
  }

  return (
    <div className="animation-panel">
      <AnimTransport
        mgr={tmgr}
        fps={timeline?.fps ?? 30}
        elementCount={elements.length}
        isPlaying={transport.isPlaying}
        canControl={canControl}
        loop={tmgr.loop}
        cameras={timeline?.cameras ?? []}
        onPlayPause={transport.togglePlay}
        onStop={transport.stop}
        onSkipStart={() => seek(0)}
        onSkipEnd={() => seek(lengthMs)}
        onToggleLoop={transport.setLoop}
        onStartCamChange={transport.setStartCam}
        onFit={handleFit}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />

      <div className="anim-body">
        {/* Channel list + edit toolbar (left) */}
        <div className="anim-label-col">
          <div className="anim-ruler-corner" />
          <div className="anim-label-scroll" ref={labelScrollRef}>
            {elements.map((el) => (
              <div
                key={el.uid}
                className={`anim-label-row${selectedUid === el.uid ? " is-selected" : ""}`}
                onClick={() => setSelectedUid((u) => (u === el.uid ? null : el.uid))}
                title={`${el.name} (${el.type})`}
              >
                <AppIcon
                  name={typeIcon(el.type)}
                  size="sm"
                  className="anim-label-icon"
                  aria-hidden
                />
                <span className="anim-label-text">{el.name}</span>
              </div>
            ))}
          </div>
          <ButtonRow className="anim-label-toolbar">
            <Popover
              placement="top-start"
              content={
                <Menu>
                  {ADD_TYPES.map((t) => (
                    <MenuItem
                      key={t.id}
                      text={t.label}
                      onClick={() => addElement(t.id, addInsertIndex)}
                    />
                  ))}
                </Menu>
              }
            >
              <FormButton icon={<AppIcon name="ui.add" aria-hidden />} title="Add element" />
            </Popover>
            <FormButton
              icon={<AppIcon name="ui.trash" aria-hidden />}
              disabled={selectedIndex === null}
              onClick={handleDelete}
              title="Delete element"
            />
            <FormButton
              icon={<AppIcon name="ui.caretUp" aria-hidden />}
              disabled={selectedIndex === null || selectedIndex === 0}
              onClick={() =>
                selectedIndex !== null && selectedIndex > 0 &&
                moveElement(selectedIndex, selectedIndex - 1)
              }
              title="Move up"
            />
            <FormButton
              icon={<AppIcon name="ui.caretDown" aria-hidden />}
              disabled={selectedIndex === null || selectedIndex >= elements.length - 1}
              onClick={() =>
                selectedIndex !== null && selectedIndex < elements.length - 1 &&
                moveElement(selectedIndex, selectedIndex + 1)
              }
              title="Move down"
            />
          </ButtonRow>
        </div>

        {/* Time ruler + strip lanes (scrollable) */}
        <div
          className="anim-timeline"
          ref={timelineScrollRef}
          onScroll={handleTimelineScroll}
        >
          <div className="anim-canvas" style={{ width: widthPx }}>
            <AnimTimeRuler
              contentMs={contentMs}
              pxPerMs={pxPerMs}
              widthPx={widthPx}
              onMouseDown={handleRulerMouseDown}
            />
            <div className="anim-lanes">
              {elements.map((el) => (
                <div
                  key={el.uid}
                  className={`anim-lane${selectedUid === el.uid ? " is-selected" : ""}`}
                  onClick={() => setSelectedUid(null)}
                >
                  <AnimStrip
                    el={el}
                    pxPerMs={pxPerMs}
                    selected={selectedUid === el.uid}
                    previewAbsStartMs={
                      dragPreview?.uid === el.uid ? dragPreview.absStartMs : undefined
                    }
                    previewAbsEndMs={
                      dragPreview?.uid === el.uid ? dragPreview.absEndMs : undefined
                    }
                    onSelect={setSelectedUid}
                    onEditMouseDown={handleStripEditDown}
                  />
                </div>
              ))}
            </div>
            {elements.length === 0 && (
              <div className="anim-empty-hint type-caption">
                No animation elements -- use + to add one
              </div>
            )}
            <div className="anim-playhead" style={{ left: playheadLeft }} aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
};
