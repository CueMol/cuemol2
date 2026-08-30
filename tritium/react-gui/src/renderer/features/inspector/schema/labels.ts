/**
 * @file features/inspector/schema/labels.ts
 * @description Enum labels shared by more than one renderer page.
 *
 * A label table belongs to the page that uses it; these are the ones the
 * spline-family pages (cartoon / tube / ribbon / nucl) all name the same way,
 * so they live here rather than being repeated per page. The C++ `enumdef` is
 * alphabetical, so an option list is what fixes the reading order.
 */

/** Cap-type enum labels shared by the spline-family renderers (cartoon / tube). */
export const CAP_LABELS: Record<string, string> = {
  sphere: "Round",
  flat: "Flat",
  none: "None",
};

/** Cross-section type labels (a `TubeSection` `type`). */
export const SECTION_TYPE_LABELS: Record<string, string> = {
  elliptical: "Elliptical",
  roundsquare: "Round square",
  rectangle: "Rectangle",
  fancy1: "Fancy",
};

/** Section types offered when the UXP dialog omits "fancy1". */
export const SECTION_TYPES_NO_FANCY = ["elliptical", "roundsquare", "rectangle"];

/** Section types whose corners expose a meaningful sharpness (UXP gate). */
export const SHARP_TYPES = ["roundsquare", "fancy1"];

/** Junction (`JctTable`) head/tail type labels (UXP "Round" / "Flat" / "Arrow"). */
export const JCT_TYPE_LABELS: Record<string, string> = {
  smooth: "Round",
  flat: "Flat",
  arrow: "Arrow",
};
export const JCT_TYPE_OPTIONS = ["smooth", "flat", "arrow"];
