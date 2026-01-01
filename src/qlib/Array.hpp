// -*-Mode: C++;-*-
//
// Array.h
//   1D array class Array
//
// $Id: Array.hpp,v 1.3 2010/11/23 11:19:33 rishitani Exp $

#pragma once

#include "LDebugAssert.hpp"
#include "LDebugNew.hpp"

namespace qlib {

template <class _Type>
class Array
{
private:
    /// data
    _Type *m_array;

    /// number of entries;
    int m_nSize;

    /// This object own the m_array or not (usually true)
    bool m_bOwn;

    /// destroy callback type
    using DestroyCallback = std::function<void(Array<_Type> &)>;

    DestroyCallback m_on_destroy;

public:
    using value_type = _Type;

    ///
    /// Make empty array (we must allocate memory by resize() later.)
    ///
    Array() : m_array(nullptr), m_nSize(0), m_bOwn(false) {}

    ///
    ///  Make array with size sz
    ///
    explicit Array(int sz) : m_nSize(sz), m_bOwn(true)
    {
        m_array = MB_NEW _Type[sz];
    }

    ///
    ///  Make array with size sz and initialize all elements by ini
    ///
    explicit Array(const _Type &ini, int sz) : m_nSize(sz), m_bOwn(true)
    {
        m_array = MB_NEW _Type[sz];
        for (int i = 0; i < sz; i++) m_array[i] = ini;
    }

    ///
    ///  Make array from existing C array
    ///
    explicit Array(int sz, const _Type *p) : m_nSize(sz), m_bOwn(true)
    {
        m_array = MB_NEW _Type[sz];
        for (int i = 0; i < sz; i++) m_array[i] = p[i];
    }

    ///
    /// Copy constructor
    ///
    Array(const Array<_Type> &arg) : m_nSize(arg.m_nSize), m_bOwn(true)
    {
        m_array = MB_NEW _Type[arg.m_nSize];
        for (int i = 0; i < arg.m_nSize; i++) m_array[i] = arg.m_array[i];
    }

    /// destructor
    ~Array()
    {
        // if (m_array != NULL) delete[] m_array;
        clear();
    }

    /////////////////////////////////////////////////////
    // member methods

    void setOnDestroy(DestroyCallback cb)
    {
        m_on_destroy = std::move(cb);
    }

    int size() const
    {
        return m_nSize;
    }
    int getSize() const
    {
        return size();
    }

    /// clear the array
    void clear()
    {
        if (m_on_destroy) {
            m_on_destroy(*this);
        }
        if (m_array != nullptr && m_bOwn) delete[] m_array;
        m_array = nullptr;
        m_nSize = 0;
        m_bOwn = false;
    }

    void resize(int newsz)
    {
        clear();

        if (newsz > 0) {
            m_array = MB_NEW _Type[newsz];
            m_nSize = newsz;
            m_bOwn = true;
        }
    }

    inline bool isOwn() const
    {
        return m_bOwn;
    }

    inline void allocate(int newsz)
    {
        resize(newsz);
    }
    inline void destroy()
    {
        clear();
    }

    /// Setup reference (un-owned) array
    void refer(int sz, _Type *p)
    {
        clear();
        if (sz > 0) {
            m_array = p;
            m_bOwn = false;
            m_nSize = sz;
        }
    }

    //////////

    const _Type &at(int i) const
    {
        MB_ASSERT(i >= 0);
        MB_ASSERT(i < m_nSize);
        return m_array[i];
    }

    _Type &at(int i)
    {
        MB_ASSERT(i >= 0);
        MB_ASSERT(i < m_nSize);
        return m_array[i];
    }

    const _Type *data() const
    {
        return m_array;
    }

    _Type *data()
    {
        return m_array;
    }

    /////////////////////////////////////////////////////
    // member operators

    operator const _Type *() const
    {
        return data();
    }

    const Array<_Type> &operator=(const Array<_Type> &arg)
    {
        if (&arg != this) {
            if (m_array != nullptr) delete[] m_array;
            m_array = MB_NEW _Type[arg.getSize()];

            m_nSize = arg.m_nSize;
            for (int i = 0; i < arg.getSize(); i++) m_array[i] = arg[i];
        }
        return *this;
    }

    const Array<_Type> &operator=(const _Type &arg)
    {
        for (int i = 0; i < getSize(); i++) m_array[i] = arg;
        return *this;
    }

    const _Type &operator[](int i) const
    {
        return at(i);
    }

    _Type &operator[](int i)
    {
        return at(i);
    }

    void assign(std::initializer_list<_Type> list)
    {
        MB_ASSERT(list.size() <= m_nSize);
        std::copy(list.begin(), list.end(), m_array);
    }
};

}  // namespace qlib
