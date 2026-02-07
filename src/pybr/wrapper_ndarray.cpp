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

#include <numpy/arrayobject.h>

namespace pybr {

using qlib::LScriptable;

// static
PyObject *numpychk(PyObject *self, PyObject *args)
{
    npy_intp i, ndim, stride;
    // npy_intp *dim1, *dim2, *dim;
    PyObject *array1, *array2, *array;

    npy_intp dim[1] = {10};

    array = PyArray_SimpleNew(1, dim, NPY_FLOAT);
    if (array == NULL) return NULL;

    return array;
}

template <typename T>
struct NpyTypeTraits;

template <>
struct NpyTypeTraits<qfloat32>
{
    static constexpr int npy_type = NPY_FLOAT;
};
template <>
struct NpyTypeTraits<qfloat64>
{
    static constexpr int npy_type = NPY_DOUBLE;
};
template <>
struct NpyTypeTraits<qint8>
{
    static constexpr int npy_type = NPY_INT8;
};
template <>
struct NpyTypeTraits<qint16>
{
    static constexpr int npy_type = NPY_INT16;
};
template <>
struct NpyTypeTraits<qint32>
{
    static constexpr int npy_type = NPY_INT32;
};
template <>
struct NpyTypeTraits<quint8>
{
    static constexpr int npy_type = NPY_UINT8;
};
template <>
struct NpyTypeTraits<quint16>
{
    static constexpr int npy_type = NPY_UINT16;
};
template <>
struct NpyTypeTraits<quint32>
{
    static constexpr int npy_type = NPY_UINT32;
};

template <typename T>
PyObject *createNumpyArrayImpl(qlib::LScrSp<qlib::LByteArray> &baptr)
{
    const void *src_data = baptr->data();
    npy_intp nelems = baptr->getElemCount();

    npy_intp dim[1] = {nelems};
    PyObject *array = PyArray_SimpleNew(1, dim, NpyTypeTraits<T>::npy_type);
    if (array == nullptr) {
        return nullptr;
    }

    const T *pdat = static_cast<const T *>(src_data);
    T *p = static_cast<T *>(PyArray_DATA(reinterpret_cast<PyArrayObject *>(array)));

    std::copy(pdat, pdat + nelems, p);
    return array;
}

template <typename T>
qlib::LScrSp<T> *parseArg(PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return nullptr;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == nullptr) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not a wrapper obj");
        return nullptr;
    }

    // LOG_DPRINTLN("type of arg: %s", typeid(*pScObj).name());
    qlib::LScrSp<T> *pba = dynamic_cast<qlib::LScrSp<T> *>(pScObj);
    if (pba == nullptr) {
        PyErr_SetString(PyExc_RuntimeError, "arg1 is not expected type");
        return nullptr;
    }
    return pba;
}

// static
PyObject *copyToNDArray(PyObject *self, PyObject *args)
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

    static void capsule_destructor(PyObject *capsule)
    {
        auto *ctx =
            static_cast<CapsuleContext *>(PyCapsule_GetPointer(capsule, capsule_name));
        if (ctx) {
            if (ctx->deleter) {
                ctx->deleter();
            }
            delete ctx;
        }
    }

    static constexpr const char *capsule_name = "cpp_array_memory";

public:
    static PyObject *create(void *data, int ndim, const npy_intp *dims, int typenum,
                            Deleter deleter)
    {
        // Create capsule context
        auto ctx = std::make_unique<CapsuleContext>(std::move(deleter));

        // Create capsule
        PyObject *capsule = PyCapsule_New(ctx.get(), capsule_name, capsule_destructor);
        if (!capsule) {
            return nullptr;
        }
        ctx.release();  // Capsule now owns the context

        // Create numpy array
        PyObject *arr = PyArray_SimpleNewFromData(ndim, const_cast<npy_intp *>(dims),
                                                  typenum, data);
        if (!arr) {
            Py_DECREF(capsule);
            return nullptr;
        }

        // Set base object to manage memory
        if (PyArray_SetBaseObject(reinterpret_cast<PyArrayObject *>(arr), capsule) <
            0) {
            Py_DECREF(arr);
            Py_DECREF(capsule);
            return nullptr;
        }

        return arr;
    }
};

