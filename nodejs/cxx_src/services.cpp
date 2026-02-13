//
// Node.js CueMol service functions
//
#include <common.h>
#include <libcuemol2_api/binding.hpp>
#include <qlib/ClassRegistry.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/LScriptable.hpp>
#include <qlib/qlib.hpp>
#include <qlib/LByteArray.hpp>
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

template <typename T>
qlib::LScrSp<T> *parseArg(Napi::Value value)
{
    if (!value.IsObject()) {
        return nullptr;
    }

    Napi::Object obj = value.ToObject();

    // // TODO: other key to check wrapped object ??
    // if (!obj.Has("getAbiClassName")) {
    //     MB_DPRINTLN("obj does not have getAbiClassName method");
    //     return nullptr;
    // }
    Wrapper *pWrapper = Wrapper::Unwrap(obj);
    if (!pWrapper) {
        MB_DPRINTLN("obj is not wrapped object");
        return nullptr;
    }
    auto pScrObj = pWrapper->getWrapped();
    if (!pScrObj) {
        return nullptr;
    }

    MB_DPRINTLN("type of arg: %s", typeid(*pScrObj).name());
    qlib::LScrSp<T> *psp = dynamic_cast<qlib::LScrSp<T> *>(pScrObj);
    if (psp == nullptr) {
        return nullptr;
    }

    return psp;
}

template <typename T>
Napi::Value createTypedArrayImpl(Napi::Env env, qlib::LScrSp<qlib::LByteArray> &baptr)
{
    const void *src_data = baptr->data();
    const T *pdat = static_cast<const T *>(src_data);
    auto nelems = baptr->getElemCount();
    auto typedArray = Napi::TypedArrayOf<T>::New(env, nelems);
    T *data = typedArray.Data();
    std::copy(pdat, pdat + nelems, data);
    return typedArray;
}

/**
   Copy data from ByteArray to JS TypedArray
 */
Napi::Value copyToTypedArray(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    // arg0 should be ByteArray object
    if (info.Length() != 1) {
        Napi::TypeError::New(env, "Wrong number of arguments")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    auto *pba = parseArg<qlib::LByteArray>(info[0]);
    if (pba == nullptr) {
        Napi::TypeError::New(env, "argument 0 must be ByteArray object")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    auto &baptr = *pba;
    auto elem_type = baptr->getElemType();
    switch (elem_type) {
        case qlib::type_consts::QTC_FLOAT32:
            return createTypedArrayImpl<qfloat32>(env, baptr);
        case qlib::type_consts::QTC_FLOAT64:
            return createTypedArrayImpl<qfloat64>(env, baptr);

        case qlib::type_consts::QTC_UINT8:
            return createTypedArrayImpl<quint8>(env, baptr);
        case qlib::type_consts::QTC_UINT16:
            return createTypedArrayImpl<quint16>(env, baptr);
        case qlib::type_consts::QTC_UINT32:
            return createTypedArrayImpl<quint32>(env, baptr);

        case qlib::type_consts::QTC_INT8:
            return createTypedArrayImpl<qint8>(env, baptr);
        case qlib::type_consts::QTC_INT16:
            return createTypedArrayImpl<qint16>(env, baptr);
        case qlib::type_consts::QTC_INT32:
            return createTypedArrayImpl<qint32>(env, baptr);
    }

    MB_DPRINTLN("Unknown element type %d", elem_type);
    auto errmsg = qlib::LString::format("Unknown ByteArray type: %d", elem_type);
    Napi::TypeError::New(env, errmsg.c_str()).ThrowAsJavaScriptException();
    return env.Null();
}

/**
   Copy data from JS TypedArray to ByteArray
 */
Napi::Value copyFromTypedArray(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    // Validate argument count
    if (info.Length() != 1) {
        Napi::TypeError::New(env, "Wrong number of arguments. Expected 1 TypedArray.")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    // Validate argument type
    if (!info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Argument must be a TypedArray")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    // Get TypedArray and its properties
    Napi::TypedArray typedArray = info[0].As<Napi::TypedArray>();
    size_t elemCount = typedArray.ElementLength();
    void *data = typedArray.ArrayBuffer().Data();
    size_t byteOffset = typedArray.ByteOffset();

    // Adjust data pointer to account for byte offset
    qbyte *pData = static_cast<qbyte *>(data) + byteOffset;

    // Create new ByteArray object
    qlib::LByteArray *pNewObj = new qlib::LByteArray();

    // Determine element type from TypedArray type and initialize with data copy
    auto arrayType = typedArray.TypedArrayType();

   try {
        switch (arrayType) {
            case napi_uint8_array:
            case napi_uint8_clamped_array:
                // Uint8Array and Uint8ClampedArray both map to QTC_UINT8
                pNewObj->initFrom(qlib::type_consts::QTC_UINT8, elemCount, pData);
                break;

            case napi_int8_array:
                pNewObj->initFrom(qlib::type_consts::QTC_INT8, elemCount, pData);
                break;

            case napi_uint16_array:
                pNewObj->initFrom(qlib::type_consts::QTC_UINT16, elemCount, pData);
                break;

            case napi_int16_array:
                pNewObj->initFrom(qlib::type_consts::QTC_INT16, elemCount, pData);
                break;

            case napi_uint32_array:
                pNewObj->initFrom(qlib::type_consts::QTC_UINT32, elemCount, pData);
                break;

            case napi_int32_array:
                pNewObj->initFrom(qlib::type_consts::QTC_INT32, elemCount, pData);
                break;

            case napi_float32_array:
                pNewObj->initFrom(qlib::type_consts::QTC_FLOAT32, elemCount, pData);
                break;

            case napi_float64_array:
                pNewObj->initFrom(qlib::type_consts::QTC_FLOAT64, elemCount, pData);
                break;

            case napi_bigint64_array:
                pNewObj->initFrom(qlib::type_consts::QTC_INT64, elemCount, pData);
                break;

            case napi_biguint64_array:
                pNewObj->initFrom(qlib::type_consts::QTC_UINT64, elemCount, pData);
                break;

            default:
                // Clean up and throw error for unsupported types
                delete pNewObj;
                Napi::TypeError::New(env, "Unsupported TypedArray type")
                    .ThrowAsJavaScriptException();
                return env.Null();
        }
   } catch (const qlib::LException &e) {
        // Handle CueMol exceptions
        delete pNewObj;
        Napi::Error::New(env, e.getMsg().c_str()).ThrowAsJavaScriptException();
        return env.Null();
    } catch (...) {
        // Handle any other exceptions
        delete pNewObj;
        Napi::Error::New(env, "Unknown error occurred during ByteArray initialization")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    // Create shared pointer wrapper
    // This ensures proper reference counting and memory management
    auto *pRet = MB_NEW qlib::LScrSp<qlib::LByteArray>(pNewObj);

    // Create and return wrapper object
    return Wrapper::createWrapper(env, pRet);
}

}  // namespace node_jsbr
