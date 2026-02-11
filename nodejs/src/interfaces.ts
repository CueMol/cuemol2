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
    toString(radix?: number): string;

    resetProp(propName: string): void;

    hasProp(propName: string): boolean;

    getPropsJSON(): string;
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
