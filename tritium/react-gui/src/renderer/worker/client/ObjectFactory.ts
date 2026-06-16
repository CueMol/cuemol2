/**
 * @file renderer/worker/client/ObjectFactory.ts
 * @description Renderer-side class-registry query helper.
 *
 * Used by `AsyncCueMol` as a facade for `hasClass` / `getAllClassNamesJSON`
 * introspection calls. The renderer no longer mints C++ object handles
 * (the old `createObj` / `getService` ObjProxy bridge was removed -- see
 * ADR-0033); all object work runs in worker services over the numeric-id
 * service path.
 */
import { WorkerTransport } from './WorkerTransport';

const log = console;

/**
 * Factory for renderer-side class-registry queries.
 */
export class ObjectFactory {
    private _transport: WorkerTransport;

    /**
     * @param transport - Worker transport used for `hasClass` /
     *   `getAllClassNamesJSON` IPC calls.
     */
    constructor(transport: WorkerTransport) {
        this._transport = transport;
    }

    /**
     * Check whether a class name is registered with the C++ class
     * registry.
     *
     * @param className - Class name to probe.
     * @returns `true`/`false`, or `null` on transport failure.
     */
    async hasClass(className: string): Promise<boolean | null> {
        try {
            const result = await this._transport.invokeWorker('hasClass', className);
            if (result === null) {
                log.warn(`hasClass failed for class: ${className}`);
                return null;
            }
            return result[0] as boolean;
        } catch (e) {
            log.error('hasClass failed:', e);
        }
        return null;
    }

    /**
     * Return a JSON document listing every class known to the C++ class
     * registry. Used to populate dev / introspection tools.
     *
     * @returns JSON string, or `null` on failure.
     */
    async getAllClassNamesJSON(): Promise<string | null> {
        try {
            const result = await this._transport.invokeWorker('getAllClassNamesJSON');
            if (result === null) {
                log.warn('getAllClassNamesJSON failed');
                return null;
            }
            return result[0] as string;
        } catch (e) {
            log.error('getAllClassNamesJSON failed:', e);
        }
        return null;
    }
}
