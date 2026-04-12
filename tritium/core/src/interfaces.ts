/**
 * Interface definitions for native wrapped objects.
 * These interfaces define the contract between TypeScript wrappers and C++ native objects.
 */

/**
 * Interface for the native wrapped object.
 * This represents the C++ addon object with core methods.
 */
export interface IWrappedObject {
    /** Get a property value from the native object */
    getProp(propName: string): any;

    /** Set a property value on the native object */
    setProp(propName: string, value: any): void;

    /** Invoke a method on the native object */
    invokeMethod(methodName: string, ...args: any[]): any;

    /** Convert to string representation (returns pointer address) */
    toString(): string;
    toObjID(): string;

    getAbiClassName(): string;
    getClassName(): string;

    resetProp(propName: string): void;

    hasProp(propName: string): boolean;

    getPropsJSON(): string;

    hasPropDefault(propName: string): boolean;



    // getEnumDef(propName: string, enumName: string): number;
}

/**
 * Interface for the utils object providing helper functionality.
 */
export interface IWrapperUtils {
    /** The CueMol module instance */
    readonly module: any;

    /** Create a wrapper for a native object */
    createWrapper(nativeObj: any): any;
}

/**
 * Memory tracking statistics for debugging and testing
 */
export interface MemoryTrackingStats {
    /** Number of toTypedArray allocations */
    toTypedArrayAllocs: number;
    /** Number of toTypedArray deallocations */
    toTypedArrayFrees: number;
    /** Number of fromTypedArray reference allocations */
    fromTypedArrayRefAllocs: number;
    /** Number of fromTypedArray reference deallocations */
    fromTypedArrayRefFrees: number;
}

/**
 * Union type of all JavaScript TypedArray types
 */
export type TypedArray =
    | Uint8Array
    | Int8Array
    | Uint16Array
    | Int16Array
    | Uint32Array
    | Int32Array
    | Float32Array
    | Float64Array;

/**
 * Internal native module interface from C++ bindings
 */
export interface CueMolInternal {
    initCueMol(configPath?: string): void;
    hasClass(className: string): boolean;
    createObj(className: string): any;
    getService(className: string): any;
    getAllClassNamesJSON(): string;

    copyToTypedArray(src: any): TypedArray;
    copyFromTypedArray(src: TypedArray): any;
    toTypedArray(src: any): TypedArray;
    fromTypedArray(src: TypedArray): any;

    // copyToTypedArray(src: BaseWrapper): TypedArray;
    // copyFromTypedArray(src: TypedArray): NativeObject;
    // toTypedArray(src: BaseWrapper): TypedArray;
    // fromTypedArray(src: TypedArray): NativeObject;

    getMemoryTrackingStats(): MemoryTrackingStats;
    resetMemoryTracking(): void;
}


/**
 * Native object interface returned from C++ bindings
 */
export interface NativeObject {
    getClassName(): string;
}
