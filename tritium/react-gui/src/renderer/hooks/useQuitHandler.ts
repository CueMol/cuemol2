/**
 * @file hooks/useQuitHandler.ts
 * @description UXP-parity quit chain (mirrors `Qm2Main.onCloseEvent` in
 * uxp_gui/cuemol2/base/content/cuemol2.js:579).
 *
 * Listens for IPC.APP_QUIT_REQUEST (sent by main on the first 'before-quit')
 * and walks every tab through `handleCloseTab`. If the user cancels the
 * confirm dialog on any tab, the quit is aborted; otherwise the renderer
 * calls IPC.APP_QUIT_PROCEED to let main re-issue app.quit().
 */

import { useEffect, useRef } from "react";
import type React from "react";
import { IPC } from "../../shared/ipcChannels";
import type { TabData } from "../types";

interface UseQuitHandlerOptions {
  tabsRef: React.RefObject<TabData[]>;
  handleCloseTab: (id: string) => Promise<boolean>;
  setActiveTab: (id: string) => void;
}

export function useQuitHandler({
  tabsRef,
  handleCloseTab,
  setActiveTab,
}: UseQuitHandlerOptions): void {
  // Refs keep the latest function identities without retriggering the
  // onPush subscription on every render.
  const handleCloseTabRef = useRef(handleCloseTab);
  handleCloseTabRef.current = handleCloseTab;
  const setActiveTabRef = useRef(setActiveTab);
  setActiveTabRef.current = setActiveTab;

  // Re-entrancy guard: if the user hits cmd-Q a second time while a confirm
  // dialog is already open, ignore the new request.
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    return api.onPush(IPC.APP_QUIT_REQUEST, async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      try {
        const idSnapshot = (tabsRef.current ?? []).map((t) => t.id);
        for (const id of idSnapshot) {
          const tab = (tabsRef.current ?? []).find((t) => t.id === id);
          if (!tab) continue;
          // UXP parity: switch to the tab being closed so the user sees
          // which scene the confirm dialog refers to.
          if (tab.type === "molview") setActiveTabRef.current(id);
          const ok = await handleCloseTabRef.current(id);
          if (!ok) return;
        }
        await api.invoke(IPC.APP_QUIT_PROCEED);
      } finally {
        isProcessingRef.current = false;
      }
    });
  }, [tabsRef]);
}
