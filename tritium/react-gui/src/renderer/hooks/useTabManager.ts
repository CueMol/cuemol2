/**
 * @file hooks/useTabManager.ts
 * @description Custom hook that manages the editor tab bar: opening,
 * closing, selecting, reordering, and creating new file tabs.
 *
 * File-open operations work in two modes:
 *
 * 1. **Electron** — uses `window.electronAPI.openFile()` which triggers
 *    the native file dialog; the result arrives asynchronously via
 *    the `onFileOpened` IPC event (wired up in `App.tsx`).
 * 2. **Browser fallback** — opens one of the built-in sample files via
 *    a `window.prompt` chooser (development convenience only).
 *
 * Special tab types (e.g. Settings) are opened via dedicated helpers
 * that create singleton tabs with the appropriate `type` discriminator.
 */

import { useState, useRef, useCallback } from "react";
import type { TabData } from "../types";
import { SAMPLE_FILES } from "../data/sampleData";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/** Well-known tab id for the Settings pane (singleton). */
const SETTINGS_TAB_ID = "__settings__";

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

export function useTabManager() {
  const [tabs, setTabs] = useState<TabData[]>([
    { id: "welcome", title: "Welcome", icon: "home", content: null },
  ]);
  const [activeTab, setActiveTab] = useState("welcome");
  const tabCounter = useRef(1);

  // ── Open a file from known content ───────────────────────

  /**
   * Add a tab for the given file content, or focus its existing tab
   * if it is already open.
   */
  const openFileFromData = useCallback(
    (name: string, content: string, filePath?: string) => {
      setTabs((prev) => {
        const existing = prev.find((t) => t.title === name);
        if (existing) {
          setActiveTab(existing.id);
          return prev;
        }

        const newTab: TabData = {
          id: `file-${Date.now()}`,
          title: name,
          icon: "document",
          content,
          filePath,
          type: "codeview",
        };
        setActiveTab(newTab.id);
        return [...prev, newTab];
      });
    },
    [],
  );

  // ── Open via dialog or browser fallback ──────────────────

  /** Trigger the native file-open dialog (Electron) or a prompt fallback. */
  const handleOpenFile = useCallback(() => {
    if (window.electronAPI) {
      window.electronAPI.openFile();
    } else {
      const files = Object.keys(SAMPLE_FILES);
      const choice = window.prompt(
        `Open file:\n${files.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\nEnter number:`,
        "1",
      );
      if (choice) {
        const idx = parseInt(choice) - 1;
        if (idx >= 0 && idx < files.length) {
          openFileFromData(files[idx], SAMPLE_FILES[files[idx]]);
        }
      }
    }
  }, [openFileFromData]);

  // ── Settings tab (singleton) ─────────────────────────────

  /**
   * Open the Settings tab, or focus it if already open.
   *
   * The Settings tab is a singleton: only one instance can exist at a
   * time, identified by the well-known id `SETTINGS_TAB_ID`.
   * Clicking the gear icon while Settings is already active is a no-op.
   */
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
        content: null,
        type: "settings",
      };
      setActiveTab(SETTINGS_TAB_ID);
      return [...prev, settingsTab];
    });
  }, []);

  // ── Close / New / Save / Reorder ─────────────────────────

  const handleCloseTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.id !== id);
        // If the closing tab was active, switch to the last remaining tab.
        setActiveTab((currentActive) => {
          if (currentActive === id && next.length > 0) {
            return next[next.length - 1].id;
          }
          return next.length === 0 ? "" : currentActive;
        });
        return next;
      });
    },
    [],
  );

  const handleNewTab = useCallback(() => {
    tabCounter.current++;
    const t: TabData = {
      id: `untitled-${Date.now()}`,
      title: `Untitled-${tabCounter.current}`,
      icon: "document",
      content: "",
      type: "codeview",
    };
    setTabs((prev) => [...prev, t]);
    setActiveTab(t.id);
  }, []);

  /**
   * Reorder tabs by moving a tab to a new position relative to a target.
   *
   * @param fromId      - The id of the tab being dragged.
   * @param toId        - The id of the tab at the drop target position.
   * @param insertAfter - When true the dragged tab is placed *after* the
   *                       target; when false it is placed *before*.
   */
  const handleReorderTabs = useCallback(
    (fromId: string, toId: string, insertAfter: boolean = false) => {
      if (fromId === toId) return;

      setTabs((prev) => {
        const fromIndex = prev.findIndex((t) => t.id === fromId);
        const toIndex = prev.findIndex((t) => t.id === toId);
        if (fromIndex === -1 || toIndex === -1) return prev;

        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);

        // After removing the source element every index at or beyond
        // fromIndex shifts down by one.  Re-locate the target in the
        // shortened array.
        let insertIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;

        // If the cursor was on the right half of the target, insert
        // one position further (i.e. after the target).
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

  /**
   * Add a new MolView tab for the given view.
   * Each call creates a distinct tab (not a singleton).
   */
  const addMolViewTab = useCallback((title: string, viewId: number) => {
    const newTab: TabData = {
      id: `molview-${Date.now()}`,
      title,
      icon: "cube",
      content: null,
      type: "molview",
      viewId,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTab(newTab.id);
  }, []);

  /**
   * Placeholder save handler.
   * In the real application this dispatches a save command to the backend.
   */
  const handleSave = useCallback(() => {
    // TODO: dispatch save via IPC
  }, []);

  return {
    tabs,
    activeTab,
    setActiveTab,
    openFileFromData,
    openSettingsTab,
    addMolViewTab,
    handleOpenFile,
    handleCloseTab,
    handleNewTab,
    handleReorderTabs,
    handleSave,
  } as const;
}
