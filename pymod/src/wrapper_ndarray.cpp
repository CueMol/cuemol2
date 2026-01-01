//
// Object wrapper for PyObject
//

#include <common.h>
#include <libcuemol2_api/binding.hpp>

#include "wrapper.hpp"

#include <Python.h>

#include <qlib/ClassRegistry.hpp>
#include <qlib/LByteArray.hpp>
#include <qlib/LString.hpp>
// #include <qlib/LVarArgs.hpp>
// #include <qlib/LVarArray.hpp>
// #include <qlib/PropSpec.hpp>

using namespace pybr;
using qlib::LScriptable;

#ifdef HAVE_NUMPY
#include <numpy/arrayobject.h>
#endif

// static
bool Wrapper::initNumPy()
{
    import_array1(false);

    return true;
}

// static
PyObject *Wrapper::numpychk(PyObject *self, PyObject *args)
{
    npy_intp i, ndim, stride;
    // npy_intp *dim1, *dim2, *dim;
    PyObject *array1, *array2, *array;

    npy_intp dim[1] = {10};

    array = PyArray_SimpleNew(1, dim, NPY_FLOAT);
    if (array == NULL) return NULL;

    return array;
}


template <typename T> struct NpyTypeTraits;

template <> struct NpyTypeTraits<qfloat32> {
    static constexpr int npy_type = NPY_FLOAT;
};
template <> struct NpyTypeTraits<qfloat64> {
    static constexpr int npy_type = NPY_DOUBLE;
};
template <> struct NpyTypeTraits<qint8> {
    static constexpr int npy_type = NPY_INT8;
};
template <> struct NpyTypeTraits<qint16> {
    static constexpr int npy_type = NPY_INT16;
};
template <> struct NpyTypeTraits<qint32> {
    static constexpr int npy_type = NPY_INT32;
};
template <> struct NpyTypeTraits<quint8> {
    static constexpr int npy_type = NPY_UINT8;
};
template <> struct NpyTypeTraits<quint16> {
    static constexpr int npy_type = NPY_UINT16;
};
template <> struct NpyTypeTraits<quint32> {
    static constexpr int npy_type = NPY_UINT32;
};

template <typename T>
PyObject* createNumpyArrayImpl(qlib::LScrSp<qlib::LByteArray> &baptr)
{
    const void* src_data = baptr->data();
    npy_intp nelems = baptr->getElemCount();

    npy_intp dim[1] = {nelems};
    PyObject* array = PyArray_SimpleNew(1, dim, NpyTypeTraits<T>::npy_type);
    if (array == nullptr) {
        return nullptr;
    }
    
    const T* pdat = static_cast<const T*>(src_data);
    T* p = static_cast<T*>(PyArray_DATA(reinterpret_cast<PyArrayObject*>(array)));
    
    std::copy(pdat, pdat + nelems, p);
    return array;
}

template<typename T>
qlib::LScrSp<T> *parseArg(PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return nullptr;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == nullptr) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not wrapper obj");
        return nullptr;
    }

    // LOG_DPRINTLN("type of arg: %s", typeid(*pScObj).name());
    qlib::LScrSp<T> *pba =
        dynamic_cast<qlib::LScrSp<T> *>(pScObj);
    if (pba == nullptr) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not expected type");
        return nullptr;
    }
    return pba;
}

// static
PyObject *Wrapper::copyToNDArray(PyObject *self, PyObject *args)
{
    auto *pba = parseArg<qlib::LByteArray>(args);
    if (pba == nullptr) {
        return nullptr;
    }

    auto &baptr = *pba;
    switch (baptr->getElemType()) {
        case qlib::type_consts::QTC_FLOAT32:
            return createNumpyArrayImpl<qfloat32>(baptr);
        case qlib::type_consts::QTC_FLOAT64:
            return createNumpyArrayImpl<qfloat64>(baptr);

        case qlib::type_consts::QTC_UINT8:
            return createNumpyArrayImpl<quint8>(baptr);
        case qlib::type_consts::QTC_UINT16:
            return createNumpyArrayImpl<quint16>(baptr);
        case qlib::type_consts::QTC_UINT32:
            return createNumpyArrayImpl<quint32>(baptr);

        case qlib::type_consts::QTC_INT8:
            return createNumpyArrayImpl<qint8>(baptr);
        case qlib::type_consts::QTC_INT16:
            return createNumpyArrayImpl<qint16>(baptr);
        case qlib::type_consts::QTC_INT32:
            return createNumpyArrayImpl<qint32>(baptr);

        default:
            PyErr_SetString(PyExc_RuntimeError, "unknown bytearray type");
            return nullptr;
    }

    return nullptr;
}

