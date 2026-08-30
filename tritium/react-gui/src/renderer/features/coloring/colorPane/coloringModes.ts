/**
 * @file features/coloring/colorPane/coloringModes.ts
 * @description The coloring-type dropdown's contents, and the class names the
 * pane routes a deck by.
 *
 * A table rather than JSX: which items a renderer may be offered depends only
 * on what it can do (has a `coloring` property / is a surface / has a
 * gradient), so the pane filters this list instead of branching per item.
 */

import type { RendColoringId } from '@shared/types/sceneCtxMenu';

export interface ColoringModeItem {
    label: string
    coloringId: RendColoringId | null
    enabled: boolean
    /**
     * UXP `setupColoringSelector` hides the Electrostatic-potential item
     * unless the renderer is `molsurf` / `dsurface`. We mirror that with a
     * per-item gate that the parent component evaluates against
     * `state.surfaceType`.
     */
    surfaceOnly?: boolean
    /** Shown only when the renderer exposes a `multi_grad` gradient. */
    multigradOnly?: boolean
}

/**
 * Marker for the "Paint coloring" row: it is not a leaf item but a submenu
 * whose entries are built at render time (see `paintSubmenuItems`).
 */
export const PAINT_SUBMENU_ID = 'paint-type-paint'

/**
 * Default width of the paint table's Selection column, in px; Color takes
 * whatever is left. Persisted per user so the split survives a restart --
 * UXP persisted the treecol widths (`persist="hidden ordinal width"`) for
 * the same reason.
 */
export const PAINT_COL_WIDTHS = { selection: 130 }
export const PAINT_COL_WIDTHS_KEY = 'cuemol.colorPane.paint.colWidths'

/**
 * Width the Color column keeps no matter how far the splitter is dragged.
 * The table is `table-layout: fixed`, so an oversized Selection column would
 * otherwise push the table past its wrapper -- which clips the selected
 * row's outline and can hide the colour control entirely.
 */
export const PAINT_MIN_COLOR_COL = 90

/** Floor for the Selection column, matching useColumnResize's own minimum. */
export const PAINT_COL_MIN = 40

/** Actions the paint row context menu can return. */
export type PaintCtxAction = 'cut' | 'copy' | 'paste' | 'delete' | 'deleteAll'

export const COLORING_MODE_ITEMS: ColoringModeItem[] = [
    { label: 'Paint coloring',          coloringId: 'paint-type-paint',    enabled: true  },
    { label: 'Solid coloring',          coloringId: 'paint-type-solid',    enabled: true  },
    // The three CPK entries differ only in the carbon colour, matching the
    // Default / Darkgray / Lightgray CPK styles the renderer context menu
    // offers. Labels follow those styles' `desc`.
    { label: 'CPK coloring',            coloringId: 'paint-type-cpk',      enabled: true  },
    { label: 'CPK (darkgray carbon)',   coloringId: 'paint-type-cpk-darkgray',  enabled: true },
    { label: 'CPK (lightgray carbon)',  coloringId: 'paint-type-cpk-lightgray', enabled: true },
    { label: 'Bfac/Occ coloring',       coloringId: 'paint-type-bfac',     enabled: true  },
    { label: 'Rainbow coloring',        coloringId: 'paint-type-rainbow',  enabled: true  },
    { label: 'Electrostatic potential', coloringId: 'paint-type-elepot',   enabled: true, surfaceOnly: true },
    { label: 'Multi-gradient coloring', coloringId: 'paint-type-multigrad', enabled: true, multigradOnly: true },
    { label: 'Reset to default style',  coloringId: 'paint-type-resetdef', enabled: true  },
]

/** Coloring class that routes to the Paint deck. */
export const PAINT_DECK_CLASS = 'PaintColoring'
/** Coloring classes that route to the Solid deck (no class = inherited). */
export const SOLID_DECK_CLASSES = new Set(['', 'SolidColoring'])
