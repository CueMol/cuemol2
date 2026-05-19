/**
 * @file hooks/useTabManager.ts
 * @description Custom hook that manages the editor tab bar: opening,
 * closing, selecting, reordering, and creating new tabs.
 *
 * Closing a molview tab runs an optional async confirmation callback
 * (confirmCloseTab) before proceeding. If the callback resolves false,
 * the close is aborted.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type { TabData } from "../types";
import { type RenderResult, renderResultTabTitle } from "../data/renderResult";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/** Well-known tab id for the Settings pane (singleton). */
const SETTINGS_TAB_ID = "__settings__";

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

export function useTabManager(opts?: {
  onMolViewClose?: (viewId: number) => void;
  /** Called before closing a molview tab. Return true to proceed, false to abort. */
  confirmCloseTab?: (viewId: number) => Promise<boolean>;
}) {
  const [tabs, setTabs] = useState<TabData[]>([
    { id: "welcome", title: "Welcome", icon: "home", type: "welcome" },
  ]);
  const [activeTab, setActiveTab] = useState("welcome");

  // Keep a ref so async handleCloseTab can read current tabs without stale closure.
  const tabsRef = useRef<TabData[]>(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // ── Settings tab (singleton) ─────────────────────────────

  const openSettingsTab = useCallback(() => {
    setTabs((prev) => {
      const existing = prev.find((t) => t.id === SETTINGS_TAB_ID);
      if (existing) {
        setActiveTab(SETTINGS_TAB_ID);
        return prev;
      }

      const settingsTab: TabData = {
        id: SETTINGS_TAB_ID,
        title: "Settings",
        icon: "cog",
        type: "settings",
      };
      setActiveTab(SETTINGS_TAB_ID);
      return [...prev, settingsTab];
    });
  }, []);

  // ── Close / Reorder ──────────────────────────────────────

  const handleCloseTab = useCallback(
    async (id: string): Promise<boolean> => {
      const closing = tabsRef.current.find((t) => t.id === id);
      if (closing?.type === "molview" && closing.viewId !== undefined && opts?.confirmCloseTab) {
        const proceed = await opts.confirmCloseTab(closing.viewId);
        if (!proceed) return false;
      }

      setTabs((prev) => {
        const closingTab = prev.find((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        if (closingTab?.type === "molview" && closingTab.viewId !== undefined) {
          opts?.onMolViewClose?.(closingTab.viewId);
        }
        setActiveTab((currentActive) => {
          if (currentActive === id && next.length > 0) {
            return next[next.length - 1].id;
          }
          return next.length === 0 ? "" : currentActive;
        });
        return next;
      });
      return true;
    },
    [opts],
  );

  const handleReorderTabs = useCallback(
    (fromId: string, toId: string, insertAfter: boolean = false) => {
      if (fromId === toId) return;

      setTabs((prev) => {
        const fromIndex = prev.findIndex((t) => t.id === fromId);
        const toIndex = prev.findIndex((t) => t.id === toId);
        if (fromIndex === -1 || toIndex === -1) return prev;

        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);

        let insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
        if (insertAfter) {
          insertIndex += 1;
        }

        next.splice(insertIndex, 0, moved);
        return next;
      });
    },
    [],
  );

  // ── MolView tabs ─────────────────────────────────────────

  const addMolViewTab = useCallback((title: string, viewId: number) => {
    const newTab: TabData = {
      id: `molview-${Date.now()}`,
      title,
      icon: "cube",
      type: "molview",
      viewId,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTab(newTab.id);
  }, []);

  // ── Render Result tabs ───────────────────────────────────

  /**
   * Open a completed render. There is at most one result tab per source
   * scene: re-rendering the same scene overwrites that tab's image in
   * place rather than spawning a new tab.
   */
  const addRenderResultTab = useCallback((result: RenderResult) => {
    const tabId = `render-result-scene-${result.sourceSceneId}`;
    const tab: TabData = {
      id: tabId,
      title: renderResultTabTitle(result),
      icon: "media",
      type: "renderResult",
      renderResult: result,
    };
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return [...prev, tab];
      const next = [...prev];
      next[idx] = tab;
      return next;
    });
    setActiveTab(tabId);
  }, []);

  return {
    tabs,
    tabsRef,
    activeTab,
    setActiveTab,
    openSettingsTab,
    addMolViewTab,
    addRenderResultTab,
    handleCloseTab,
    handleReorderTabs,
  } as const;
}
