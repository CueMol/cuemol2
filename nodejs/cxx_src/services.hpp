#pragma once

#include <napi.h>

namespace node_jsbr {

Napi::Value getService(const Napi::CallbackInfo &info);
Napi::Value createObj(const Napi::CallbackInfo &info);
Napi::Value hasClass(const Napi::CallbackInfo &info);
Napi::String getAllClassNamesJSON(const Napi::CallbackInfo &info);

/**
   Copy data from ByteArray to JS TypedArray
 */
Napi::Value copyToTypedArray(const Napi::CallbackInfo &info);

/**
   Copy data from JS TypedArray to ByteArray
 */
Napi::Value copyFromTypedArray(const Napi::CallbackInfo &info);

/**
   Create a JS TypedArray that shares memory with ByteArray
 */
Napi::Value toTypedArray(const Napi::CallbackInfo &info);

/**
    Create a ByteArray that shares memory with JS TypedArray
 */
Napi::Value fromTypedArray(const Napi::CallbackInfo &info);

}  // namespace node_jsbr
