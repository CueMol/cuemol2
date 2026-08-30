/**
 * @file worker/server/services/rendererColoring.service.ts
 * @description Worker-thread services backing the ScenePane renderer- and
 * object-level Coloring / Paint context-menu actions: static coloring
 * styles, the dynamic "Paint (Secondary str.)" style submenu, and the
 * Paint color picker.
 *
 * This file is a thin forwarder: the service bodies and DTOs live in
 * concern modules under `services/coloring/`. It keeps the `services`
 * object (and its key names / order) and the re-exported types byte-stable
 * so the `ServiceMap` rows in `worker/shared/calls/` and the
 * renderer-side importers (`ColorPane`, the coloring hooks) are unchanged.
 *
 * Concern modules:
 *  - `coloring/types.ts`         - all args / result / DTO types
 *  - `coloring/colorTargets.ts`  - target resolution + class/sel probes +
 *                                  materialize + Paint-CRUD prologue
 *  - `coloring/applyColoring.ts` - setRendererColoring / setRendererDefaultColor
 *                                  / setColoringProp
 *  - `coloring/paintCrud.ts`     - paint insert + add/remove/update/move
 *  - `coloring/panelList.ts`     - style list / paint gates / selector list
 *  - `coloring/deckState.ts`     - getRendererColoringState read path
 *  - `coloring/elepotWriter.ts`  - ElePotMap list + Elepot prop writer
 *
 * Runs in the Web Worker thread; C++ wrappers are called synchronously.
 */
import {
    setRendererColoring,
    setRendererDefaultColor,
    setColoringProp,
    setRendererColoringTarget,
} from '@renderer/worker/server/services/coloring/applyColoring';
import {
    paintRendererSelection,
    paintObjectSelection,
    addPaintEntry,
    removePaintEntry,
    updatePaintEntry,
    movePaintEntry,
} from '@renderer/worker/server/services/coloring/paintCrud';
import {
    copyPaintEntries,
    cutPaintEntries,
    pastePaintEntries,
    removePaintEntries,
    clearPaintEntries,
} from '@renderer/worker/server/services/coloring/paintClipboard';
import {
    getPaintColoringStyles,
    getRendererPaintInfo,
    getObjectPaintInfo,
    listPaintCapableRenderers,
} from '@renderer/worker/server/services/coloring/panelList';
import { getRendererColoringState } from '@renderer/worker/server/services/coloring/deckState';
import {
    listElePotMapObjects,
    setRendererElepotProp,
} from '@renderer/worker/server/services/coloring/elepotWriter';
import {
    getMultiGradState,
    getMultiGradHistogram,
    setMultiGradNodes,
    setMultiGradColorMap,
} from '@renderer/worker/server/services/coloring/multiGrad';

// Re-export the public types so existing importers
// (`worker/shared/calls/`, `ColorPane.tsx`, the coloring hooks) resolve unchanged.
export type {
    ColoringTargetKind,
    GetPaintColoringStylesArgs,
    PaintColoringStyleEntry,
    GetPaintColoringStylesResult,
    SetRendererColoringArgs,
    SetRendererColoringResult,
    PaintRendererSelectionArgs,
    PaintRendererSelectionResult,
    GetRendererPaintInfoArgs,
    GetRendererPaintInfoResult,
    PaintObjectSelectionArgs,
    PaintObjectSelectionResult,
    GetObjectPaintInfoArgs,
    GetObjectPaintInfoResult,
    ListPaintCapableRenderersArgs,
    PaintCapableRendererEntry,
    ListPaintCapableRenderersResult,
    GetRendererColoringStateArgs,
    PaintEntryDto,
    CpkColors,
    RainbowParams,
    ElepotParams,
    BfacParams,
    GetRendererColoringStateResult,
    AddPaintEntryArgs,
    PaintMutationResult,
    RemovePaintEntryArgs,
    UpdatePaintEntryArgs,
    MovePaintEntryArgs,
    PaintClipboardEntry,
    CopyPaintEntriesArgs,
    CopyPaintEntriesResult,
    PastePaintEntriesArgs,
    PastePaintEntriesResult,
    ClearPaintEntriesArgs,
    SetRendererDefaultColorArgs,
    SetRendererDefaultColorResult,
    SetColoringPropArgs,
    SetColoringPropResult,
    ListElePotMapObjectsArgs,
    ElePotMapObjectEntry,
    ListElePotMapObjectsResult,
    SetRendererElepotPropArgs,
    SetRendererElepotPropResult,
    SetRendererColoringTargetArgs,
    SetRendererColoringTargetResult,
    MultiGradNodeDto,
    MultiGradWriteNode,
    MultiGradMapObjectEntry,
    MultiGradMapStats,
    MultiGradPercentiles,
    GetMultiGradStateArgs,
    GetMultiGradStateResult,
    GetMultiGradHistogramArgs,
    GetMultiGradHistogramResult,
    SetMultiGradNodesArgs,
    SetMultiGradNodesResult,
    SetMultiGradColorMapArgs,
    SetMultiGradColorMapResult,
} from '@renderer/worker/server/services/coloring/types';

export const services = {
    setRendererColoring,
    getPaintColoringStyles,
    paintRendererSelection,
    getRendererPaintInfo,
    paintObjectSelection,
    getObjectPaintInfo,
    listPaintCapableRenderers,
    getRendererColoringState,
    addPaintEntry,
    removePaintEntry,
    updatePaintEntry,
    movePaintEntry,
    copyPaintEntries,
    cutPaintEntries,
    pastePaintEntries,
    removePaintEntries,
    clearPaintEntries,
    setRendererDefaultColor,
    setColoringProp,
    listElePotMapObjects,
    setRendererElepotProp,
    setRendererColoringTarget,
    getMultiGradState,
    getMultiGradHistogram,
    setMultiGradNodes,
    setMultiGradColorMap,
};
