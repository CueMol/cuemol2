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

// --- Constants ---

/** Well-known tab id for the Settings pane (singleton). */
const SETTINGS_TAB_ID = "__settings__";

// --- Hook ---

export function useTabManager(opts?: {
  onMolViewClose?: (viewId: number) => void;
  /** Called before closing a molview tab. Return true to proceed, false to abort. */
  confirmCloseTab?: (viewId: number) => Promise<boolean>;
}) {
  // Start with no tabs (VSCode-like): ContentPane renders the WelcomePane
  // watermark as the empty-state fallback until the first tab opens.
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTab, setActiveTab] = useState("");

  // Keep a ref so async handleCloseTab can read current tabs without stale closure.
  const tabsRef = useRef<TabData[]>(tabs);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  // --- Settings tab (singleton) ---

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
        icon: "file.settings",
        type: "settings",
      };
      setActiveTab(SETTINGS_TAB_ID);
      return [...prev, settingsTab];
    });
  }, []);

  // --- Close / Reorder ---

  const handleCloseTab = useCallback(
    async (id: string): Promise<boolean> => {
      const closing = tabsRef.current.find((t) => t.id === id);
      if (!closing) return false;
      if (closing.type === "molview" && closing.viewId !== undefined && opts?.confirmCloseTab) {
        const proceed = await opts.confirmCloseTab(closing.viewId);
        if (!proceed) return false;
      }

      // Re-read after the (possibly slow) confirm/save -- the tab list is the
      // source of truth and may have shifted while awaiting. All state updates
      // and side effects run at the top level, NOT inside a setTabs updater:
      // an updater must be pure, and calling removeMolTab (onMolViewClose) /
      // setActiveTab from within it made the molview teardown nondeterministic
      // on the save-then-close path -- the parallel molTabEntries removal could
      // be dropped, leaving the Explorer / Inspector pointed at the closed scene.
      const closingTab = tabsRef.current.find((t) => t.id === id);
      if (!closingTab) return false;
      const next = tabsRef.current.filter((t) => t.id !== id);

      setTabs(next);
      setActiveTab((currentActive) =>
        currentActive === id
          ? next.length > 0
            ? next[next.length - 1].id
            : ""
          : currentActive,
      );
      if (closingTab.type === "molview" && closingTab.viewId !== undefined) {
        opts?.onMolViewClose?.(closingTab.viewId);
      }
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

  // --- MolView tabs ---

  const addMolViewTab = useCallback((title: string, viewId: number) => {
    const newTab: TabData = {
      id: `molview-${Date.now()}`,
      title,
      icon: "file.molview",
      type: "molview",
      viewId,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTab(newTab.id);
  }, []);

  /**
   * Rewrite the title of the molview tab(s) bound to `viewId`. Used by the
   * scene-rename event sync so the tab strip reflects a rename made from the
   * Explorer (or any other UI). No-op if the title is unchanged or no
   * matching molview tab exists.
   */
  const updateMolViewTabTitle = useCallback((viewId: number, title: string) => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        if (t.type === "molview" && t.viewId === viewId && t.title !== title) {
          changed = true;
          return { ...t, title };
        }
        return t;
      });
      return changed ? next : prev;
    });
  }, []);

  return {
    tabs,
    tabsRef,
    activeTab,
    setActiveTab,
    openSettingsTab,
    addMolViewTab,
    updateMolViewTabTitle,
    handleCloseTab,
    handleReorderTabs,
  } as const;
}
