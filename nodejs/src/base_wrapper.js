export class BaseWrapper {
  constructor(aWrapped, aUtils) {
    this._wrapped = aWrapped;
    this._utils = aUtils;
  }

  get wrapped() {
    return this._wrapped;
  }

  get utils() {
    return this._utils;
  }

  get module() {
    return this._utils.module;
  }

  destroy() {}

  getProp(propName) {
    return this.wrapped.getProp(propName);
  }

  setProp(propName, value) {
    this.wrapped.setProp(propName, value);
  }

  invokeMethod(methodName, ...args) {
    const rval = this._wrapped.invokeMethod(methodName, ...args);
    return rval;
  }

  createWrapper(native_obj) {
    return this._utils.createWrapper(native_obj);
  }

  // toString() {
  //   if (this._wrapped !== undefined)
  //     return `Wrapper(ptr=0x${this._wrapped.toString(16)})`;
  //   else return `Wrapper(ptr=null)`;
  // }
}
