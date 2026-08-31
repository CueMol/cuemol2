/**
 * @file hooks/useSceneExportCaps.ts
 * @description Probes which scene exporters are compiled into the running
 * libcuemol2 build (category 2) once the worker is ready, and keeps the native
 * application menu in sync so export items whose exporter is unavailable are
 * hidden (e.g. Umbreon without HAVE_UMBREON).
 *
 * Availability is a static build property, so the probe runs once per session.
 * The result is (a) pushed to the main process via MENU_UPDATE_STATE to gate
 * the native menu and (b) returned so the React MenuBar (Windows/Linux) can
 * hide the same items.
 */

import { useEffect, useState } from 'react';
import { IPC } from '@shared/ipcChannels';
import type { AsyncCueMol } from '@renderer/worker/client/AsyncCueMol';
import { useStaleGuard } from '@renderer/hooks/react/useStaleGuard';

interface UseSceneExportCapsOptions {
  cm: AsyncCueMol | null;
  cueMolReady: boolean;
}

/**
 * @returns the available scene-exporter nicknames, or `null` until the probe
 *   resolves (or if it fails) -- consumers treat `null` / empty as "show all".
 */
export function useSceneExportCaps({
  cm,
  cueMolReady,
}: UseSceneExportCapsOptions): string[] | null {
  const [available, setAvailable] = useState<string[] | null>(null);

  const guard = useStaleGuard();
  useEffect(() => {
    if (!cm || !cueMolReady) return;
    const token = guard.next();
    cm.invokeService('getAvailableSceneExporters', undefined)
      .then((res) => {
        if (!guard.isCurrent(token) || !res?.ok) return;
        setAvailable(res.names);
        window.electronAPI
          ?.invoke(IPC.MENU_UPDATE_STATE, { exportCaps: { available: res.names } })
          .catch((err: unknown) => {
            console.warn('update export caps menu state failed:', err);
          });
      })
      .catch((err: unknown) => {
        console.warn('probe scene exporters failed:', err);
      });
    return () => guard.invalidate();
  }, [cm, cueMolReady, guard]);

  return available;
}
