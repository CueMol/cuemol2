/**
 * @file components/inspector/schema/labels.ts
 * @description Enum labels shared by more than one renderer page.
 *
 * A label table belongs to the page that uses it; these are the ones the
 * spline-family pages (cartoon / tube / ribbon) all name the same way, so they
 * live here rather than being repeated per page.
 */

/** Cap-type enum labels shared by the spline-family renderers (cartoon / tube). */
export const CAP_LABELS: Record<string, string> = {
  sphere: "Round",
  flat: "Flat",
  none: "None",
};
