/**
 * @file worker/server/services/renderjob/backends/index.ts
 * @description Registry of worker-side rendering backends.
 *
 * Adding a backend: implement `RenderBackend` and add it here.
 */

import type { RenderBackend } from "./RenderBackend";
import { povrayBackend } from "./PovrayBackend";
import { umbreonBackend, umbreonNprBackend } from "./UmbreonBackend";

export type { RenderBackend } from "./RenderBackend";

const BACKENDS: Record<string, RenderBackend> = {
  [povrayBackend.id]: povrayBackend,
  [umbreonBackend.id]: umbreonBackend,
  [umbreonNprBackend.id]: umbreonNprBackend,
};

/** Look up a backend by id; null when the id is unknown. */
export function getRenderBackend(id: string): RenderBackend | null {
  return BACKENDS[id] ?? null;
}
