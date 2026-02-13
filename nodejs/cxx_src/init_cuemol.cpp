//
// Node.js CueMol module initialization
//
#include <common.h>
#include <libcuemol2_api/loader.hpp>

#include <napi.h>

// #include <qlib/EventManager.hpp>

// #include <gfx/gfx.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LScriptable.hpp>
#include <qlib/qlib.hpp>
// #include <qsys/qsys.hpp>

// #include "ElecTimerImpl.hpp"
// #include "ElecView.hpp"
// #include "node_jsbr.hpp"
#include "wrapper.hpp"
#include "services.hpp"

#ifndef DEFAULT_CONFIG
#define DEFAULT_CONFIG "./sysconfig.xml"
#endif

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

Napi::Value isInitialized(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    if (g_bInitOK)
        return Napi::Boolean::New(env, true);
    else
        return Napi::Boolean::New(env, false);
}

/// CueMol main initialization
Napi::Value initCueMol(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (g_bInitOK) return env.Null();

    int nargs = info.Length();
    MB_DPRINTLN("initCueMol() called. nargs=%d", nargs);

    LString confpath;
    if (nargs < 1) {
      // without argments --> use embedded path string
      confpath = LString(DEFAULT_CONFIG);
    }
    else if (nargs == 1 && info[0].IsString()) {
        confpath = info[0].As<Napi::String>().Utf8Value();
    }
    else {
        Napi::TypeError::New(env, "Wrong type/number of argument 0")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    LOG_DPRINTLN("initCueMol('%s') called.", confpath.c_str());

    int result = cuemol2::init(confpath, true);
    if (result < 0) {
        LOG_DPRINTLN("initCueMol(%s) failed.", confpath.c_str());
        Napi::TypeError::New(env, "Init cuemol failed")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    //     // setup timer
    //     qlib::EventManager::getInstance()->initTimer(new ElecTimerImpl);

    //     registerViewFactory();

    LOG_DPRINTLN("CueMol2 nodejs module : INITIALIZED");
    return env.Null();
}

/// CueMol finalization
Napi::Value finiCueMol(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    if (!g_bInitOK) {
        LOG_DPRINTLN("CueMol> CueMol not initialized!!");
        return env.Null();
    } 

    MB_DPRINTLN("finiCueMol() called.");

    // TODO: cleanup timer
    // qlib::EventManager::getInstance()->finiTimer();

    cuemol2::fini();
    cuemol2::fini_qlib();

    g_bInitOK = false;

    MB_DPRINTLN("CueMol2 nodejs module : FINALIZED");
    return env.Null();
}

}  // namespace node_jsbr

// cuemol_internal module initialization
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    qlib::init();
    MB_DPRINTLN("CueMol2 nodejs add-on : INITIALIZED");

    // for test
    // exports.Set(Napi::String::New(env, "hello"),
    //             Napi::Function::New(env, node_jsbr::Method));

    exports.Set(Napi::String::New(env, "initCueMol"),
                Napi::Function::New(env, node_jsbr::initCueMol));

    exports.Set(Napi::String::New(env, "getService"),
                Napi::Function::New(env, node_jsbr::getService));
    exports.Set(Napi::String::New(env, "createObj"),
                Napi::Function::New(env, node_jsbr::createObj));
    exports.Set(Napi::String::New(env, "hasClass"),
                Napi::Function::New(env, node_jsbr::hasClass));
    exports.Set(Napi::String::New(env, "getAllClassNamesJSON"),
                Napi::Function::New(env, node_jsbr::getAllClassNamesJSON));

    // exports.Set(Napi::String::New(env, "getClassName"),
    //             Napi::Function::New(env, node_jsbr::getClassName));

    // exports.Set(Napi::String::New(env, "bindPeer"),
    //             Napi::Function::New(env, node_jsbr::bindPeer));

    exports.Set(Napi::String::New(env, "copyFromTypedArray"),
                Napi::Function::New(env, node_jsbr::copyFromTypedArray));
    exports.Set(Napi::String::New(env, "copyToTypedArray"),
                Napi::Function::New(env, node_jsbr::copyToTypedArray));
    

    exports = node_jsbr::Wrapper::Init(env, exports);

    return exports;
}

NODE_API_MODULE(cuemol_internal, Init)
