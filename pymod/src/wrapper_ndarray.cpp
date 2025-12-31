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


// static
PyObject *Wrapper::copyToNDArray(PyObject *self, PyObject *args)
{
    PyObject *pPyObj;

    if (!PyArg_ParseTuple(args, "O", &pPyObj)) {
        PyErr_SetString(PyExc_RuntimeError, "invalid arguments");
        return NULL;
    }

    qlib::LScriptable *pScObj = Wrapper::getWrapped(pPyObj);
    if (pScObj == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "wrapper obj not found");
        return NULL;
    }

    // LOG_DPRINTLN("type of arg: %s", typeid(*pScObj).name());
    qlib::LScrSp<qlib::LByteArray> *pba =
        dynamic_cast<qlib::LScrSp<qlib::LByteArray> *>(pScObj);
    if (pba == NULL) {
        PyErr_SetString(PyExc_RuntimeError, "wrapper obj not found");
        return NULL;
    }

    auto &baptr = *pba;
    switch (baptr->getElemType()) {
        case qlib::type_consts::QTC_FLOAT32:
            return createNumpyArrayImpl<qfloat32>(baptr);
        case qlib::type_consts::QTC_FLOAT64:
            return createNumpyArrayImpl<qfloat64>(baptr);
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



    // int i;
    // switch (ntypeid) {
    // case qlib::type_consts::QTC_INT8: {
    //     break;
    // }
    // case qlib::type_consts::QTC_INT16: {
    //     array = PyArray_SimpleNew(1, dim, NPY_INT16);
    //     if (array == nullptr) {
    //         return nullptr;
    //     }
    //     auto *pdat = (qint16 *)((*pba)->data());
    //     auto *p = (qint16 *)PyArray_GetPtr((PyArrayObject *)array, dim);
    //     for (i = 0; i < nelems; ++i) {
    //         p[i] = pdat[i];
    //     }
    //     break;
    // }
    // case qlib::type_consts::QTC_INT32: {
    //     array = PyArray_SimpleNew(1, dim, NPY_INT32);
    //     if (array == nullptr) {
    //         return nullptr;
    //     }
    //     auto *pdat = (qint32 *)((*pba)->data());
    //     auto *p = (qint32 *)PyArray_GetPtr((PyArrayObject *)array, dim);
    //     for (i = 0; i < nelems; ++i) {
    //         p[i] = pdat[i];
    //     }
    //     break;
    // }
    // case qlib::type_consts::QTC_FLOAT32: {
    //     array = PyArray_SimpleNew(1, dim, NPY_FLOAT);
    //     if (array == nullptr) {
    //         return nullptr;
    //     }
    //     auto *pdat = (qfloat32 *)((*pba)->data());
    //     auto *p = (qfloat32 *)PyArray_DATA((PyArrayObject *)array);
    //     for (i = 0; i < nelems; ++i) {
    //         p[i] = pdat[i];
    //         MB_DPRINTLN("copied: %d/%d %f", i, nelems, p[i]);
    //     }
    //     break;
    // }
    // case qlib::type_consts::QTC_FLOAT64: {
    //     array = PyArray_SimpleNew(1, dim, NPY_DOUBLE);
    //     if (array == nullptr) {
    //         return nullptr;
    //     }
    //     auto *pdat = (qfloat64 *)((*pba)->data());
    //     auto *p = (qfloat64 *)PyArray_GetPtr((PyArrayObject *)array, dim);
    //     for (i = 0; i < nelems; ++i) {
    //         p[i] = pdat[i];
    //     }
    //     break;
    // }
    // default: {
    //     PyErr_SetString(PyExc_RuntimeError, "unknown bytearray type");
    //     return nullptr;
    // }
    // }

    // if (ntypeid == qlib::type_consts::QTC_INT32) {
    // } else if (ntypeid == qlib::type_consts::QTC_FLOAT32) {
    //     array = PyArray_SimpleNew(1, dim, NPY_FLOAT);
    //     if (array == NULL) return NULL;
    //     float *pdat = (float *)((*pba)->data());
    //     for (int i = 0; i < nelems; ++i) {
    //         dim[0] = i;
    //         float *p = (float *)PyArray_GetPtr((PyArrayObject *)array, dim);
    //         *p = pdat[i];
    //     }
    // } else if (ntypeid == qlib::type_consts::QTC_FLOAT64) {
    //     array = PyArray_SimpleNew(1, dim, NPY_DOUBLE);
    //     if (array == NULL) return NULL;
    //     double *pdat = (double *)((*pba)->data());
    //     for (int i = 0; i < nelems; ++i) {
    //         dim[0] = i;
    //         double *p = (double *)PyArray_GetPtr((PyArrayObject *)array, dim);
    //         *p = pdat[i];
    //     }
    // } else {
    //     PyErr_SetString(PyExc_RuntimeError, "unknown bytearray type");
    //     return NULL;
    // }

    return nullptr;
}

// static
PyObject *Wrapper::toNDArray(PyObject *self, PyObject *args)
{
    return nullptr;
}
