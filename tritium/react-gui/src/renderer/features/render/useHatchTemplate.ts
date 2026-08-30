/**
 * @file hooks/useHatchTemplate.ts
 * @description Loads the NPR hatch style selected in the render settings as
 * an editable template: whenever the style changes (and its template is not
 * loaded yet), the resolved style is fetched from the C++ side as spec text,
 * parsed, and handed to the settings state. Kept outside useRenderSettings
 * so that hook stays synchronous and IPC-free.
 */

import { useEffect, useRef, useState } from "react";
import { parseHatchSpec, type HatchSpec } from "@renderer/data/hatchSpec";
import type { HatchStyleSpecReply } from "@shared/types/renderWindow";

export type HatchTemplateStatus = "idle" | "loading" | "ready" | "error";

export interface UseHatchTemplateArgs {
  /** Only the NPR backend has a hatch style to load. */
  enabled: boolean;
  /** The selected style name (renderBackends "hatchStyle"). */
  style: string;
  /** True once the settings hold this style's template. */
  loaded: boolean;
  /** Resolve a style name to its spec text (the render window's relay). */
  fetchSpec: (style: string) => Promise<HatchStyleSpecReply>;
  /** Receives the parsed template; ignored by the settings when stale. */
  onLoaded: (style: string, spec: HatchSpec) => void;
}

/**
 * Fetch the template of `style` while it is not loaded. A fetch that
 * resolves after the style moved on is dropped; a failed fetch only reports
 * its status (the render then uses the style's own configuration).
 */
export function useHatchTemplate({
  enabled,
  style,
  loaded,
  fetchSpec,
  onLoaded,
}: UseHatchTemplateArgs): { status: HatchTemplateStatus; error: string | null } {
  const [status, setStatus] = useState<HatchTemplateStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Read through refs so a re-created callback does not refetch.
  const fetchRef = useRef(fetchSpec);
  fetchRef.current = fetchSpec;
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  useEffect(() => {
    if (!enabled || !style) {
      setStatus("idle");
      setError(null);
      return;
    }
    if (loaded) {
      setStatus("ready");
      setError(null);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setError(null);
    fetchRef
      .current(style)
      .then((reply) => {
        if (cancelled) return;
        if (reply.ok) {
          loadedRef.current(style, parseHatchSpec(reply.spec));
          setStatus("ready");
        } else {
          setStatus("error");
          setError(reply.error);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, style, loaded]);

  return { status, error };
}
