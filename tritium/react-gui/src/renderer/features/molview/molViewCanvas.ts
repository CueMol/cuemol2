/**
 * @file features/molview/molViewCanvas.ts
 * @description How to find the 3D view canvas from outside MolViewPane.
 *
 * Several components render a `<canvas>` -- the sequence panel and the
 * multi-gradient histogram among them -- so `document.querySelector('canvas')`
 * returns whichever sits first in the DOM, not the one showing the molecule.
 * The sidebar renders before the content area, so with a histogram on screen
 * the render window's "Current view" size preset measured that strip instead
 * and rendered at the wrong resolution, silently.
 */

/** Marks the single OffscreenCanvas-bound 3D view (see MolViewPane). */
export const MOLVIEW_CANVAS_SELECTOR = '[data-molview-canvas]';
