#pragma once

#include <napi.h>

namespace node_jsbr {

Napi::Value getService(const Napi::CallbackInfo &info);
Napi::Value createObj(const Napi::CallbackInfo &info);
Napi::Value hasClass(const Napi::CallbackInfo &info);
Napi::String getAllClassNamesJSON(const Napi::CallbackInfo &info);


} // namespace node_jsbr

