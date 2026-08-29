/**
 * Every menu action is a real command.
 *
 * `MENU_ACTION_MAP` used to mix command ids with special markers
 * ('select-all', 'edit-cut', ...) that only `useMenuDispatch` knew how to run.
 * A menu entry could therefore not be reached from anywhere else, and a marker
 * whose handler went away failed silently at click time.
 *
 * The map holds command-id strings now. It lives in `shared/`, which cannot
 * import `CmdId` (the main process imports the map too), so the type system
 * cannot check the values -- these tests do, in both directions: every target
 * is a CmdId, and every target is registered by some command hook.
 */

import { describe, it, expect } from 'vitest';
import { CmdId } from '../commands/ids';
import {
    MENU_ACTION_MAP,
    MENU_DISPATCH_UNIMPLEMENTED,
    isUnimplementedMenuAction,
    type MenuActionChannel,
} from '@shared/menuActionMap';

/** Dispatch targets, minus the deliberate not-yet-ported placeholders. */
function liveTargets(): Array<[MenuActionChannel, string]> {
    return (Object.keys(MENU_ACTION_MAP) as MenuActionChannel[])
        .filter((ch) => !isUnimplementedMenuAction(ch))
        .map((ch) => [ch, MENU_ACTION_MAP[ch].dispatch]);
}

/** CmdId value -> its constant name, for readable failures. */
const NAME_OF: Record<string, string> = Object.fromEntries(
    Object.entries(CmdId).map(([name, value]) => [value, name]),
);

/**
 * Command ids the command layer names, read from the sources.
 *
 * A static scan rather than a full provider mount: registering the real
 * handlers needs a CueMol instance and the whole dialog tree, while the drift
 * worth catching is a menu row pointing at a command nothing implements. The
 * scan is deliberately loose -- any `CmdId.X` under `commands/` counts, since
 * a handler may be registered through a table or a wrapper -- so it can miss a
 * declared-but-unhandled id, never flag a handled one.
 */
function commandLayerCmdIds(): Set<string> {
    const sources = import.meta.glob('../commands/**/*.ts', {
        eager: true,
        query: '?raw',
        import: 'default',
    }) as Record<string, string>;
    const found = new Set<string>();
    for (const text of Object.values(sources)) {
        for (const m of text.matchAll(/CmdId\.([A-Za-z0-9_]+)/g)) {
            const value = (CmdId as Record<string, string>)[m[1]];
            if (value) found.add(value);
        }
    }
    return found;
}

describe('MENU_ACTION_MAP dispatch targets', () => {
    it('are all CmdId values -- no leftover special markers', () => {
        const ids = new Set<string>(Object.values(CmdId));
        expect(liveTargets().filter(([, target]) => !ids.has(target))).toEqual([]);
    });

    it('leave no value that is neither a command nor the unimplemented marker', () => {
        // Nothing currently uses the marker -- every menu entry is ported --
        // but it stays as the declared way to park a template item, so this
        // allows it without requiring it.
        const allowed = new Set<string>([...Object.values(CmdId), MENU_DISPATCH_UNIMPLEMENTED]);
        const strays = (Object.keys(MENU_ACTION_MAP) as MenuActionChannel[])
            .map((ch) => MENU_ACTION_MAP[ch].dispatch)
            .filter((v) => !allowed.has(v));
        expect([...new Set(strays)]).toEqual([]);
    });

    it('are each implemented by the command layer', () => {
        const registered = commandLayerCmdIds();
        // Sanity: the scan found the sources at all.
        expect(registered.size).toBeGreaterThan(20);
        const orphans = liveTargets()
            .filter(([, target]) => !registered.has(target))
            .map(([channel, target]) => `${channel} -> ${NAME_OF[target] ?? target}`);
        expect(orphans).toEqual([]);
    });
});
