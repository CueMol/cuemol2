/**
 * @file contexts/ApbsConfigContext.tsx
 * @description React context for the (persistent) APBS / pdb2pqr external
 * executable paths and the default force field.
 *
 * These are machine-level install config -- exactly like the POV-Ray / blendpng
 * render binaries -- so they live in the SettingsPane and are persisted to
 * electron-store via the shared `UI_SAVE` / `UI_LOAD` IPC channels, mirroring
 * `RenderConfigContext`. The `CalcApbsPotDialog` reads them via `useApbsConfig`
 * and passes the paths into the `calcApbsStart` worker service; the dialog gates
 * its Start action when a required path is unset.
 *
 * Path resolution is a three-level fallback (same as RenderConfigContext):
 * persisted user setting (UI_LOAD) -> Main-resolved default (APP_PATH
 * `defaultApbsBinaries`: the bundled `bundle_apps/apbs` tree in a packaged
 * build, or the BUNDLE_APPS env var in a dev run) -> compiled-in
 * DEFAULT_APBS_BINARIES (empty). So a release build auto-defaults to the
 * bundled apbs / pdb2pqr without the user configuring anything. The force field
 * has no Main default; it uses the persisted value or DEFAULT_PDB2PQR_FF.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { IPC } from '@shared/ipcChannels';
import {
  type ApbsBinaries,
  DEFAULT_APBS_BINARIES,
  DEFAULT_PDB2PQR_FF,
} from '../worker/shared/apbsTypes';

/** Persistent APBS config: the two exe paths plus the default force field. */
export interface ApbsConfig extends ApbsBinaries {
  /** Default pdb2pqr force field. */
  pdb2pqrFF: string;
}

/** Keys settable through `setValue`. */
export type ApbsConfigKey = keyof ApbsConfig;

const DEFAULT_APBS_CONFIG: ApbsConfig = {
  ...DEFAULT_APBS_BINARIES,
  pdb2pqrFF: DEFAULT_PDB2PQR_FF,
};

interface ApbsConfigContextValue {
  /** Current APBS config. */
  config: ApbsConfig;
  /** Update one value and persist it. */
  setValue: (key: ApbsConfigKey, value: string) => void;
}

const ApbsConfigContext = createContext<ApbsConfigContextValue | null>(null);

interface ApbsConfigProviderProps {
  children: React.ReactNode;
}

export const ApbsConfigProvider: React.FC<ApbsConfigProviderProps> = ({
  children,
}) => {
  const [config, setConfig] = useState<ApbsConfig>(DEFAULT_APBS_CONFIG);

  // Resolve paths on mount with a three-level fallback (same as
  // RenderConfigContext): persisted user setting (UI_LOAD) -> Main-resolved
  // default (APP_PATH: bundled apbs in a packaged build / BUNDLE_APPS in dev)
  // -> compiled-in default. Do not early-return when UI_LOAD is empty: a fresh
  // profile with no persisted paths is exactly when the bundled default applies.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ui, appInfo] = await Promise.all([
          window.electronAPI?.invoke(IPC.UI_LOAD),
          window.electronAPI?.invoke(IPC.APP_PATH),
        ]);
        if (cancelled) return;
        const def = appInfo?.defaultApbsBinaries;
        setConfig({
          apbsExe: ui?.apbsExe || def?.apbsExe || DEFAULT_APBS_CONFIG.apbsExe,
          pdb2pqrExe: ui?.pdb2pqrExe || def?.pdb2pqrExe || DEFAULT_APBS_CONFIG.pdb2pqrExe,
          pdb2pqrFF: ui?.pdb2pqrFF || DEFAULT_APBS_CONFIG.pdb2pqrFF,
        });
      } catch {
        // Electron not available (Vite dev server) -- keep defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setValue = useCallback((key: ApbsConfigKey, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    // Persist immediately -- these change infrequently; no debounce needed.
    window.electronAPI?.invoke(IPC.UI_SAVE, { [key]: value });
  }, []);

  const value = useMemo<ApbsConfigContextValue>(
    () => ({ config, setValue }),
    [config, setValue],
  );

  return (
    <ApbsConfigContext.Provider value={value}>
      {children}
    </ApbsConfigContext.Provider>
  );
};

/** Access the APBS config. Must be used inside `<ApbsConfigProvider>`. */
export function useApbsConfig(): ApbsConfigContextValue {
  const ctx = useContext(ApbsConfigContext);
  if (!ctx) {
    throw new Error('useApbsConfig() must be used within an <ApbsConfigProvider>.');
  }
  return ctx;
}
