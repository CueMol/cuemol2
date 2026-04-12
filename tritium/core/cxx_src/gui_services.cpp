//
// Node.js CueMol GUI service functions
//
#include <common.h>
// #include <libcuemol2_api/binding.hpp>
// #include <qlib/ClassRegistry.hpp>
// #include <qlib/LExceptions.hpp>
// #include <qlib/LScriptable.hpp>
// #include <qlib/qlib.hpp>
// #include <qlib/LByteArray.hpp>
#include "ElecView.hpp"
#include "wrapper.hpp"
#include "services.hpp"

namespace node_jsbr {

//////////
// GUI view

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
    pView->attach(arg1);

    return env.Null();
}

}  // namespace node_jsbr
