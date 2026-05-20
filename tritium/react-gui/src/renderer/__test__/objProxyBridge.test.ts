import { describe, it, expect, vi } from 'vitest';
import { ObjProxyBridge } from '../worker/server/objProxyBridge';
import { ObjTuple } from '../worker/shared/ObjTuple';

/**
 * Degrade-detection test for ObjProxyBridge — the ObjProxy ⇄ native-object
 * transport bridge extracted from WorkerService in Phase 2. Pins the slot
 * round-trip: a native object created through the bridge becomes an
 * ObjTuple, and a later call carrying that ObjTuple resolves back to the
 * same native via the slot table.
 */

type BridgeArgs = ConstructorParameters<typeof ObjProxyBridge>;
function makeBridge(internal: object, cm: object): ObjProxyBridge {
    return new ObjProxyBridge(
        internal as unknown as BridgeArgs[0],
        cm as unknown as BridgeArgs[1],
    );
}

describe('ObjProxyBridge', () => {
    it('createObj registers the native and getProp resolves it back', () => {
        const native = { toObjID: () => 'slot-1', getClassName: () => 'Foo' };
        const wrapper = { getProp: vi.fn(() => 'red') };
        const internal = { createObj: vi.fn(() => native), getService: vi.fn() };
        const cm = { createWrapper: vi.fn(() => wrapper) };
        const bridge = makeBridge(internal, cm);

        const tuple = bridge.createObj('Foo');
        expect(tuple).toBeInstanceOf(ObjTuple);
        expect((tuple as ObjTuple).objId).toBe('slot-1');
        expect((tuple as ObjTuple).className).toBe('Foo');

        const value = bridge.getProp(tuple as ObjTuple, 'color');
        // getProp resolved the slot, wrapped the native, and read the prop.
        expect(cm.createWrapper).toHaveBeenCalledWith(native);
        expect(wrapper.getProp).toHaveBeenCalledWith('color');
        // Primitive results pass through un-wrapped.
        expect(value).toBe('red');
    });

    it('wraps a native return value into a fresh ObjTuple', () => {
        const child = { toObjID: () => 'child', getClassName: () => 'Bar' };
        const native = { toObjID: () => 'parent', getClassName: () => 'Foo' };
        const wrapper = { getProp: vi.fn(() => child) };
        const internal = { createObj: vi.fn(() => native), getService: vi.fn() };
        const cm = { createWrapper: vi.fn(() => wrapper) };
        const bridge = makeBridge(internal, cm);

        const parent = bridge.createObj('Foo') as ObjTuple;
        const result = bridge.getProp(parent, 'child');
        expect(result).toBeInstanceOf(ObjTuple);
        expect((result as ObjTuple).className).toBe('Bar');
    });

    it('createObj returns null when the native module yields null', () => {
        const internal = { createObj: vi.fn(() => null), getService: vi.fn() };
        const bridge = makeBridge(internal, { createWrapper: vi.fn() });
        expect(bridge.createObj('Nope')).toBeNull();
    });

    it('getProp returns null for an ObjTuple with an unknown slot', () => {
        const cm = { createWrapper: vi.fn() };
        const bridge = makeBridge({ createObj: vi.fn(), getService: vi.fn() }, cm);
        const orphan = new ObjTuple('ghost-slot', 'Foo');
        expect(bridge.getProp(orphan, 'x')).toBeNull();
        expect(cm.createWrapper).not.toHaveBeenCalled();
    });

    it('hasClass / getAllClassNamesJSON forward to CueMol', () => {
        const cm = {
            hasClass: vi.fn((n: string) => n === 'Known'),
            getAllClassNamesJSON: vi.fn(() => '["A","B"]'),
            createWrapper: vi.fn(),
        };
        const bridge = makeBridge({ createObj: vi.fn(), getService: vi.fn() }, cm);
        expect(bridge.hasClass('Known')).toBe(true);
        expect(bridge.hasClass('Other')).toBe(false);
        expect(bridge.getAllClassNamesJSON()).toBe('["A","B"]');
    });

    it('invokeMethod resolves ObjTuple args back to natives, keeps primitives', () => {
        const argNative = { toObjID: () => 'arg-slot', getClassName: () => 'Arg' };
        const thisNative = { toObjID: () => 'this-slot', getClassName: () => 'Foo' };
        const wrapper = { invokeMethod: vi.fn(() => 0) };
        const internal = {
            createObj: vi.fn((c: string) => (c === 'Arg' ? argNative : thisNative)),
            getService: vi.fn(),
        };
        const cm = { createWrapper: vi.fn(() => wrapper) };
        const bridge = makeBridge(internal, cm);

        const argTuple = bridge.createObj('Arg') as ObjTuple;
        const thisTuple = bridge.createObj('Foo') as ObjTuple;
        bridge.invokeMethod('doStuff', thisTuple, [argTuple, 7]);

        // thisobj resolved to its native; ObjTuple arg resolved, primitive kept.
        expect(cm.createWrapper).toHaveBeenLastCalledWith(thisNative);
        expect(wrapper.invokeMethod).toHaveBeenCalledWith('doStuff', argNative, 7);
    });
});