// static
PyObject *toNDArray(PyObject *self, PyObject *args)
{
    qlib::LScrSp<qlib::LByteArray> *pba = parseArg<qlib::LByteArray>(args);
    if (pba == nullptr) {
        return nullptr;
    }

    qlib::LScrSp<qlib::LByteArray> &baptr = *pba;
    void *src_data = static_cast<void *>(baptr->data());
    MB_DPRINTLN("toNDArray %p (%d) created!!", baptr.get(), baptr.use_count());

    ////
    // make shared copy
    qlib::LScrSp<qlib::LByteArray> *pba_sh = new qlib::LScrSp<qlib::LByteArray>(*pba);
    MB_DPRINTLN("toNDArray shared %p (%d) created!!", pba_sh->get(),
                pba_sh->use_count());
    auto deleter = [pba_sh]() mutable {
        // Release the shared pointer when numpy array is deleted
        qlib::LScrSp<qlib::LByteArray> &baptr = *pba_sh;
        MB_DPRINTLN("toNDArray %p (%d) deleter called!!", baptr.get(),
                    baptr.use_count());
        delete pba_sh;
        MB_DPRINTLN("toNDArray destruct OK");
    };

    npy_intp dim[1] = {baptr->getElemCount()};

    switch (baptr->getElemType()) {
        case qlib::type_consts::QTC_FLOAT32:
            return NumpyArrayFromCMemory::create(src_data, 1, dim, NPY_FLOAT, deleter);
        case qlib::type_consts::QTC_FLOAT64:
            return NumpyArrayFromCMemory::create(src_data, 1, dim, NPY_DOUBLE, deleter);

        case qlib::type_consts::QTC_UINT8:
            return NumpyArrayFromCMemory::create(src_data, 1, dim, NPY_UINT8, deleter);
        case qlib::type_consts::QTC_UINT16:
            return NumpyArrayFromCMemory::create(src_data, 1, dim, NPY_UINT16, deleter);
        case qlib::type_consts::QTC_UINT32:
            return NumpyArrayFromCMemory::create(src_data, 1, dim, NPY_UINT32, deleter);

        case qlib::type_consts::QTC_INT8:
            return NumpyArrayFromCMemory::create(src_data, 1, dim, NPY_INT8, deleter);
        case qlib::type_consts::QTC_INT16:
            return NumpyArrayFromCMemory::create(src_data, 1, dim, NPY_INT16, deleter);
        case qlib::type_consts::QTC_INT32:
            return NumpyArrayFromCMemory::create(src_data, 1, dim, NPY_INT32, deleter);

        default:
            PyErr_SetString(PyExc_RuntimeError, "unknown bytearray type");
            delete pba_sh;
            return nullptr;
    }
}

//////////
// NDArray --> ByteArray

// static
PyObject *copyFromNDArray(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) {
        PyErr_SetString(PyExc_ValueError, "invalid arguments");
        return nullptr;
    }

    if (!PyArray_Check(pPyObj)) {
        PyErr_SetString(PyExc_ValueError, "arg1 is not numpy array");
        return nullptr;
    }

    PyArrayObject *pArr = reinterpret_cast<PyArrayObject *>(pPyObj);
    int ndim = PyArray_NDIM(pArr);
    npy_intp *dims = PyArray_DIMS(pArr);
    int typenum = PyArray_TYPE(pArr);
    void *data = PyArray_DATA(pArr);

    if (ndim != 1) {
        MB_DPRINTLN("ERROR: numpy array ndim !=1 not supported");
        PyErr_SetString(PyExc_ValueError, "numpy array ndim !=1 not supported");
        return nullptr;
    }

    MB_DPRINTLN("copyFromNDArray ndim=%d, dim[0]=%ld, typenum=%d", ndim, dims[0],
                typenum);
    auto nitems = dims[0];
    qlib::LByteArray *pNewObj = new qlib::LByteArray();
    switch (typenum) {
        case NPY_FLOAT:
            pNewObj->initFrom(qlib::type_consts::QTC_FLOAT32, nitems, data);
            break;
        case NPY_DOUBLE:
            pNewObj->initFrom(qlib::type_consts::QTC_FLOAT64, nitems, data);
            break;
        case NPY_UINT8:
            pNewObj->initFrom(qlib::type_consts::QTC_UINT8, nitems, data);
            break;
        case NPY_UINT16:
            pNewObj->initFrom(qlib::type_consts::QTC_UINT16, nitems, data);
            break;
        case NPY_UINT32:
            pNewObj->initFrom(qlib::type_consts::QTC_UINT32, nitems, data);
            break;
        case NPY_INT8:
            pNewObj->initFrom(qlib::type_consts::QTC_INT8, nitems, data);
            break;
        case NPY_INT16:
            pNewObj->initFrom(qlib::type_consts::QTC_INT16, nitems, data);
            break;
        case NPY_INT32:
            pNewObj->initFrom(qlib::type_consts::QTC_INT32, nitems, data);
            break;
        default:
            PyErr_SetString(PyExc_RuntimeError, "numpy array type not supported");
            return nullptr;
    }

    // return shared ptr obj
    auto *pRet = MB_NEW qlib::LByteArrayPtr(pNewObj);

    return Wrapper::createWrapper(pRet);
}

