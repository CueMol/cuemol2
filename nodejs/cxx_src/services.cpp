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

// for test
#define USE_MEM_TRACKING 1
#include <atomic>

namespace node_jsbr {

#ifdef USE_MEM_TRACKING

/// Tracks alloc/free events for zero-copy memory sharing functions.
/// Uses relaxed atomics for minimal overhead (~1ns per operation).
struct MemoryTracker
{
    // toTypedArray: shared_ptr copies created as ArrayBuffer finalizer hints
    std::atomic<int64_t> toTA_allocs{0};
    std::atomic<int64_t> toTA_frees{0};

    // fromTypedArray: Napi::ObjectReference created to prevent TypedArray GC
    std::atomic<int64_t> fromTA_ref_allocs{0};
    std::atomic<int64_t> fromTA_ref_frees{0};

    void reset()
    {
        toTA_allocs.store(0, std::memory_order_relaxed);
        toTA_frees.store(0, std::memory_order_relaxed);
        fromTA_ref_allocs.store(0, std::memory_order_relaxed);
        fromTA_ref_frees.store(0, std::memory_order_relaxed);
    }
};

static MemoryTracker g_memTracker;

#endif

//////////////////////////////////////////////////

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
qlib::LScrSp<T> *parseArg(const Napi::CallbackInfo &info)
{
    // arg0 should be ByteArray object
    if (info.Length() != 1) {
        return nullptr;
    }
    Napi::Value value = info[0];
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
        LOG_DPRINTLN("obj is not wrapped object");
        return nullptr;
    }
    auto pScrObj = pWrapper->getWrapped();
    if (!pScrObj) {
        return nullptr;
    }

    // MB_DPRINTLN("type of arg: %s", typeid(*pScrObj).name());
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
    auto *pba = parseArg<qlib::LByteArray>(info);
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

    LOG_DPRINTLN("Unknown element type %d", elem_type);
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

struct ByteArraySharedContext
{
    // Shared pointer copy - increases reference count
    qlib::LScrSp<qlib::LByteArray> *m_pba_sh;

    explicit ByteArraySharedContext(qlib::LByteArray *pBA)
    {
        // Create a new shared pointer copy
        // This increments the reference count
        m_pba_sh = new qlib::LScrSp<qlib::LByteArray>(pBA);

        // MB_DPRINTLN("ByteArraySharedContext created for %p (refcount: %d)",
        //             m_pba_sh->get(), m_pba_sh->use_count());
    }

