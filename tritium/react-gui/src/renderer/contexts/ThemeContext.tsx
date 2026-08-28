/**
 * @file contexts/ThemeContext.tsx
 * @description React context that manages the application colour theme.
 *
 * Responsibilities:
 *   1. Provide `theme` ("dark" | "light") and `toggleTheme` to the tree.
 *   2. Apply/remove the `data-theme` attribute on the document root so that
 *      CSS custom-property overrides in `_variables.css` take effect.
 *   3. Persist the user's choice to electron-store via the existing
 *      `saveUi` IPC channel.
 *
 * The context is intentionally separated from `useLayoutPersistence` because
 * theme state needs to be available very early (before the layout hook has
 * finished loading) -- the wrapper `<div>` in `main.tsx` must know the
 * Blueprint class name at first render to avoid a flash of wrong colours.
 *
 * ## Usage
 *
 * ```tsx
 * // Wrap the tree once (done in main.tsx):
 * <ThemeProvider>
 *   <App />
 * </ThemeProvider>
 *
 * // Consume anywhere:
 * const { theme, toggleTheme } = useTheme();
 * ```
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { IPC } from "@shared/ipcChannels";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

/** Supported colour themes. */
export type Theme = "dark" | "light";

interface ThemeContextValue {
  /** Current active theme. */
  theme: Theme;
  /** Switch to the opposite theme. */
  toggleTheme: () => void;
  /** Set a specific theme. */
  setTheme: (t: Theme) => void;
}

// ------------------------------------------------------------
// Context
// ------------------------------------------------------------

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ------------------------------------------------------------
// DOM side-effects
// ------------------------------------------------------------

/**
 * Apply the theme to the document root element.
 * - Sets `data-theme` attribute so CSS variable overrides kick in.
 * - Removes or adds the `bp5-dark` class on the theme wrapper for Blueprint.
 */
function applyThemeToDOM(theme: Theme): void {
  // CSS custom properties: :root[data-theme="light"] { ... }
  document.documentElement.setAttribute("data-theme", theme);
}

// ------------------------------------------------------------
// Provider
// ------------------------------------------------------------

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>("dark");

  // -- Load persisted theme on mount -----------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const ui = await window.electronAPI?.invoke(IPC.UI_LOAD);
        if (!cancelled && ui?.theme) {
          setThemeState(ui.theme);
          applyThemeToDOM(ui.theme);
        }
      } catch {
        // Electron not available (Vite dev server) -- keep default.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // -- Keep DOM in sync whenever theme changes -------------
  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  // -- Public setters --------------------------------------
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    // Persist immediately -- theme changes are infrequent; no debounce needed.
    window.electronAPI?.invoke(IPC.UI_SAVE, { theme: t });
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      window.electronAPI?.invoke(IPC.UI_SAVE, { theme: next });
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme],
  );

  /*
   * The wrapper div serves two purposes:
   *   1. `className` -- Blueprint.js reads `bp5-dark` to style its own
   *      components; omitting the class means Blueprint renders in light mode.
   *   2. Sizing -- fills the root container.
   */
  return (
    <ThemeContext.Provider value={value}>
      <div
        className={theme === "dark" ? "bp5-dark" : ""}
        style={{ width: "100%", height: "100%" }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

// ------------------------------------------------------------
// Hook
// ------------------------------------------------------------

/**
 * Access the current theme and toggle/set functions.
 * Must be called inside a `<ThemeProvider>`.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme() must be used within a <ThemeProvider>.");
  }
  return ctx;
}
