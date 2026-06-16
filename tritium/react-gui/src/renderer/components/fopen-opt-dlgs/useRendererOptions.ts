/**
 * @file useRendererOptions.ts
 * @description Shared renderer-options behaviour for the dialogs that embed
 * `RendererOptionsPane` (the file-open option dialog and the "New Renderer"
 * dialog).
 *
 * Two UXP-parity behaviours live here so neither dialog has to reimplement
 * them:
 *
 *   1. Renderer-type history -- the initially selected type is restored from
 *      per-objClassName localStorage history (`rendTypeHistory`), and
 *      `commitHistory()` writes the chosen type back on confirm.
 *   2. Default renderer name follow -- while the renderer name is still the
 *      auto-generated default, changing the renderer type re-derives a
 *      scene-wide unique name via the worker `proposeUniqName` service.
 *      Once the user edits the name, the follow stops (UXP mRendNameDefault).
 *
 * `RendererOptionsPane` stays a pure presentational component; this hook is
 * the behaviour layer the dialogs compose with it.
 */

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { useCueMol } from '../../hooks/useCueMol';
import type { RendererOptions } from './types';
import { getDefaultRendType, setDefaultRendType } from './rendTypeHistory';

export interface UseRendererOptionsArgs {
    /** Dialog visibility -- a false->true transition resets the state. */
    visible: boolean;
    sceneId: number;
    /** C++ object class name; the renderer-type history key. '' disables history. */
    objClassName: string;
    /** Compatible renderer types listed in the dropdown. */
    rendererTypes: string[];
    /** Seed for `options.objectName`. */
    objectName: string;
    /** Optional seed for `options.rendererName` (the name-follow effect
     *  overrides it once the worker resolves a unique name). */
    initialRendererName?: string;
}

export interface UseRendererOptionsResult {
    options: RendererOptions;
    setOptions: Dispatch<SetStateAction<RendererOptions>>;
    /** Routes renderer-name keystrokes; clears the auto-follow flag on edit. */
    onRendererNameUserEdit: (newName: string) => void;
    /** Persists the selected renderer type to history -- call on confirm. */
    commitHistory: () => void;
}

export function useRendererOptions(
    args: UseRendererOptionsArgs,
): UseRendererOptionsResult {
    const { visible, sceneId, objClassName, rendererTypes, objectName,
        initialRendererName } = args;
    const { cm } = useCueMol();

    // Initial renderer type: history value if still listed, else the first
    // compatible type.
    const initialType = useMemo(() => {
        if (rendererTypes.length === 0) return '';
        const hist = getDefaultRendType(objClassName);
        if (hist && rendererTypes.includes(hist)) return hist;
        return rendererTypes[0];
    }, [rendererTypes, objClassName]);

    const buildOptions = useCallback((): RendererOptions => ({
        objectName,
        rendererType: initialType,
        rendererName: initialRendererName ?? (initialType ? `${initialType}1` : ''),
        selectionEnabled: false,
        selection: '*',
        centerView: true,
    }), [objectName, initialType, initialRendererName]);

    const [options, setOptions] = useState<RendererOptions>(buildOptions);

    // Tracks whether the renderer name is still the auto-generated default
    // (no user edit since the last reset). Mirrors UXP mRendNameDefault.
    // A ref, not state, so toggling it mid-edit does not re-fire the
    // name-follow effect.
    const rendererNameIsDefaultRef = useRef(true);
    // Stale-response guard for the async proposeUniqName fetch.
    const rendNameSeqRef = useRef(0);
    // Detects the false->true visibility transition without re-firing on
    // every render.
    const prevVisibleRef = useRef(visible);

    // Reset the renderer state each time the dialog opens so it reflects
    // the latest pre-fetch (UXP rebuilds the page on every open).
    useEffect(() => {
        const wasVisible = prevVisibleRef.current;
        prevVisibleRef.current = visible;
        if (visible && !wasVisible) {
            setOptions(buildOptions());
            rendererNameIsDefaultRef.current = true;
            rendNameSeqRef.current += 1;
        }
    }, [visible, buildOptions]);

    // While the renderer name is still the auto-default, resolve a
    // scene-wide unique name for the currently selected type. UXP
    // re-generates the suggestion on every type change.
    //
    // The flag is read from a ref (NOT a dep) so mid-edit keystrokes do not
    // retrigger this effect; it fires only on real navigation (type pick,
    // dialog open).
    useEffect(() => {
        if (!visible || !cm) return;
        const rType = options.rendererType;
        if (!rType) return;
        if (!rendererNameIsDefaultRef.current) return;
        const seq = ++rendNameSeqRef.current;
        (async () => {
            const res = await cm.proposeUniqName({
                kind: 'sceneRenderer',
                prefix: rType,
                sceneId,
            });
            if (seq !== rendNameSeqRef.current) return; // stale
            // The user may have typed while the worker resolved.
            if (!rendererNameIsDefaultRef.current) return;
            if (!res) return;
            setOptions((prev) => ({ ...prev, rendererName: res.name }));
        })();
    }, [cm, visible, options.rendererType, sceneId]);

    // User edits to the renderer name: propagate the value and silently
    // update the "is default" ref so the next type pick respects it.
    // Updating the ref does not re-fire the name-follow effect.
    const onRendererNameUserEdit = useCallback((newName: string) => {
        setOptions((prev) => ({ ...prev, rendererName: newName }));
        rendererNameIsDefaultRef.current = newName.length === 0;
    }, []);

    const commitHistory = useCallback(() => {
        setDefaultRendType(objClassName, options.rendererType);
    }, [objClassName, options.rendererType]);

    return { options, setOptions, onRendererNameUserEdit, commitHistory };
}
