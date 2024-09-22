#include "wrapper.hpp"

#include <qlib/LScrCallBack.hpp>
#include <qlib/LScriptable.hpp>
#include <qlib/LVarArgs.hpp>
#include <qlib/LVarArray.hpp>
#include <qlib/LVarDict.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/qlib.hpp>

namespace node_jsbr {

using qlib::LString;

Napi::Value Wrapper::toString(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    auto pobj = getWrapped();
    if (!pobj) {
        Napi::Error::New(env, "Wrapper is not initialized")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    auto msg =
        qlib::LString::format("wrapper (%p) <%s>", pobj, pobj->toString().c_str());
    return Napi::String::New(env, msg.c_str());
}

Napi::Value Wrapper::getAbiClassName(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    auto pScObj = getWrapped();

    qlib::LString str;
    if (pScObj) {
        qlib::LClass *pCls = pScObj->getClassObj();
        if (pCls) {
            str = pCls->getAbiClassName();
        } else {
            str = "(unknown)";
        }

    } else {
        str = "(null)";
    }

    return Napi::String::New(env, str.c_str());
}

Napi::Value Wrapper::getClassName(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    auto pScObj = getWrapped();

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

Napi::Value Wrapper::getProp(const Napi::CallbackInfo &info)
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

    auto propname = info[0].As<Napi::String>().Utf8Value();
    auto pScObj = getWrapped();
    if (!pScObj) {
        Napi::Error::New(env, "Wrapped obj is null").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!pScObj->hasNestedProperty(propname)) {
        auto msg =
            LString::format("GetProp: property \"%s\") not found.", propname.c_str());
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    qlib::LVariant lvar;
    if (!pScObj->getNestedProperty(propname, lvar)) {
        LString msg = LString::format("GetProp: getProperty(\"%s\") call failed.",
                                      propname.c_str());
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    return lvarToNapiValue(env, lvar);
}

Napi::Value Wrapper::setProp(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    if (info.Length() != 2) {
        Napi::TypeError::New(env, "Wrong number of arguments")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsString()) {
        Napi::TypeError::New(env, "Wrong type of argument 0")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    auto propname = info[0].As<Napi::String>().Utf8Value();

    auto value = info[1];

    auto pScObj = getWrapped();
    if (!pScObj) {
        Napi::Error::New(env, "Wrapped obj is null").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!pScObj->hasNestedProperty(propname)) {
        auto msg =
            LString::format("SetProp: property \"%s\") not found.", propname.c_str());
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    // variant (lvar) doesn't have ownership of its content
    qlib::LVariant lvar;
    if (!Wrapper::napiValueToLVar(env, value, lvar)) {
        auto msg = LString::format(
            "SetProp(%s): Cannot converting NapiValue to LVariant.", propname.c_str());
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!pScObj->setNestedProperty(propname, lvar)) {
        auto msg = LString::format("SetProp(%s) failed.", propname.c_str());
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    return env.Null();
}

Napi::Value Wrapper::invokeMethod(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    auto pScObj = getWrapped();
    if (!pScObj) {
        Napi::Error::New(env, "Wrapped obj is null").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (info.Length() < 1) {
        Napi::TypeError::New(env, "invokeMethod called without method name")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsString()) {
        Napi::TypeError::New(env, "Wrong type of argument 0")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    auto methodname = info[0].As<Napi::String>().Utf8Value();

    if (!pScObj->hasMethod(methodname)) {
        auto msg = LString::format("InvokeMethod: method \"%s\" not found.",
                                   methodname.c_str());
        Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    // Convert argments
    const size_t nargs = info.Length();
    qlib::LVarArgs largs(nargs - 1);
    size_t i;

    for (i = 1; i < nargs; ++i) {
        // printf("===== 1\n");
        qlib::LVariant &rvar = largs.at(i - 1);
        // rvar.dump();
        bool result = Wrapper::napiValueToLVar(env, info[i], rvar);
        // rvar.dump();
        // printf("===== 2\n");
        if (!result) {
            auto msg = LString::format("call method %s: cannot convert arg %d",
                                       methodname.c_str(), i);
            Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
            return env.Null();
        }
    }

    MB_DPRINTLN("invoke method %s nargs=%zu", methodname.c_str(), nargs);

    // Invoke method
    bool ok = false;
    LString errmsg;
    try {
        ok = pScObj->invokeMethod(methodname, largs);
        if (!ok) errmsg = LString::format("call method %s: failed", methodname.c_str());
    } catch (qlib::LException &e) {
        errmsg = LString::format("Exception occured in native method %s: %s",
                                 methodname.c_str(), e.getMsg().c_str());
    } catch (std::exception &e) {
        errmsg = LString::format("Std::exception occured in native method %s: %s",
                                 methodname.c_str(), e.what());
    } catch (...) {
        LOG_DPRINTLN("*********");
        errmsg = LString::format("Unknown Exception occured in native method %s",
                                 methodname.c_str());
    }

    if (!ok) {
        Napi::Error::New(env, errmsg.c_str()).ThrowAsJavaScriptException();
        return env.Null();
    }

    // Convert returned value
    return lvarToNapiValue(env, largs.retval());
}

/// convert LVariant to Napi::Value
Napi::Value Wrapper::lvarToNapiValue(Napi::Env env, qlib::LVariant &variant)
{
    switch (variant.getTypeID()) {
        case qlib::LVariant::LT_NULL:
            // MB_DPRINTLN("LVariant: null");
            return env.Null();

        case qlib::LVariant::LT_BOOLEAN:
            return Napi::Boolean::New(env, variant.getBoolValue());

        case qlib::LVariant::LT_INTEGER:
            // MB_DPRINTLN("LVar: integer(%d)", variant.getIntValue());
            return Napi::Number::New(env, variant.getIntValue());

        case qlib::LVariant::LT_REAL:
            // MB_DPRINTLN("LVar: real(%f)", variant.getRealValue());
            return Napi::Number::New(env, variant.getRealValue());

        case qlib::LVariant::LT_STRING: {
            // MB_DPRINTLN("LVar: string(%s)", str.c_str());
            return Napi::String::New(env, variant.getStringValue().c_str());
        }
        case qlib::LVariant::LT_OBJECT: {
            auto pObj = createWrapper(env, variant.getObjectPtr());
            // At this point, the ownership of value is passed to PyObject
            //  (forget() avoids deleting the ptr transferred to PyObject)
            variant.forget();
            return pObj;
        }
        case qlib::LVariant::LT_ARRAY: {
            auto *pLArray = variant.getArrayPtr();
            int nsize = pLArray->size();
            auto napi_array = Napi::Array::New(env);
            // transfer elements
            for (int i=0; i<nsize; ++i) {
                qlib::LVariant &value = pLArray->at(i);
                auto napi_val = lvarToNapiValue(env, value);
                napi_array.Set(i, napi_val);
            }
            return napi_array;
        }
        case qlib::LVariant::LT_DICT: {
            auto napi_dict =Napi::Object::New(env);
            // transfer elements
            auto *pLDict = variant.getDictPtr();
            for (auto &&elem : *pLDict) {
                const qlib::LString &key = elem.first;
                qlib::LVariant &value = elem.second;
                auto napi_val = lvarToNapiValue(env, value);
                napi_dict.Set(key.c_str(), napi_val);
            }

            return napi_dict;
        }
    default:
            break;
    }

    auto msg = LString::format("Unable to convert LVariant(%d) to Napi::Value",
                               variant.getTypeID());
    Napi::Error::New(env, msg.c_str()).ThrowAsJavaScriptException();
    return env.Null();
}

class NapiCallBackObj : public qlib::LScrCallBack
{
private:
    Napi::FunctionReference m_funcRef;

public:
    NapiCallBackObj(Napi::Value value)
    {
        auto func = value.As<Napi::Function>();
        m_funcRef = Napi::Persistent(func);
        printf("NAPI Callback obj created %p\n", this);
    }

    virtual ~NapiCallBackObj()
    {
        m_funcRef.Unref();
        printf("NAPI Callback obj deleted %p\n", this);
    }

    virtual bool invoke(qlib::LVarArgs &args)
    {
        printf("NAPI Callback obj %p invoke called\n", this);
        const int nargs = args.getSize();
        auto env = m_funcRef.Env();
        std::vector<napi_value> napi_args(nargs);

        // convert LVariant to NAPI Value
        for (int i = 0; i < nargs; ++i) {
            napi_args[i] = Wrapper::lvarToNapiValue(env, args.at(i));
        }

        try {
            m_funcRef.Call(napi_args);
        } catch (...) {
            printf("Unknown exception occurred in NapiCallBackObj.invoke()\n");
            return false;
        }

        return true;
    }

    virtual LCloneableObject *clone() const
    {
        MB_ASSERT(false);
        return NULL;
    }
};

/// convert NAPI value to LVariant
bool Wrapper::napiValueToLVar(Napi::Env env, Napi::Value value, qlib::LVariant &rvar)
{
    try {
        // null
        if (value.IsNull() || value.IsUndefined()) {
            rvar.setNull();
            // printf("napiValueToLVar conv NULL\n");
            return true;
        }
        // boolean
        if (value.IsBoolean()) {
            rvar.setBoolValue(bool(value.ToBoolean()));
            return true;
        }
        // number
        if (value.IsNumber()) {
            rvar.setRealValue(double(value.ToNumber()));
            return true;
        }
        // string
        if (value.IsString()) {
            rvar.setStringValue(value.ToString().Utf8Value().c_str());
            return true;
        }
        // function (callable)
        if (value.IsFunction()) {
            auto *pcb = new NapiCallBackObj(value);
            auto *pcb_ptr = new qlib::LSCBPtr(pcb);
            rvar.shareObjectPtr(pcb_ptr);
            return true;
        }
        // array (TODO: typed array, etc...)
        if (value.IsArray()) {
            auto array = value.As<Napi::Array>();
            int nsize = array.Length();
            qlib::LVarArray *pArray = MB_NEW qlib::LVarArray(nsize);
            rvar.setArrayPtr(pArray);
            for (int i=0; i<nsize; ++i) {
                napiValueToLVar(env, array.Get(i), pArray->at(i));
            }
            printf("*** array length: %d\n", nsize);
            return true;
        }
        // object (wrapped or dict)
        if (value.IsObject()) {
            // try to get wrapped scrobj
            Napi::Object obj = value.ToObject();

            // TODO: other key to check wrapped object ??
            bool iswrapped = obj.Has("getAbiClassName");
            if (iswrapped) {
                // This should not be failed
                Wrapper *pWrapper = Wrapper::Unwrap(obj);
                if (!pWrapper) {
                    printf("Napi::Object not wrapper object\n");
                    return false;
                }
                auto pScrObj = pWrapper->getWrapped();
                if (!pScrObj) {
                    printf("Null wrapped object\n");
                    return false;
                }
                if (pScrObj) {
                    // pobj is owned by the interpreter (?)
                    // (variant share the ptr and won't have the ownership!!)
                    rvar.shareObjectPtr(pScrObj);
                    return true;
                }
            } else {
                // dict
                qlib::LVarDict *pDict = MB_NEW qlib::LVarDict();
                rvar.setDictPtr(pDict);
                auto prop_names = obj.GetPropertyNames();
                for (int i=0; i<prop_names.Length(); ++i) {
                    auto key = prop_names.Get(i);
                    auto key_str = qlib::LString(key.ToString().Utf8Value().c_str());
                    // printf("dict key %d: %s\n", i, key_str.c_str());
                    auto value = obj.Get(key);
                    qlib::LVariant lvar;
                    napiValueToLVar(env, value, lvar);
                    pDict->set(key_str, lvar);
                }
                return true;
            }
        }
    } catch (...) {
        printf("Unknown exception occurred in Wrapper::napiValueToLVar\n");
        return false;
    }

    printf("Unsupported value type\n");
    return false;
}

Napi::Object Wrapper::Init(Napi::Env env, Napi::Object exports)
{
    Napi::Function func =
        DefineClass(env, "Wrapper",
                    {InstanceMethod<&Wrapper::toString>("toString"),
                     InstanceMethod<&Wrapper::getClassName>("getClassName"),
                     InstanceMethod<&Wrapper::getAbiClassName>("getAbiClassName"),
                     InstanceMethod<&Wrapper::getProp>("getProp"),
                     InstanceMethod<&Wrapper::setProp>("setProp"),
                     InstanceMethod<&Wrapper::invokeMethod>("invokeMethod")});

    Napi::FunctionReference *ctor = new Napi::FunctionReference();
    *ctor = Napi::Persistent(func);
    env.SetInstanceData(ctor);

    exports.Set("Wrapper", func);
    return exports;
}

Napi::Object Wrapper::createWrapper(Napi::Env env, qlib::LScriptable *pObj)
{
    auto ctor = env.GetInstanceData<Napi::FunctionReference>();
    auto wrapper = ctor->New({});

    Wrapper *pWrapper = Wrapper::Unwrap(wrapper);
    pWrapper->setWrapped(pObj);

    return wrapper;
}

}  // namespace node_jsbr
