/**
 * Base wrapper class for CueMol native objects.
 * Provides common functionality for all wrapper classes.
 */

import type { IWrappedObject, IWrapperUtils } from '@/interfaces';

/**
 * Base wrapper class that provides common functionality for all CueMol wrapper classes.
 * This class wraps native C++ objects and provides a JavaScript-friendly interface.
 */
export class BaseWrapper {
    /** The wrapped native object */
    // protected _wrapped: IWrappedObject;
    protected _wrapped: any;

    /** Utility object for wrapper operations */
    // protected _utils: IWrapperUtils;
    protected _utils: any;

    /**
     * Create a new BaseWrapper instance.
     * @param aWrapped - The native C++ object to wrap
     * @param aUtils - Utility object providing helper functions
     */
    constructor(aWrapped: IWrappedObject, aUtils: IWrapperUtils) {
        this._wrapped = aWrapped;
        this._utils = aUtils;
    }

    /**
     * Get the wrapped native object.
     * @returns The native C++ object
     */
    get wrapped(): IWrappedObject {
        return this._wrapped;
    }

    /**
     * Get the utils object.
     * @returns The wrapper utilities
     */
    get utils(): IWrapperUtils {
        return this._utils;
    }

    /**
     * Get the CueMol module instance.
     * @returns The module object
     */
    get module(): any {
        return this._utils.module;
    }

    /**
     * Destroy the wrapper and release resources.
     * Override this in derived classes for cleanup.
     */
    destroy(): void { }

    /**
     * Get a property value from the wrapped object.
     * @param propName - Name of the property to get
     * @returns The property value
     */
    getProp(propName: string): any {
        return this.wrapped.getProp(propName);
    }

    /**
     * Set a property value on the wrapped object.
     * @param propName - Name of the property to set
     * @param value - Value to set
     */
    setProp(propName: string, value: any): void {
        this.wrapped.setProp(propName, value);
    }

    /**
     * Invoke a method on the wrapped object.
     * @param methodName - Name of the method to invoke
     * @param args - Arguments to pass to the method
     * @returns The method's return value
     */
    invokeMethod(methodName: string, ...args: any[]): any {
        const rval = this._wrapped.invokeMethod(methodName, ...args);
        return rval;
    }

    /**
     * Create a wrapper for a native object.
     * @param native_obj - The native object to wrap
     * @returns A wrapper instance for the native object
     */
    createWrapper(native_obj: any): any {
        return this._utils.createWrapper(native_obj);
    }

    getPropsJSON(): string {
        return this._wrapped.getPropsJSON();
    }

    hasProp(propName: string): boolean {
        return this._wrapped.hasProp(propName);
    }

    resetProp(propName: string): void {
        this.wrapped.resetProp(propName);
    }

    hasPropDefault(propName: string): boolean {
        return this._wrapped.hasPropDefault(propName);
    }

    // /**
    //  * Convert the wrapper to a string representation.
    //  * @returns String representation with pointer address
    //  */
    // toString(): string {
    //   if (this._wrapped !== undefined)
    //     return `Wrapper(ptr=0x${this._wrapped.toString(16)})`;
    //   else return `Wrapper(ptr=null)`;
    // }
}
