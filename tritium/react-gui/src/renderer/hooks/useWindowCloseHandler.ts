/**
 * @file hooks/useWindowCloseHandler.ts
 * @description UXP-parity window-close chain (mirrors `Qm2Main.onCloseEvent`
 * in uxp_gui/cuemol2/base/content/cuemol2.js:579).
 *
 * Listens for IPC.WINDOW_CLOSE_REQUEST (sent by main from the window's
 * close confirm funnel -- triggered by the traffic-light/X button or by
 * Cmd+Q closing every window) and walks every tab through `handleCloseTab`.
 * The renderer always replies via IPC.WINDOW_CLOSE_PROCEED: `proceed: true`
 * when every tab is confirmed, `proceed: false` when the user cancels a
 * confirm dialog. Replying on cancel is required so main can clear its
 * in-flight flag and re-enable a subsequent close/quit attempt.
 */

import { useEffect, useRef } from "react";
import type React from "react";
import { IPC } from "../../shared/ipcChannels";
import type { TabData } from "../types";

interface UseWindowCloseHandlerOptions {
  tabsRef: React.RefObject<TabData[]>;
  handleCloseTab: (id: string) => Promise<boolean>;
  setActiveTab: (id: string) => void;
}

export function useWindowCloseHandler({
  tabsRef,
  handleCloseTab,
  setActiveTab,
}: UseWindowCloseHandlerOptions): void {
  // Refs keep the latest function identities without retriggering the
  // onPush subscription on every render.
  const handleCloseTabRef = useRef(handleCloseTab);
  handleCloseTabRef.current = handleCloseTab;
  const setActiveTabRef = useRef(setActiveTab);
  setActiveTabRef.current = setActiveTab;

  // Re-entrancy guard: if a second WINDOW_CLOSE_REQUEST arrives while a
  // confirm dialog is already open, ignore the new request.
  const isProcessingRef = useRef(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    return api.onPush(IPC.WINDOW_CLOSE_REQUEST, async () => {
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
          if (!ok) {
            await api.invoke(IPC.WINDOW_CLOSE_PROCEED, { proceed: false });
            return;
          }
        }
        await api.invoke(IPC.WINDOW_CLOSE_PROCEED, { proceed: true });
      } finally {
        isProcessingRef.current = false;
      }
    });
  }, [tabsRef]);
}
