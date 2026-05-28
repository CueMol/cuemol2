import { wrapper_map } from './wrappers/wrapper-loader';
import { BaseWrapper } from './BaseWrapper';
import type { Vector } from './wrappers/Vector';
import type { SelCommand } from './wrappers/SelCommand';
import type { Color } from './wrappers/Color';
import { AbstractColor } from './wrappers/AbstractColor';
import type { TimeValue } from './wrappers/TimeValue';
import { Scene } from './wrappers/Scene';
import { View } from './wrappers/View';
import type { SceneManager } from './wrappers/SceneManager';
import type { StreamManager } from './wrappers/StreamManager';
import { StyleManager } from './wrappers/StyleManager';
import type { ByteArray } from './wrappers/ByteArray';
import { Object } from './wrappers/Object';
import { Renderer } from './wrappers/Renderer';
import type { CueMolInternal, IWrappedObject, MemoryTrackingStats, NativeObject } from './interfaces';

/**
 * CueMol constructor options
 */
interface CueMolOptions {
    internal: CueMolInternal;
}

/**
 * Main CueMol API class
 * 
 * Provides TypeScript interface to CueMol's molecular visualization functionality.
 * This class wraps the native C++ implementation and provides type-safe access
 * to CueMol objects and services.
 * 
 * @example
 * ```typescript
 * import { createCueMol, getSysConfigPath } from './index';
 * 
 * const cm = createCueMol(getSysConfigPath());
 * const vector = cm.createVector(1, 2, 3);
 * const scene = cm.createScene();
 * ```
 */
export class CueMol {
    private _internal: CueMolInternal;

    /**
     * Create a new CueMol instance
     * @param value - Options containing the internal native module
     */
    constructor(value: CueMolOptions) {
        this._internal = value.internal;
    }

    /**
     * Get the internal native module
     * @returns The C++ native module interface
     */
    get internal(): CueMolInternal {
        return this._internal;
    }

    /**
     * Initialize CueMol with optional configuration file
     * @param config - Path to sysconfig.xml file (optional)
     */
    initCueMol(config?: string): void {
        if (config) {
            this.internal.initCueMol(config);
        } else {
            this.internal.initCueMol();
        }
    }

    /**
     * Create a wrapper object for a native C++ object
     * @param native_obj - Native object from C++ bindings
     * @returns Wrapped object or null if native_obj is undefined
     * @internal
     *
     * `nativeObj.getClassName()` returns the nearest MC_SCRIPTABLE
     * ancestor's class name (resolved on the C++ side via
     * getScrClassObj()), so a simple wrapper_map lookup is sufficient
     * even for MC_DYNCLASS-only natives such as XplorMapReader -- they
     * surface here as their parent class ("ObjReader" in that case)
     * and route all method calls through the C++ funcMap chain.
     */
    createWrapper(nativeObj: NativeObject | undefined | null): BaseWrapper | null {
        if (nativeObj === null || typeof nativeObj === 'undefined') {
            return null;
        }
        const className = nativeObj.getClassName();
        const Klass = wrapper_map[className];
        if (!Klass) {
            throw new Error(
                `createWrapper: no wrapper registered for class "${className}".`,
            );
        }
        return new Klass(nativeObj, this);
    }

    getWrapped(wrappedObj: any): IWrappedObject {
        return wrappedObj as IWrappedObject;
    }

    /**
     * Create a CueMol object by class name
     * 
     * @param className - Name of the class to instantiate
     * @param args - Optional constructor arguments
     * @returns Created wrapper object or null
     */
    createObj(className: string): BaseWrapper | null {
        const obj = this.internal.createObj(className);
        return this.createWrapper(obj as NativeObject);
    }

    /**
     * Get a singleton service object
     * 
     * @param className - Name of the service class
     * @returns Service wrapper object or null
     */
    getService(className: string): BaseWrapper | null {
        const obj = this.internal.getService(className);
        return this.createWrapper(obj as NativeObject);
    }

    /**
     * Check if a class exists in CueMol
     * 
     * @param className - Name of the class to check
     * @returns True if the class exists
     * ```
     */
    hasClass(className: string): boolean {
        return this.internal.hasClass(className);
    }

    /**
     * Get all available class names as JSON string
     * 
     * @returns JSON string containing all class names
     */
    getAllClassNamesJSON(): string {
        return this.internal.getAllClassNamesJSON();
    }