// static
PyObject *fromNDArray(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) {
        PyErr_SetString(PyExc_ValueError, "invalid arguments");
        return nullptr;
    }

    if (!PyArray_Check(pPyObj)) {
        PyErr_SetString(PyExc_ValueError, "arg1 is not numpy array");
        return nullptr;
    }

    PyArrayObject *pArr = reinterpret_cast<PyArrayObject *>(pPyObj);
    int ndim = PyArray_NDIM(pArr);
    npy_intp *dims = PyArray_DIMS(pArr);
    int typenum = PyArray_TYPE(pArr);
    void *data = PyArray_DATA(pArr);

    if (ndim != 1) {
        MB_DPRINTLN("ERROR: numpy array ndim !=1 not supported");
        PyErr_SetString(PyExc_ValueError, "numpy array ndim !=1 not supported");
        return nullptr;
    }

    // check C-contiguous/native byte order
    if (!PyArray_ISCARRAY(pArr)) {
        MB_DPRINTLN("ERROR: array is not C-contiguous/native byte order");
        PyErr_SetString(PyExc_ValueError,
                        "array is not C-contiguous/native byte order");
        return nullptr;
    }

    MB_DPRINTLN("fromNDArray ndim=%d, dim[0]=%ld, typenum=%d", ndim, dims[0], typenum);

    auto nitems = dims[0];
    qlib::LByteArray *pNewObj = new qlib::LByteArray();

    switch (typenum) {
        case NPY_FLOAT:
            pNewObj->refer(qlib::type_consts::QTC_FLOAT32, nitems, data);
            break;
        case NPY_DOUBLE:
            pNewObj->refer(qlib::type_consts::QTC_FLOAT64, nitems, data);
            break;

        case NPY_UINT8:
            pNewObj->refer(qlib::type_consts::QTC_UINT8, nitems, data);
            break;
        case NPY_UINT16:
            pNewObj->refer(qlib::type_consts::QTC_UINT16, nitems, data);
            break;
        case NPY_UINT32:
            pNewObj->refer(qlib::type_consts::QTC_UINT32, nitems, data);
            break;

        case NPY_INT8:
            pNewObj->refer(qlib::type_consts::QTC_INT8, nitems, data);
            break;
        case NPY_INT16:
            pNewObj->refer(qlib::type_consts::QTC_INT16, nitems, data);
            break;
        case NPY_INT32:
            pNewObj->refer(qlib::type_consts::QTC_INT32, nitems, data);
            break;

        default:
            PyErr_SetString(PyExc_RuntimeError, "numpy array type not supported");
            return nullptr;
    }

    Py_INCREF(pPyObj);  // hold numpy array
    pNewObj->setOnDestroy([pPyObj](auto &p) {
        MB_DPRINTLN("***** LByteArray(%p) onDestroy callback called!!", p.data());
        PyGILState_STATE gstate = PyGILState_Ensure();
        Py_DECREF(pPyObj);
        PyGILState_Release(gstate);
        MB_DPRINTLN("***** LByteArray(%p) PyObj released!!", p.data());
    });

    // return createWrapper(pNewObj);

    // return shared ptr obj
    auto *pRet = MB_NEW qlib::LByteArrayPtr(pNewObj);

    return Wrapper::createWrapper(pRet);
}

static PyMethodDef numpy_methods[] = {
    {"numpychk", (PyCFunction)numpychk, METH_VARARGS, "numpychk.\n"},
    {"copy_to_ndarray", (PyCFunction)copyToNDArray, METH_VARARGS,
     "conv to numpy ndarray.\n"},
    {"to_ndarray", (PyCFunction)toNDArray, METH_VARARGS, "conv to numpy ndarray.\n"},
    {"from_ndarray", (PyCFunction)fromNDArray, METH_VARARGS,
     "conv from numpy ndarray to ByteArray.\n"},
    {"copy_from_ndarray", (PyCFunction)copyFromNDArray, METH_VARARGS,
     "copy from numpy ndarray to ByteArray.\n"},
    {NULL, NULL, 0, NULL} /* Sentinel */
};

// static
bool Wrapper::initNumPy(PyObject *m)
{
    import_array1(false);

    PyModule_AddFunctions(m, numpy_methods);
    return true;
}

}  // namespace pybr
