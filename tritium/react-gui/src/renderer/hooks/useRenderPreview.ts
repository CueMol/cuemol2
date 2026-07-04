/**
 * @file hooks/useRenderPreview.ts
 * @description State for the docked render preview pane (right of ContentArea).
 *
 * Holds the single latest RenderResult and the pane's open flag. Showing a
 * result never touches the tab manager, so a completed render can appear
 * without stealing the active tab. The open flag is restored from the
 * persisted layout on first load and every change is persisted, following
 * the inspectorOpen pattern in useInspectorState.
 */

import { useState, useEffect, useCallback } from "react";
import type { LayoutState } from "../../shared/ipcTypes";
import type { RenderResult } from "../data/renderResult";

interface UseRenderPreviewArgs {
  /** Persisted layout state (for restoring the open flag). */
  layout: LayoutState;
  /** True once the persisted layout has been loaded. */
  loaded: boolean;
  /** Persist the open flag (setRenderPreviewOpen from useLayoutPersistence). */
  persistRenderPreviewOpen: (open: boolean) => void;
}

export function useRenderPreview({
  layout,
  loaded,
  persistRenderPreviewOpen,
}: UseRenderPreviewArgs) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResult, setPreviewResult] = useState<RenderResult | null>(null);

  // Restore open state from persisted layout on first load.
  useEffect(() => {
    if (loaded && layout.renderPreviewOpen) {
      setPreviewOpen(true);
    }
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Store a completed render and open the pane (does not change tabs). */
  const showResult = useCallback(
    (result: RenderResult) => {
      setPreviewResult(result);
      setPreviewOpen(true);
      persistRenderPreviewOpen(true);
    },
    [persistRenderPreviewOpen],
  );

  /** Close the pane (the result is kept until the next render). */
  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    persistRenderPreviewOpen(false);
  }, [persistRenderPreviewOpen]);

  return { previewOpen, previewResult, showResult, closePreview };
}
