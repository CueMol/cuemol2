/**
 * @file contexts/RenderConfigContext.tsx
 * @description React context for the (persistent) render binary paths --
 * the POV-Ray executable, its include directory, and blendpng.
 *
 * The paths are app configuration: edited in the SettingsPane and consumed
 * by `App` when starting a render. They are persisted to electron-store via
 * the existing `UI_SAVE` / `UI_LOAD` IPC channels (same mechanism as the
 * colour theme).
 *
 * When the user has not set a path, the default is resolved by Main and
 * delivered via the `APP_PATH` IPC channel (`defaultRenderBinaries`): from the
 * LIBCUEMOL2_ROOT / BUNDLE_APPS env vars in a dev run, or from the install tree
 * in a packaged build. The compiled-in `DEFAULT_RENDER_BINARIES` is the final
 * fallback when Main resolves nothing (e.g. a dev run without those env vars).
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { IPC } from "../../shared/ipcChannels";
import {
  type RenderBinaries,
  DEFAULT_RENDER_BINARIES,
} from "../worker/shared/renderTypes";

interface RenderConfigContextValue {
  /** Current render binary paths. */
  binaries: RenderBinaries;
  /** Update one binary path and persist it. */
  setBinary: (key: keyof RenderBinaries, value: string) => void;
}

const RenderConfigContext = createContext<RenderConfigContextValue | null>(null);

interface RenderConfigProviderProps {
  children: React.ReactNode;
}

export const RenderConfigProvider: React.FC<RenderConfigProviderProps> = ({
  children,
}) => {
  const [binaries, setBinaries] = useState<RenderBinaries>(DEFAULT_RENDER_BINARIES);

  // Resolve binary paths on mount with a three-level fallback:
  //   persisted user setting (UI_LOAD)
  //     -> Main-resolved default (APP_PATH: dev env vars / packaged install tree)
  //       -> compiled-in DEFAULT_RENDER_BINARIES.
  // Do not early-return when UI_LOAD is empty: a fresh profile with no persisted
  // paths is exactly when the Main-resolved default must take effect.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ui, appInfo] = await Promise.all([
          window.electronAPI?.invoke(IPC.UI_LOAD),
          window.electronAPI?.invoke(IPC.APP_PATH),
        ]);
        if (cancelled) return;
        const def = appInfo?.defaultRenderBinaries;
        setBinaries({
          povrayExe: ui?.povrayExe || def?.povrayExe || DEFAULT_RENDER_BINARIES.povrayExe,
          povrayInc: ui?.povrayInc || def?.povrayInc || DEFAULT_RENDER_BINARIES.povrayInc,
          blendpng: ui?.blendpng || def?.blendpng || DEFAULT_RENDER_BINARIES.blendpng,
        });
      } catch {
        // Electron not available (Vite dev server) -- keep defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setBinary = useCallback((key: keyof RenderBinaries, value: string) => {
    setBinaries((prev) => ({ ...prev, [key]: value }));
    // Persist immediately -- path changes are infrequent; no debounce needed.
    window.electronAPI?.invoke(IPC.UI_SAVE, { [key]: value });
  }, []);

  const value = useMemo<RenderConfigContextValue>(
    () => ({ binaries, setBinary }),
    [binaries, setBinary],
  );

  return (
    <RenderConfigContext.Provider value={value}>
      {children}
    </RenderConfigContext.Provider>
  );
};

/** Access the render binary paths. Must be used inside `<RenderConfigProvider>`. */
export function useRenderConfig(): RenderConfigContextValue {
  const ctx = useContext(RenderConfigContext);
  if (!ctx) {
    throw new Error("useRenderConfig() must be used within a <RenderConfigProvider>.");
  }
  return ctx;
}