    /**
     * Copy data from ByteArray to TypedArray (creates new array)
     * 
     * @param src - Source ByteArray wrapper object
     * @returns New TypedArray containing copied data
     * 
     * @example
     * ```typescript
     * const byteArray = cm.createObj('ByteArray');
     * const typedArray = cm.copyToTypedArray(byteArray);
     * ```
     */
    copyToTypedArray(src: ByteArray): any {
        return this.internal.copyToTypedArray(src.wrapped);
    }

    /**
     * Copy data from TypedArray to ByteArray (creates new ByteArray)
     * 
     * @param src - Source TypedArray
     * @returns New ByteArray wrapper containing copied data
     * 
     */
    copyFromTypedArray(src: any): BaseWrapper | null {
        const result = this.internal.copyFromTypedArray(src);
        return this.createWrapper(result);
    }


    /**
     * Get TypedArray view of ByteArray data (zero-copy, shares memory)
     * 
     * Warning: The returned TypedArray shares memory with the ByteArray.
     * Modifications to either will affect both. The ByteArray must remain
     * alive for the lifetime of the TypedArray.
     * 
     * @param src - Source ByteArray wrapper object
     * @returns TypedArray view sharing memory with ByteArray
     * 
     */
    toTypedArray(src: ByteArray): any {
        return this.internal.toTypedArray(src.wrapped);
    }

    /**
     * Create ByteArray that shares memory with TypedArray (zero-copy)
     * 
     * Warning: The returned ByteArray shares memory with the TypedArray.
     * Modifications to either will affect both. The TypedArray must remain
     * alive for the lifetime of the ByteArray.
     * 
     * @param src - Source TypedArray
     * @returns ByteArray wrapper sharing memory with TypedArray
     * ```
     */
    fromTypedArray(src: any): BaseWrapper | null {
        const result = this.internal.fromTypedArray(src);
        return this.createWrapper(result);
    }

    /**
     * Get memory tracking statistics for zero-copy operations.
     * Tracks alloc/free events for shared pointers and object references
     * used in toTypedArray and fromTypedArray.
     */
    getMemoryTrackingStats(): MemoryTrackingStats {
        return this.internal.getMemoryTrackingStats();
    }

    /**
     * Reset all memory tracking counters to zero.
     * Call at the start of each test for clean measurement.
     */
    resetMemoryTracking(): void {
        this.internal.resetMemoryTracking();
    }

    /**
     * Check if an object is a CueMol wrapper object
     * 
     * @param obj - Object to check
     * @returns True if object is a BaseWrapper instance
     * 
     */
    isWrapper(obj: any): obj is BaseWrapper {
        return obj instanceof BaseWrapper;
    }

    /**
     * Check if an object is an instance of a specific class
     * 
     * @param obj - Object to check
     * @param className - Class name to check against
     * @returns True if object is an instance of the specified class
     * ```
     */
    isImplementation(obj: any, className: string): boolean {
        if (!this.isWrapper(obj)) return false;
        try {
            const objClassName = obj.getClassName();
            return objClassName === className;
        } catch {
            return false;
        }
    }

    /**
     * Check if an object is a Scene
     * 
     * @param obj - Object to check
     * @returns True if object is a Scene (type guard)
     */
    isScene(obj: any): obj is Scene {
        // return this.isImplementation(obj, 'Scene');
        return obj instanceof Scene;
    }

    /**
     * Check if an object is a View
     * 
     * @param obj - Object to check
     * @returns True if object is a View (type guard)
     */
    isView(obj: any): obj is View {
        // return this.isImplementation(obj, 'View');
        return obj instanceof View;
    }

    /**
     * Check if an object is an Object
     * 
     * @param obj - Object to check
     * @returns True if object is an Object
     */
    isObject(obj: any): boolean {
        // return this.isImplementation(obj, 'Object');
        return obj instanceof Object;
    }

    /**
     * Check if an object is a Renderer
     * 
     * Checks if the class name contains 'Renderer' or ends with 'Rend'.
     * 
     * @param obj - Object to check
     * @returns True if object is a Renderer
     */
    isRenderer(obj: any): boolean {
        if (!this.isWrapper(obj)) return false;
        try {
            const className = obj.getClassName();
            return className.includes('Renderer') || className.endsWith('Rend');
        } catch {
            return false;
        }
    }

