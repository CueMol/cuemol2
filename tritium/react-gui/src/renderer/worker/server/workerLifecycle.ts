import type { CueMol } from '@cuemol/core/src/cuemol';
import type { ScrEventManager } from '@cuemol/core/src/wrappers/ScrEventManager';
import type { StyleManager } from '@cuemol/core/src/wrappers/StyleManager';
import type { ViewInputConfig } from '@cuemol/core/src/wrappers/ViewInputConfig';
import * as event from '@renderer/worker/shared/eventConst';
import { renderText } from './textRender';
import { isValidUid } from '@renderer/worker/shared/uid';

/**
 * Worker bootstrap / configuration helpers extracted from `WorkerService`.
 * These are the operations performed while bringing the worker online:
 * user-style loading, input-config selection, and event-manager wiring.
 */

const log = console;

/**
 * Load the user style set. With a path, loads that file; without one,
 * creates an empty "user" style set. Falls back to an empty set when the
 * file load throws. Backs the `loadUserStyle` worker entry point.
 */
export function loadUserStyle(cm: CueMol, userStylePath?: string): boolean {
    const stylem = cm.getService('StyleManager') as StyleManager;
    if (stylem === null) {
        log.error('Worker> StyleManager unavailable; skip user style');
        return false;
    }
    try {
        if (userStylePath) {
            log.info(`Worker> loading user style file: ${userStylePath}`);
            stylem.loadStyleSetFromFile(0, userStylePath, false);
        } else {
            log.info('Worker> user style absent; createStyleSet("user", 0)');
            stylem.createStyleSet('user', 0);
        }
        return true;
    } catch (e) {
        log.warn('Worker> user style load failed, fallback to createStyleSet:', e);
        try {
            stylem.createStyleSet('user', 0);
            return true;
        } catch (e2) {
            log.error('Worker> createStyleSet fallback also failed:', e2);
            return false;
        }
    }
}

/**
 * Save the "user" style set to `userStylePath`. Mirrors UXP
 * `Qm2Main.onUnLoad` (cuemol2.js:297-304): resolve the user style set uid via
 * `hasStyleSet("user", 0)` and write it out with `saveStyleSetToFile`. Backs
 * the `saveUserStyle` worker entry point; called on window close so
 * user-defined defaults (DefaultLabel.*, UserViewConf.*) persist across
 * sessions. Returns false when no user set exists or the write fails.
 */
export function saveUserStyle(cm: CueMol, userStylePath: string): boolean {
    const stylem = cm.getService('StyleManager') as StyleManager;
    if (stylem === null) {
        log.error('Worker> StyleManager unavailable; skip user style save');
        return false;
    }
    try {
        const uid = stylem.hasStyleSet('user', 0);
        if (!isValidUid(uid)) {
            log.info('Worker> no "user" style set; nothing to save');
            return false;
        }
        log.info(`Worker> saving user style file: ${userStylePath}`);
        return stylem.saveStyleSetToFile(0, uid, userStylePath);
    } catch (e) {
        log.error('Worker> user style save failed:', e);
        return false;
    }
}

/** Set the active ViewInputConfig style (mouse / gesture binding preset). */
export function setViewInputConfigStyle(cm: CueMol, styleName: string): boolean {
    const vic = cm.getService('ViewInputConfig') as ViewInputConfig;
    if (vic === null) {
        log.error('Worker> ViewInputConfig unavailable; skip style set');
        return false;
    }
    try {
        vic.style = styleName;
        log.info(`Worker> ViewInputConfig.style = ${styleName}`);
        return true;
    } catch (e) {
        log.error('Worker> ViewInputConfig.style set failed:', e);
        return false;
    }
}

/**
 * Subscribe to the CueMol event manager. `renderText` events are handled
 * synchronously in-thread (the native TextRender object cannot cross
 * postMessage); every other event is forwarded to the renderer via
 * `postMessage(['event-notify', ...])`.
 *
 * @returns The listener id, so a teardown can hand it back to
 *   `evtMgr.removeListener`. The id used to be dropped on the floor, which
 *   left the C++ side holding a callback into a worker that was shutting
 *   down -- harmless while the worker lives as long as the app, and not
 *   harmless the moment one is re-initialised.
 */
export function registerWorkerEventListener(
    evtMgr: ScrEventManager,
    cm: CueMol,
    postMessage: (data: any[]) => void,
): number {
    evtMgr.append('renderText', event.SEM_EXTND, event.SEM_OTHER, event.SEM_ANY);
    return evtMgr.addListener((...args: any[]) => {
        const category = args[1];
        if (category === 'renderText') {
            // Handle synchronously in the Worker thread using OffscreenCanvas 2D.
            // The native TextRender object cannot be transferred via postMessage.
            const trObj = args[5];
            renderText(cm, trObj);
            return;
        }
        try {
            postMessage(['event-notify', ...args]);
        } catch (e) {
            log.error('Worker> event manager notify failed:', e);
        }
    });
}
