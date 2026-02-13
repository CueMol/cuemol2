import { wrapper_map } from './wrappers/wrapper_loader';

/**
 * Internal native module interface from C++ bindings
 */
export interface CueMolInternal {
    hello(): void;
    initCueMol(configPath?: string): void;
    hasClass(className: string): boolean;
    createObj(className: string, ...args: any[]): any;
    getService(className: string, ...args: any[]): any;

    copyToTypedArray(src: any): any;
    copyFromTypedArray(src: any): any;
}

/**
 * Native object interface returned from C++ bindings
 */
interface NativeObject {
    getClassName(): string;
}

/**
 * CueMol constructor options
 */
interface CueMolOptions {
    internal: CueMolInternal;
}

/**
 * Main CueMol class that wraps the C++ native module
 * Provides methods to create objects and access services
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
     * Initialize CueMol with optional configuration
     * @param config - Optional path to configuration file
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
     */
    createWrapper(native_obj: NativeObject | undefined): unknown {
        if (typeof native_obj === 'undefined') {
            return null;
        }
        // console.log('native_obj:', native_obj);
        const className = native_obj.getClassName();
        // console.log('className:', className);
        const Klass = wrapper_map[className];
        const obj = new Klass(native_obj, this);
        // console.log('wrapper created:', obj);
        return obj;
    }

    /**
     * Create a CueMol object by class name
     * @param className - Name of the class to instantiate
     * @returns Wrapped object instance
     */
    createObj(className: string): unknown {
        const obj = this.internal.createObj(className);
        return this.createWrapper(obj as NativeObject);
    }

    /**
     * Get a CueMol service by class name
     * @param className - Name of the service class
     * @returns Wrapped service instance
     */
    getService(className: string): unknown {
        const obj = this.internal.getService(className);
        return this.createWrapper(obj as NativeObject);
    }

    copyToTypedArray(src: any): any {
        return this.internal.copyToTypedArray(src);
    }

    copyFromTypedArray(src: any): any {
        return this.internal.copyFromTypedArray(src);
    }
    
}
