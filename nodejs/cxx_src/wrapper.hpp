#pragma once

#include <napi.h>

namespace qlib {
class LScriptable;
class LVariant;
}  // namespace qlib

namespace node_jsbr {

class Wrapper : public Napi::ObjectWrap<Wrapper>
{
private:
    /// wrapped object
    qlib::LScriptable *m_pWrapped;

public:
    using super_t = Napi::ObjectWrap<Wrapper>;

    Wrapper(const Napi::CallbackInfo &info) : super_t(info) {}

    /// Destructor: releases the wrapped native object.
    ~Wrapper()
    {
        if (m_pWrapped) {
            delete m_pWrapped;
        }
    }

    qlib::LScriptable *getWrapped()
    {
        return m_pWrapped;
    }
    void setWrapped(qlib::LScriptable *pval)
    {
        m_pWrapped = pval;
    }

    Napi::Value getClassName(const Napi::CallbackInfo &info);
    Napi::Value getAbiClassName(const Napi::CallbackInfo &info);

    Napi::Value hasProp(const Napi::CallbackInfo &info);
    Napi::Value getProp(const Napi::CallbackInfo &info);
    Napi::Value setProp(const Napi::CallbackInfo &info);
    Napi::Value invokeMethod(const Napi::CallbackInfo &info);
    Napi::Value toString(const Napi::CallbackInfo &info);
    Napi::Value resetProp(const Napi::CallbackInfo &info);
    Napi::Value getPropsJSON(const Napi::CallbackInfo &info);
    Napi::Value hasPropDefault(const Napi::CallbackInfo &info);

    static Napi::Value lvarToNapiValue(Napi::Env env, qlib::LVariant &variant);
    static bool napiValueToLVar(Napi::Env env, Napi::Value napi_val, qlib::LVariant &rvar);

    static Napi::Object init(Napi::Env env, Napi::Object exports);

    static Napi::Object createWrapper(Napi::Env env, qlib::LScriptable *pObj);
};

}  // namespace node_jsbr
