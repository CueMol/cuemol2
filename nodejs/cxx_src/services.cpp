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
    MB_DPRINTLN("getService(%s) OK: %p", clsname.c_str(), pobj);
    return Wrapper::createWrapper(env, pobj);
}

Napi::Value createObj(const Napi::CallbackInfo &info)
{
    MB_DPRINTLN("createObj called");
    Napi::Env env = info.Env();

    LString clsname, strval;
    if (info.Length() == 1 && info[0].IsString()) {
        clsname = info[0].As<Napi::String>().Utf8Value();
        strval = "";
    }
    else if (info.Length() == 2 && info[0].IsString()&& info[1].IsString()) {
        clsname = info[0].As<Napi::String>().Utf8Value();
        strval = info[1].As<Napi::String>().Utf8Value();
    }
    else {
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

    MB_DPRINTLN("createObj(%s) OK, result=%p!!", clsname.c_str(), pobj);

    return Wrapper::createWrapper(env, pobj);
}

Napi::Value hasClass(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    LString clsname;
    if (info.Length() == 1 && info[0].IsString()) {
        clsname = info[0].As<Napi::String>().Utf8Value();
    }
    else {
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

// Napi::Value getClassName(const Napi::CallbackInfo &info)
// {
//     Napi::Env env = info.Env();
//     printf("getClassName called\n");

//     if (info.Length() != 1) {
//         Napi::TypeError::New(env, "Wrong number of arguments")
//             .ThrowAsJavaScriptException();
//         return env.Null();
//     }
//     auto value = info[0];
//     if (!value.IsObject()) {
//         Napi::TypeError::New(env, "Wrong type of argument 0")
//             .ThrowAsJavaScriptException();
//         return env.Null();
//     }
//     auto obj = value.ToObject();
//     Wrapper *pWrapper;
//     try {
//         pWrapper = Wrapper::Unwrap(obj);
//     }
//     catch (...) {
//         printf("unwrap failed\n");
//         throw;
//     }
//     printf("getClassName pWrapper=%p\n", pWrapper);
//     auto pScObj = pWrapper->getWrapped();
//     printf("getClassName pScObj=%p\n", pScObj);

//     qlib::LString str;
//     if (pScObj) {
//         qlib::LClass *pCls = pScObj->getClassObj();
//         if (pCls) {
//             str = pCls->getClassName();
//         } else {
//             str = "(unknown)";
//         }

//     } else {
//         str = "(null)";
//     }

//     return Napi::String::New(env, str.c_str());
// }

// Napi::Value bindPeer(const Napi::CallbackInfo &info)
// {
//     printf("bindPeer called\n");
//     Napi::Env env = info.Env();

//     if (info.Length() != 2) {
//         Napi::TypeError::New(env, "Wrong number of arguments")
//             .ThrowAsJavaScriptException();
//         return env.Null();
//     }

//     if (!info[0].IsObject()) {
//         Napi::TypeError::New(env, "arg0 is not wrapper obj")
//             .ThrowAsJavaScriptException();
//         return env.Null();
//     }

//     // try to get wrapped scrobj
//     auto obj = info[0].ToObject();
//     // TODO: use napi_unwrap directly to aviod throw exception
//     Wrapper *pWrapper = Wrapper::Unwrap(obj);

//     auto pScObj = pWrapper->getWrapped();
//     if (!pScObj) {
//         Napi::TypeError::New(env, "arg0 is not wrapper obj")
//             .ThrowAsJavaScriptException();
//         return env.Null();
//     }
//     printf("pScObj: %s\n", pScObj->toString().c_str());
//     printf("isSmartPtr: %d\n", pScObj->isSmartPtr());
//     auto pView = dynamic_cast<ElecView *>(pScObj->getSPInner());
//     printf("ElecView: %p\n", pView);

//     auto arg1 = info[1].As<Napi::Object>();
//     pView->bindPeer(arg1);

//     return env.Null();
// }

} // namespace node_jsbr