    /**
     * Check if an object is a Selection
     * 
     * @param obj - Object to check
     * @returns True if object is a SelCommand (type guard)
     */
    isSelection(obj: any): obj is SelCommand {
        return this.isImplementation(obj, 'SelCommand');
    }

    /**
     * Check if an object is a Color
     * 
     * @param obj - Object to check
     * @returns True if object is a Color (type guard)
     */
    isColor(obj: any): obj is Color {
        return obj instanceof AbstractColor;
    }

    /**
     * Get a Scene by ID
     * 
     * @param sceneId - Scene ID
     * @returns Scene object or null if not found
     */
    getScene(sceneId: number): Scene | null {
        const sceneManager = this.getSceneManager();
        if (!sceneManager) return null;
        return sceneManager.getScene(sceneId) as Scene | null;
    }

    /**
     * Get a View by ID
     * 
     * @param viewId - View ID
     * @returns View object or null if not found
     */
    getView(viewId: number): View | null {
        const sceneManager = this.getSceneManager();
        if (!sceneManager) return null;
        return sceneManager.getView(viewId) as View | null;
    }

    /**
     * Get an Object from a Scene
     * 
     * @param sceneId - Scene ID
     * @param objectId - Object ID within the scene
     * @returns Object wrapper or null if not found
     */
    getObject(sceneId: number, objectId: number): Object | null {
        const scene = this.getScene(sceneId);
        if (!scene) return null;
        return scene.getObject(objectId);
    }

    /**
     * Get a Renderer from a Scene
     * 
     * @param sceneId - Scene ID
     * @param rendererId - Renderer ID within the scene
     * @returns Renderer wrapper or null if not found
     * 
     */
    getRenderer(sceneId: number, rendererId: number): Renderer | null {
        const scene = this.getScene(sceneId);
        if (!scene) return null;
        return scene.getRenderer(rendererId);
    }

    /**
     * Create a new Scene
     * 
     * @returns New Scene object or null
     * 
     */
    createScene(): Scene | null {
        const mgr = this.getSceneManager();
        if (!mgr) return null;
        const scene = mgr.createScene() as Scene;
        // set created scene as the active scene
        mgr.setActiveSceneID(scene.uid)
        return scene;
    }

    /**
     * Get the SceneManager singleton service
     * 
     * @returns SceneManager object or null
     * 
     */
    getSceneManager(): SceneManager | null {
        return this.getService('SceneManager') as SceneManager | null;
    }

    /**
     * Get the StreamManager singleton service
     * 
     * @returns StreamManager object or null
     * 
     */
    getStreamManager(): StreamManager | null {
        return this.getService('StreamManager') as StreamManager | null;
    }

    /**
     * Create a Vector object
     * 
     * @param x - X component
     * @param y - Y component
     * @param z - Z component
     * @param w - Optional W component (defaults to 0)
     * @returns Vector object
     * 
     */
    createVector(x: number, y: number, z: number, w?: number): Vector {
        const v = this.createObj('Vector') as Vector;
        if (w !== undefined) {
            v.set4(x, y, z, w);
        } else {
            v.set3(x, y, z);
        }
        return v;
    }

    /**
     * Create a Selection object
     * 
     * @param selectionString - Optional selection string
     * @returns SelCommand object
     * 
     */
    createSelection(selStr: string, scene?: Scene): SelCommand {
        // if (this.isSelection(selStr)) {
        //     return selStr;
        // }
        // const scene = this.getScene(scene)
        const selObj = this.createObj('SelCommand') as SelCommand;
        if (selObj.compile(selStr, scene ? scene.uid : 0)) {
            return selObj;
        }
        else {
            throw new Error(`Failed to compile selection string: ${selStr}`);
        }
    }

    /**
     * Create a Color object
     * 
     * @param colorString - Color specification string
     * @returns SolidColor object
     * 
     */
    createColor(colStr: string, scene?: Scene): Color {
        const stylem = this.getService('StyleManager') as StyleManager;
        const color = stylem.compileColor(colStr, scene ? scene.uid : 0) as Color;
        return color
    }

    /**
     * Create a TimeValue object
     * 
     * @param value - Optional time value (number in seconds or string)
     * @returns TimeValue object
     * 
     */
    createTimeValue(value: number): TimeValue {
        const tv = this.createObj("TimeValue") as TimeValue;
        tv.millisec = value;
        return tv;
    }
}

