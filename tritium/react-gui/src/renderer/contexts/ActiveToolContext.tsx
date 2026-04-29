import React, { createContext, useContext } from 'react';
import type { ToolId } from '../data/viewportTools';

const ActiveToolContext = createContext<ToolId>('navigate');

export function ActiveToolProvider({
    children,
    activeTool,
}: {
    children: React.ReactNode;
    activeTool: ToolId;
}): React.JSX.Element {
    return (
        <ActiveToolContext.Provider value={activeTool}>
            {children}
        </ActiveToolContext.Provider>
    );
}

export function useActiveToolContext(): ToolId {
    return useContext(ActiveToolContext);
}