//////////

class NumpyArrayFromCMemory
{
public:
    using Deleter = std::function<void()>;

private:
    struct CapsuleContext
    {
        Deleter deleter;
        explicit CapsuleContext(Deleter d) : deleter(std::move(d)) {}
    };

    static void capsule_destructor(PyObject* capsule)
    {
        auto* ctx = static_cast<CapsuleContext*>(
            PyCapsule_GetPointer(capsule, capsule_name)
        );
        if (ctx) {
            if (ctx->deleter) {
                ctx->deleter();
            }
            delete ctx;
        }
    }

    static constexpr const char* capsule_name = "cpp_array_memory";

public:
    static PyObject *create(
        void *data,
        int ndim,
        const npy_intp *dims,
        int typenum,
        Deleter deleter
    ) {
        // Create capsule context
        auto ctx = std::make_unique<CapsuleContext>(std::move(deleter));
        
        // Create capsule
        PyObject *capsule = PyCapsule_New(ctx.get(), capsule_name, capsule_destructor);
        if (!capsule) {
            return nullptr;
        }
        ctx.release();  // Capsule now owns the context
        
        // Create numpy array
        PyObject* arr = PyArray_SimpleNewFromData(ndim, const_cast<npy_intp*>(dims), typenum, data);
        if (!arr) {
            Py_DECREF(capsule);
            return nullptr;
        }
        
        // Set base object to manage memory
        if (PyArray_SetBaseObject(reinterpret_cast<PyArrayObject*>(arr), capsule) < 0) {
            Py_DECREF(arr);
            Py_DECREF(capsule);
            return nullptr;
        }
        
        return arr;
    }

};

// static
PyObject *Wrapper::toNDArray(PyObject *self, PyObject *args)
{
    qlib::LScrSp<qlib::LByteArray> *pba = parseArg<qlib::LByteArray>(args);
    if (pba == nullptr) {
        return nullptr;
    }

    qlib::LScrSp<qlib::LByteArray> &baptr = *pba;
    void *src_data = static_cast<void *>(baptr->data());
    MB_DPRINTLN("Wrapper::toNDArray %p (%d) created!!", baptr.get(), baptr.use_count());

    ////
    // make shared copy
    qlib::LScrSp<qlib::LByteArray> *pba_sh = new qlib::LScrSp<qlib::LByteArray>(*pba);
    MB_DPRINTLN("Wrapper::toNDArray shared %p (%d) created!!", pba_sh->get(), pba_sh->use_count());
    auto deleter = [pba_sh]() mutable {
        // Release the shared pointer when numpy array is deleted
        qlib::LScrSp<qlib::LByteArray> &baptr = *pba_sh;
        MB_DPRINTLN("Wrapper::toNDArray %p (%d) deleter called!!", baptr.get(), baptr.use_count());
        delete pba_sh;
    };

    npy_intp dim[1] = {baptr->getElemCount()};

    switch (baptr->getElemType()) {
        case qlib::type_consts::QTC_FLOAT32:
            return NumpyArrayFromCMemory::create(
                src_data, 1, dim, NPY_FLOAT,
                deleter
            );
        case qlib::type_consts::QTC_FLOAT64:
            return NumpyArrayFromCMemory::create(
                src_data, 1, dim, NPY_DOUBLE,
                deleter
            );

        case qlib::type_consts::QTC_UINT8:
            return NumpyArrayFromCMemory::create(
                src_data, 1, dim, NPY_UINT8,
                deleter
            );
        case qlib::type_consts::QTC_UINT16:
            return NumpyArrayFromCMemory::create(
                src_data, 1, dim, NPY_UINT16,
                deleter
            );
        case qlib::type_consts::QTC_UINT32:
            return NumpyArrayFromCMemory::create(
                src_data, 1, dim, NPY_UINT32,
                deleter
            );

        case qlib::type_consts::QTC_INT8:
            return NumpyArrayFromCMemory::create(
                src_data, 1, dim, NPY_INT8,
                deleter
            );
        case qlib::type_consts::QTC_INT16:
            return NumpyArrayFromCMemory::create(
                src_data, 1, dim, NPY_INT16,
                deleter
            );
        case qlib::type_consts::QTC_INT32:
            return NumpyArrayFromCMemory::create(
                src_data, 1, dim, NPY_INT32,
                deleter
            );

        default:
            PyErr_SetString(PyExc_RuntimeError, "unknown bytearray type");
            return nullptr;
    }


    return nullptr;
}
