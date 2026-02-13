//
// Node.js CueMol service functions
//
#include <common.h>
#include <libcuemol2_api/binding.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LScriptable.hpp>
#include <qlib/qlib.hpp>
#include "wrapper.hpp"
#include "services.hpp"

namespace node_jsbr {

using qlib::LString;

Napi::Value getService(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() != 1) {
        Napi::TypeError::New(env, "Wrong number of arguments")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsString()) {
        Napi::TypeError::New(env, "Wrong type of argument 0")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    auto clsname = info[0].As<Napi::String>().Utf8Value();
    LString errmsg;
    qlib::LScriptable *pobj;
    bool ok = cuemol2::getService(clsname, &pobj, errmsg);
    if (!ok) {
        Napi::Error::New(env, errmsg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }
    // MB_DPRINTLN("getService(%s) OK: %p", clsname.c_str(), pobj);
    return Wrapper::createWrapper(env, pobj);
}

Napi::Value createObj(const Napi::CallbackInfo &info)
{
    // MB_DPRINTLN("createObj called");
    Napi::Env env = info.Env();

    LString clsname, strval;
    if (info.Length() == 1 && info[0].IsString()) {
        clsname = info[0].As<Napi::String>().Utf8Value();
        strval = "";
    } else if (info.Length() == 2 && info[0].IsString() && info[1].IsString()) {
        clsname = info[0].As<Napi::String>().Utf8Value();
        strval = info[1].As<Napi::String>().Utf8Value();
    } else {
        Napi::TypeError::New(env, "Wrong number of arguments")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    LString errmsg;
    qlib::LScriptable *pobj;
    bool ok = cuemol2::createObj(clsname, strval, &pobj, errmsg);
    if (!ok) {
        Napi::Error::New(env, errmsg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    // MB_DPRINTLN("createObj(%s) OK, result=%p!!", clsname.c_str(), pobj);

    return Wrapper::createWrapper(env, pobj);
}

Napi::Value hasClass(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    LString clsname;
    if (info.Length() == 1 && info[0].IsString()) {
        clsname = info[0].As<Napi::String>().Utf8Value();
    } else {
        Napi::TypeError::New(env, "Wrong number of arguments")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    bool retval;
    LString errmsg;
    qlib::LScriptable *pobj;
    bool ok = cuemol2::hasClass(clsname, &retval, errmsg);
    if (!ok) {
        Napi::Error::New(env, errmsg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    return Napi::Boolean::New(env, retval);
}

Napi::String getAllClassNamesJSON(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    LString retval, errmsg;
    cuemol2::getAllClassNamesJSON(retval, errmsg);
    return Napi::String::New(env, retval.c_str());
}

/**
   Copy data from ByteArray to JS TypedArray
 */
Napi::Value copyToTypedArray(const Napi::CallbackInfo &info)
{
    // TODO: implementation
    Napi::Env env = info.Env();
    Napi::TypeError::New(env, "Not implemented").ThrowAsJavaScriptException();
    return env.Null();
}

/**
   Copy data from JS TypedArray to ByteArray
 */
Napi::Value copyFromTypedArray(const Napi::CallbackInfo &info)
{
    // TODO: implementation
    Napi::Env env = info.Env();
    Napi::TypeError::New(env, "Not implemented").ThrowAsJavaScriptException();
    return env.Null();
}

}  // namespace node_jsbr
