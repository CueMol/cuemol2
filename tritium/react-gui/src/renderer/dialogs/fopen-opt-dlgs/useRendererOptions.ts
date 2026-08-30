/**
 * @file dialogs/fopen-opt-dlgs/useRendererOptions.ts
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
import { useCueMol } from '@renderer/hooks/cuemol/useCueMol';
import type { PresetTypeEntry, RendererOptions } from './types';
import { getDefaultRendType, setDefaultRendType } from './rendTypeHistory';
import { presetNamePrefix } from './presetUtils';

export interface UseRendererOptionsArgs {
    /** Dialog visibility -- a false->true transition resets the state. */
    visible: boolean;
    sceneId: number;
    /** C++ object class name; the renderer-type history key. '' disables history. */
    objClassName: string;
    /** Compatible renderer types listed in the dropdown. */
    rendererTypes: string[];
    /** Renderer presets offered in the dropdown's Presets optgroup. */
    presetTypes?: PresetTypeEntry[];
    /** Seed for `options.objectName`. */
    objectName: string;
    /** Optional seed for `options.rendererName` (the name-follow effect
     *  overrides it once the worker resolves a unique name). */
    initialRendererName?: string;
    /**
     * When a non-empty expression is given, the Selection checkbox starts
     * enabled with this expression (e.g. the target mol's current `mol.sel`).
     * Omitted / empty -> checkbox off, selection `*` (all atoms).
     */
    initialSelection?: string;
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
    const { visible, sceneId, objClassName, rendererTypes, presetTypes,
        objectName, initialRendererName, initialSelection } = args;
    const { cm } = useCueMol();

    const presets = useMemo(() => presetTypes ?? [], [presetTypes]);

    // Initial pick: the history value when it is still offered -- it may
    // name a preset or a plain renderer type -- else the first compatible
    // type. Presets are never the default without history (deliberate
    // deviation from UXP, which preselected the first preset; ADR-0046).
    const initialPick = useMemo(() => {
        const first = rendererTypes[0] ?? '';
        const hist = getDefaultRendType(objClassName);
        if (hist) {
            if (presets.some((p) => p.name === hist)) {
                return { rendererType: first, presetName: hist as string | undefined };
            }
            if (rendererTypes.includes(hist)) {
                return { rendererType: hist, presetName: undefined };
            }
        }
        return { rendererType: first, presetName: undefined };
    }, [rendererTypes, presets, objClassName]);

    const buildOptions = useCallback((): RendererOptions => {
        const seedSel = (initialSelection ?? '').trim();
        const pName = initialPick.presetName;
        // Name seed; the name-follow effect replaces it with a scene-wide
        // unique proposal right after open.
        const nameSeed = pName
            ? `${presetNamePrefix(pName)}1`
            : initialRendererName ??
              (initialPick.rendererType ? `${initialPick.rendererType}1` : '');
        return {
            objectName,
            rendererType: initialPick.rendererType,
            rendererName: nameSeed,
            // A non-empty current selection starts the checkbox on, targeting it.
            selectionEnabled: seedSel !== '',
            selection: seedSel !== '' ? seedSel : '*',
            centerView: true,
            presetName: pName,
        };
    }, [objectName, initialPick, initialRendererName, initialSelection]);

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
        // A preset derives its short prefix ('Default1RendPreset' ->
        // 'default1_' -> 'default1_1'); a plain type uses the type name.
        const prefix = options.presetName
            ? presetNamePrefix(options.presetName)
            : options.rendererType;
        if (!prefix) return;
        if (!rendererNameIsDefaultRef.current) return;
        const seq = ++rendNameSeqRef.current;
        (async () => {
            const res = await cm.invokeService('proposeUniqName', {
                kind: 'sceneRenderer',
                prefix,
                sceneId,
            });
            if (seq !== rendNameSeqRef.current) return; // stale
            // The user may have typed while the worker resolved.
            if (!rendererNameIsDefaultRef.current) return;
            if (!res) return;
            setOptions((prev) => ({ ...prev, rendererName: res.name }));
        })();
    }, [cm, visible, options.rendererType, options.presetName, sceneId]);

    // User edits to the renderer name: propagate the value and silently
    // update the "is default" ref so the next type pick respects it.
    // Updating the ref does not re-fire the name-follow effect.
    const onRendererNameUserEdit = useCallback((newName: string) => {
        setOptions((prev) => ({ ...prev, rendererName: newName }));
        rendererNameIsDefaultRef.current = newName.length === 0;
    }, []);

    const commitHistory = useCallback(() => {
        // A preset pick stores the preset style name; a stale entry (style
        // removed later) simply fails the membership check on the next open
        // and falls back to the first plain type.
        setDefaultRendType(objClassName, options.presetName ?? options.rendererType);
    }, [objClassName, options.presetName, options.rendererType]);

    return { options, setOptions, onRendererNameUserEdit, commitHistory };
}
