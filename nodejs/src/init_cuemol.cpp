//
// Node.js CueMol module initialization
//
#include <common.h>

#include <napi.h>

#include <gfx/gfx.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LScriptable.hpp>
#include <qlib/qlib.hpp>
#include <qsys/qsys.hpp>

#include "ElecTimerImpl.hpp"
#include "ElecView.hpp"
#include "node_jsbr.hpp"
#include "wrapper.hpp"

namespace molstr {
  extern bool init();
  extern void fini();
}

namespace molvis {
  extern bool init();
  extern void fini();
}

namespace node_jsbr {

using qlib::LString;

// for test
Napi::String Method(const Napi::CallbackInfo &info)
{
    printf("=== hello called ===\n");
    Napi::Env env = info.Env();
    return Napi::String::New(env, "world");
}

bool g_bInitOK = false;

// Napi::Value isInitialized(const Napi::CallbackInfo& info)
// {
//     if (g_bInitOK)
//         Napi::Boolean::New(true);
//     else
//         Napi::Boolean::New(false);
// }

/// CueMol initialization routine
Napi::Value initCueMol(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (g_bInitOK) return env.Null();

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

    auto config = info[0].As<Napi::String>().Utf8Value();
    printf("initCueMol(%s) called.\n", config.c_str());

    try {
        qlib::init();
        qsys::init(config.c_str());
        molstr::init();
        molvis::init();
        init();

        // setup timer
        qlib::EventManager::getInstance()->initTimer(new ElecTimerImpl);

        registerViewFactory();

    } catch (const qlib::LException &e) {
        printf("XXXXX\n");
        // LOG_DPRINTLN("Init> Caught exception <%s>", typeid(e).name());
        // LOG_DPRINTLN("Init> Reason: %s", e.getMsg().c_str());
    } catch (...) {
        printf("XXXXX\n");
        // LOG_DPRINTLN("Init> Caught unknown exception");
    }

    // LOG_DPRINTLN("CueMol2 node_js module : INITIALIZED");
    return env.Null();
}

Napi::String getAllClassNamesJSON(const Napi::CallbackInfo &info)
{
    printf("getAllClassNamesJSON called\n");
    Napi::Env env = info.Env();

    qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
    printf("qlib::ClassRegistry *pMgr=%p\n", pMgr);
    MB_ASSERT(pMgr != NULL);

    std::list<qlib::LString> ls;
    pMgr->getAllClassNames(ls);

    LString rstr = "[";
    bool ffirst = true;
    for (const LString &str : ls) {
        MB_DPRINTLN("class %s", str.c_str());
        if (!ffirst) rstr += ",";
        rstr += "\"" + str + "\"";
        ffirst = false;
    }
    rstr += "]";

    printf("qlib::ClassRegistry result %s\n", rstr.c_str());

    return Napi::String::New(env, rstr.c_str());
}

Napi::Value getClassName(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    printf("getClassName called\n");

    if (info.Length() != 1) {
        Napi::TypeError::New(env, "Wrong number of arguments")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    auto value = info[0];
    if (!value.IsObject()) {
        Napi::TypeError::New(env, "Wrong type of argument 0")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    auto obj = value.ToObject();
    Wrapper *pWrapper;
    try {
        pWrapper = Wrapper::Unwrap(obj);
    }
    catch (...) {
        printf("unwrap failed\n");
        throw;
    }
    printf("getClassName pWrapper=%p\n", pWrapper);
    auto pScObj = pWrapper->getWrapped();
    printf("getClassName pScObj=%p\n", pScObj);

    qlib::LString str;
    if (pScObj) {
        qlib::LClass *pCls = pScObj->getClassObj();
        if (pCls) {
            str = pCls->getClassName();
        } else {
            str = "(unknown)";
        }

    } else {
        str = "(null)";
    }

    return Napi::String::New(env, str.c_str());
}

Napi::Value getService(const Napi::CallbackInfo &info)
{
    printf("getService called\n");
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

    qlib::LDynamic *pObj = NULL;
    try {
        qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
        MB_ASSERT(pMgr != NULL);
        pObj = pMgr->getSingletonObj(clsname);
    } catch (...) {
        LString msg = LString::format("getService(%s) failed", clsname.c_str());
        // LOG_DPRINTLN(msg);
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    if (pObj == nullptr) {
        LString msg =
            LString::format("getService(%s) returned nullptr", clsname.c_str());
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    printf("getService result %p\n", pObj);

    return Wrapper::createWrapper(env, static_cast<qlib::LScriptable *>(pObj));
}

Napi::Value createObj(const Napi::CallbackInfo &info)
{
    printf("createObj called\n");
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

    qlib::LClass *pCls = NULL;
    try {
        qlib::ClassRegistry *pMgr = qlib::ClassRegistry::getInstance();
        MB_ASSERT(pMgr != NULL);
        pCls = pMgr->getClassObj(clsname);
        MB_DPRINTLN("!!! CreateObj, LClass for %s: %p", clsname.c_str(), pCls);
    } catch (...) {
        LString msg = LString::format("createObj class %s not found", clsname.c_str());
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    qlib::LDynamic *pDyn = pCls->createScrObj();

    if (!pDyn) {
        LString msg = LString::format(
            "createObj %s failed (class.createScrObj returned NULL)", clsname.c_str());
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    MB_DPRINTLN("createObj(%s) OK, result=%p!!", clsname.c_str(), pDyn);

    return Wrapper::createWrapper(env, static_cast<qlib::LScriptable *>(pDyn));
}

Napi::Value bindPeer(const Napi::CallbackInfo &info)
{
    printf("bindPeer called\n");
    Napi::Env env = info.Env();

    if (info.Length() != 2) {
        Napi::TypeError::New(env, "Wrong number of arguments")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsObject()) {
        Napi::TypeError::New(env, "arg0 is not wrapper obj")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    // try to get wrapped scrobj
    auto obj = info[0].ToObject();
    // TODO: use napi_unwrap directly to aviod throw exception
    Wrapper *pWrapper = Wrapper::Unwrap(obj);

    auto pScObj = pWrapper->getWrapped();
    if (!pScObj) {
        Napi::TypeError::New(env, "arg0 is not wrapper obj")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    printf("pScObj: %s\n", pScObj->toString().c_str());
    printf("isSmartPtr: %d\n", pScObj->isSmartPtr());
    auto pView = dynamic_cast<ElecView *>(pScObj->getSPInner());
    printf("ElecView: %p\n", pView);

    auto arg1 = info[1].As<Napi::Object>();
    pView->bindPeer(arg1);

    return env.Null();
}

}  // namespace node_jsbr

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    // for test
    exports.Set(Napi::String::New(env, "hello"),
                Napi::Function::New(env, node_jsbr::Method));

    exports.Set(Napi::String::New(env, "initCueMol"),
                Napi::Function::New(env, node_jsbr::initCueMol));

    exports.Set(Napi::String::New(env, "getAllClassNamesJSON"),
                Napi::Function::New(env, node_jsbr::getAllClassNamesJSON));
    exports.Set(Napi::String::New(env, "getClassName"),
                Napi::Function::New(env, node_jsbr::getClassName));

    exports.Set(Napi::String::New(env, "getService"),
                Napi::Function::New(env, node_jsbr::getService));
    exports.Set(Napi::String::New(env, "createObj"),
                Napi::Function::New(env, node_jsbr::createObj));

    exports.Set(Napi::String::New(env, "bindPeer"),
                Napi::Function::New(env, node_jsbr::bindPeer));

    exports = node_jsbr::Wrapper::Init(env, exports);

    return exports;
}

NODE_API_MODULE(cuemol, Init)