    ~ByteArraySharedContext()
    {
        // MB_DPRINTLN("ByteArraySharedContext destructor called for %p (refcount: %d)",
        //             m_pba_sh->get(), m_pba_sh->use_count());

        // Delete the shared pointer
        // This decrements the reference count
        // If count reaches 0, the ByteArray will be deleted
        delete m_pba_sh;

        // MB_DPRINTLN("ByteArraySharedContext destroyed");
    }
};

/**
   Create a JS TypedArray that shares memory with ByteArray
 */
Napi::Value toTypedArray(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    auto *pba = parseArg<qlib::LByteArray>(info);
    if (pba == nullptr) {
        Napi::TypeError::New(env, "argument 0 must be ByteArray object")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    auto &baptr = *pba;

    // Get data pointer and metadata
    void *data = static_cast<void *>(baptr->data());
    int elemType = baptr->getElemType();
    size_t elemCount = baptr->getElemCount();
    size_t byteLength = baptr->getSize();

    // MB_DPRINTLN(
    //     "toTypedArrayShared: ByteArray %p, elemType=%d, elemCount=%zu, byteLength=%zu",
    //     pba, elemType, elemCount, byteLength);

    if (data == nullptr || byteLength == 0) {
        Napi::Error::New(env, "ByteArray has no data").ThrowAsJavaScriptException();
        return env.Null();
    }

    // make shared copy
    // ByteArraySharedContext *ctx = new ByteArraySharedContext(pba);
    qlib::LByteArrayPtr *pba_sh = new qlib::LByteArrayPtr(*pba);

#ifdef USE_MEM_TRACKING
    g_memTracker.toTA_allocs.fetch_add(1, std::memory_order_relaxed);
#endif

    // Create ArrayBuffer with external memory and finalizer
    Napi::ArrayBuffer arrayBuffer = Napi::ArrayBuffer::New(
        env, data, byteLength,
        [](Napi::Env env, void * /*data*/, qlib::LByteArrayPtr *pba_sh) {
            // Finalizer called when ArrayBuffer is garbage collected
            // MB_DPRINTLN("ArrayBuffer finalizer called");
#ifdef USE_MEM_TRACKING
            g_memTracker.toTA_frees.fetch_add(1, std::memory_order_relaxed);
#endif
            delete pba_sh;  // This will decrement the reference count
        },
        pba_sh);

    // Create appropriate TypedArray view based on element type
    try {
        switch (elemType) {
            case qlib::type_consts::QTC_FLOAT32:
                return Napi::Float32Array::New(env, elemCount, arrayBuffer, 0);

            case qlib::type_consts::QTC_FLOAT64:
                return Napi::Float64Array::New(env, elemCount, arrayBuffer, 0);

            case qlib::type_consts::QTC_UINT8:
                return Napi::Uint8Array::New(env, elemCount, arrayBuffer, 0);

            case qlib::type_consts::QTC_UINT16:
                return Napi::Uint16Array::New(env, elemCount, arrayBuffer, 0);

            case qlib::type_consts::QTC_UINT32:
                return Napi::Uint32Array::New(env, elemCount, arrayBuffer, 0);

            case qlib::type_consts::QTC_INT8:
                return Napi::Int8Array::New(env, elemCount, arrayBuffer, 0);

            case qlib::type_consts::QTC_INT16:
                return Napi::Int16Array::New(env, elemCount, arrayBuffer, 0);

            case qlib::type_consts::QTC_INT32:
                return Napi::Int32Array::New(env, elemCount, arrayBuffer, 0);

            default:
                // Unsupported type - clean up context
                delete pba_sh;
                Napi::Error::New(
                    env,
                    LString::format("Unsupported ByteArray element type: %d", elemType)
                        .c_str())
                    .ThrowAsJavaScriptException();
                return env.Null();
        }
    } catch (const Napi::Error &e) {
        // Clean up context on error
        delete pba_sh;
        throw;
    } catch (const std::exception &e) {
        // Clean up context on error
        delete pba_sh;
        Napi::Error::New(
            env, LString::format("Failed to create TypedArray: %s", e.what()).c_str())
            .ThrowAsJavaScriptException();
        return env.Null();
    }
}

/**
 * Create ByteArray from JS TypedArray with zero-copy memory sharing
 *
 * FINAL CORRECTED VERSION - This fixes all compilation errors
 *
 * @param info - Napi callback info containing the TypedArray argument
 * @return Wrapped ByteArray object sharing memory with input TypedArray
 */
Napi::Value fromTypedArray(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();

    // Validate arguments
    if (info.Length() != 1) {
        Napi::TypeError::New(env, "Wrong number of arguments (expected 1)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Argument must be a TypedArray")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    // Get TypedArray object
    auto typedArray = info[0].As<Napi::TypedArray>();

    // Get array properties
    size_t length = typedArray.ElementLength();
    void *data = typedArray.ArrayBuffer().Data();
    size_t byteOffset = typedArray.ByteOffset();

    // Adjust data pointer for byte offset
    void *actualData = static_cast<qbyte *>(data) + byteOffset;

    // MB_DPRINTLN("fromTypedArray: length=%zu, byteOffset=%zu, data=%p", length,
    //             byteOffset, actualData);

    // Determine element type based on TypedArray type
    int elemType = -1;
    napi_typedarray_type arrayType = typedArray.TypedArrayType();

    switch (arrayType) {
        case napi_float32_array:
            elemType = qlib::type_consts::QTC_FLOAT32;
            break;
        case napi_float64_array:
            elemType = qlib::type_consts::QTC_FLOAT64;
            break;
        case napi_uint8_array:
        case napi_uint8_clamped_array:
            elemType = qlib::type_consts::QTC_UINT8;
            break;
        case napi_uint16_array:
            elemType = qlib::type_consts::QTC_UINT16;
            break;
        case napi_uint32_array:
            elemType = qlib::type_consts::QTC_UINT32;
            break;
        case napi_int8_array:
            elemType = qlib::type_consts::QTC_INT8;
            break;
        case napi_int16_array:
            elemType = qlib::type_consts::QTC_INT16;
            break;
        case napi_int32_array:
            elemType = qlib::type_consts::QTC_INT32;
            break;
        case napi_bigint64_array:
        case napi_biguint64_array:
            Napi::TypeError::New(env,
                                 "BigInt64Array and BigUint64Array are not supported")
                .ThrowAsJavaScriptException();
            return env.Null();
        default:
            Napi::TypeError::New(env, "Unsupported TypedArray type")
                .ThrowAsJavaScriptException();
            return env.Null();
    }

    // Create new ByteArray object
    qlib::LByteArray *pNewObj = new qlib::LByteArray();

    // Set up zero-copy reference to TypedArray memory
    pNewObj->refer(elemType, static_cast<int>(length), actualData);

    auto *pPersistentRef = new Napi::ObjectReference();
    // IMPORTANT: refcount=1 creates a STRONG reference that prevents
    // the TypedArray from being garbage collected. With refcount=0
    // (the default), it would be a weak reference and the TypedArray's
    // ArrayBuffer memory could be freed while ByteArray still points to it.
    pPersistentRef->Reset(typedArray, 1);
    // pPersistentRef->Reset(typedArray);

#ifdef USE_MEM_TRACKING
    g_memTracker.fromTA_ref_allocs.fetch_add(1, std::memory_order_relaxed);
#endif

    // Set up destroy callback to release the persistent reference
    pNewObj->setOnDestroy([pPersistentRef](auto &p) {
        // MB_DPRINTLN("***** LByteArray(%p) onDestroy callback called!!", p.data());
#ifdef USE_MEM_TRACKING
        g_memTracker.fromTA_ref_frees.fetch_add(1, std::memory_order_relaxed);
#endif
        // Release the persistent reference to allow TypedArray to be garbage collected
        pPersistentRef->Reset();
        delete pPersistentRef;

        // MB_DPRINTLN("***** LByteArray(%p) TypedArray reference released!!", p.data());
    });

    // MB_DPRINTLN("fromTypedArray: ByteArray created with %d elements of type %d",
    //             static_cast<int>(length), elemType);

    // Create shared pointer wrapper (similar to Python version)
    auto *pRet = MB_NEW qlib::LScrSp<qlib::LByteArray>(pNewObj);

    return Wrapper::createWrapper(env, pRet);
}

//////////

/**
 * Get memory tracking statistics for zero-copy functions
 *
 * @param info - Napi callback info (not used)
 * @return Object containing allocation and free counts for toTypedArray and
 * fromTypedArray
 */
Napi::Value getMemoryTrackingStats(const Napi::CallbackInfo &info)
{
    Napi::Env env = info.Env();
    auto obj = Napi::Object::New(env);

#ifdef USE_MEM_TRACKING
    auto toTA_allocs = g_memTracker.toTA_allocs.load(std::memory_order_relaxed);
    auto toTA_frees = g_memTracker.toTA_frees.load(std::memory_order_relaxed);
    auto fromTA_ref_allocs =
        g_memTracker.fromTA_ref_allocs.load(std::memory_order_relaxed);
    auto fromTA_ref_frees =
        g_memTracker.fromTA_ref_frees.load(std::memory_order_relaxed);
#else
    int64_t toTA_allocs = 0;
    int64_t toTA_frees = 0;
    int64_t fromTA_ref_allocs = 0;
    int64_t fromTA_ref_frees = 0;
#endif

    obj.Set("toTypedArrayAllocs",
            Napi::Number::New(env, static_cast<double>(toTA_allocs)));
    obj.Set("toTypedArrayFrees",
            Napi::Number::New(env, static_cast<double>(toTA_frees)));
    obj.Set("fromTypedArrayRefAllocs",
            Napi::Number::New(env, static_cast<double>(fromTA_ref_allocs)));
    obj.Set("fromTypedArrayRefFrees",
            Napi::Number::New(env, static_cast<double>(fromTA_ref_frees)));

    return obj;
}

/**
 * Reset memory tracking statistics to zero
 *
 * @param info - Napi callback info (not used)
 * @return Undefined
 */
Napi::Value resetMemoryTracking(const Napi::CallbackInfo &info)
{
#ifdef USE_MEM_TRACKING
    g_memTracker.reset();
#endif
    return info.Env().Undefined();
}

}  // namespace node_jsbr
