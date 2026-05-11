import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    StreamProgressDialog,
    type StreamProgressStatus,
} from './StreamProgressDialog';

// React import required by JSX classic runtime in vitest; do not remove.
void React;

export interface StreamProgressShowOptions {
    title: string;
    onCancel: () => void;
}

export interface StreamProgressApi {
    show: (opts: StreamProgressShowOptions) => void;
    update: (bytesReceived: number) => void;
    setCanceling: () => void;
    hide: () => void;
}

interface InternalState {
    visible: boolean;
    title: string;
    bytes: number;
    status: StreamProgressStatus;
}

const Ctx = createContext<StreamProgressApi | null>(null);

export const StreamProgressDialogProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [state, setState] = useState<InternalState>({
        visible: false,
        title: '',
        bytes: 0,
        status: 'downloading',
    });
    // Keep the latest user-supplied cancel callback in a ref so updating it
    // doesn't recreate the dialog props or invalidate the API identity.
    const onCancelRef = useRef<() => void>(() => { });

    const api = useMemo<StreamProgressApi>(() => ({
        show: ({ title, onCancel }) => {
            onCancelRef.current = onCancel;
            setState({ visible: true, title, bytes: 0, status: 'downloading' });
        },
        update: (bytes) => {
            setState((s) => (s.visible ? { ...s, bytes } : s));
        },
        setCanceling: () => {
            setState((s) => (s.visible ? { ...s, status: 'canceling' } : s));
        },
        hide: () => {
            onCancelRef.current = () => { };
            setState({ visible: false, title: '', bytes: 0, status: 'downloading' });
        },
    }), []);

    const handleCancel = useCallback(() => {
        // Flip UI to "Canceling…" first, then run the user-supplied cancel handler.
        setState((s) => (s.visible ? { ...s, status: 'canceling' } : s));
        try {
            onCancelRef.current();
        } catch (e) {
            console.warn('StreamProgressDialog onCancel threw:', e);
        }
    }, []);

    return (
        <Ctx.Provider value={api}>
            {children}
            <StreamProgressDialog
                visible={state.visible}
                title={state.title}
                bytesReceived={state.bytes}
                status={state.status}
                onCancel={handleCancel}
            />
        </Ctx.Provider>
    );
};

export function useStreamProgressDialog(): StreamProgressApi {
    const api = useContext(Ctx);
    if (!api) {
        throw new Error('useStreamProgressDialog must be used inside <StreamProgressDialogProvider>');
    }
    return api;
}
