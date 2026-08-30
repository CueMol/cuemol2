/**
 * @file contexts/ActiveToolContext.tsx
 * @description The active viewport tool, owned here rather than by App.
 *
 * Three contexts so a subscriber pays only for what it reads: the tool id
 * (click handlers, the tool palette), its definition (the status bar), and
 * the setter (the palette; stable, never re-renders). The keyboard
 * shortcuts are part of `useActiveTool`, which the provider calls.
 */

import React, { createContext, useContext } from 'react';
import type { ToolId, ToolDef } from '@renderer/data/viewportTools';
import { TOOL_BY_ID } from '@renderer/data/viewportTools';
import { useActiveTool } from '@renderer/features/molview/useActiveTool';

const IdContext = createContext<ToolId>('navigate');
const DefContext = createContext<ToolDef>(TOOL_BY_ID.navigate);
const SetContext = createContext<((id: ToolId) => void) | null>(null);

export function ActiveToolProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const { activeTool, activeDef, setActiveTool } = useActiveTool();
    return (
        <SetContext.Provider value={setActiveTool}>
            <DefContext.Provider value={activeDef}>
                <IdContext.Provider value={activeTool}>{children}</IdContext.Provider>
            </DefContext.Provider>
        </SetContext.Provider>
    );
}

/** The active tool's id. */
export function useActiveToolContext(): ToolId {
    return useContext(IdContext);
}

/** The active tool's definition (label, shortcut, icon). */
export function useActiveToolDef(): ToolDef {
    return useContext(DefContext);
}

/** Stable setter for the active tool. */
export function useSetActiveTool(): (id: ToolId) => void {
    const v = useContext(SetContext);
    if (v === null) throw new Error('useSetActiveTool must be used inside ActiveToolProvider');
    return v;
}
