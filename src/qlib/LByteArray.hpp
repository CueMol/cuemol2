// -*-Mode: C++;-*-
//
// Scriptable Byte Array
//

#pragma once

#include "qlib.hpp"

#include "Array.hpp"
#include "LScrObjects.hpp"
#include "LVariant.hpp"
#include "LScrSmartPtr.hpp"
#include "LTypes.hpp"
#include "mcutils.hpp"

namespace qlib {

///
/// Scriptable array of byte (unsigned char)
///
class QLIB_API LByteArray : public LSimpleCopyScrObject, public Array<qbyte>
{
    MC_SCRIPTABLE;
    MC_CLONEABLE;

private:
    using super_t = Array<qbyte>;

    /// Element type (defined in LTypes.hpp, qlib::type_consts)
    int m_nElemType;

public:
    int getElemType() const
    {
        return m_nElemType;
    }

    void setElemType(int n)
    {
        m_nElemType = n;
    }

    /*
      private:
        /// number of elements (max: 3D array)
        IntVec3D m_shape;

      public:
        const IntVec3D &getShape() const { return m_shape; }

        void setShape(const IntVec3D &s) { m_shape = s; }
    */
public:
    int getElemCount() const
    {
        return getSize() / getElemSize(m_nElemType);
    }

public:
    // type constants
    static const int enumBOOL = type_consts::QTC_BOOL;
    static const int enumUINT8 = type_consts::QTC_UINT8;
    static const int enumUINT16 = type_consts::QTC_UINT16;
    static const int enumUINT32 = type_consts::QTC_UINT32;
    static const int enumUINT64 = type_consts::QTC_UINT64;

    static const int enumINT8 = type_consts::QTC_INT8;
    static const int enumINT16 = type_consts::QTC_INT16;
    static const int enumINT32 = type_consts::QTC_INT32;
    static const int enumINT64 = type_consts::QTC_INT64;

    static const int enumFLOAT8 = type_consts::QTC_FLOAT8;
    static const int enumFLOAT16 = type_consts::QTC_FLOAT16;
    static const int enumFLOAT32 = type_consts::QTC_FLOAT32;
    static const int enumFLOAT64 = type_consts::QTC_FLOAT64;
    static const int enumFLOAT128 = type_consts::QTC_FLOAT128;

    static const int enumUTF8STR = type_consts::QTC_UTF8STR;

public:
    LByteArray() : Array<qbyte>(), m_nElemType(type_consts::QTC_UINT8) {}

    LByteArray(int nsize) : Array<qbyte>(nsize), m_nElemType(type_consts::QTC_UINT8) {}

    LByteArray(const LByteArray &a) : Array<qbyte>(a), m_nElemType(a.m_nElemType) {}

    virtual ~LByteArray();

    //////////

    bool isIntElem() const;

    bool isFloatElem() const;

    static int getElemSize(int nElemType);

    /// Initialize with element type and count
    void init(int nElemType, int nElemCount);

    /// Initialize from external data pointer (copy)
    void initFrom(int nElemType, int nElemCount, const void *pdata);

    /// Initialize from external data pointer (refer)
    void refer(int nElemType, int nElemCount, void *pdata);

    //

    /// Get integer value at the specified index.
    /// The element type is always considered as unsigned byte (uint8).
    /// @param ind index as byte element
    /// @return integer value
    int getValue(int ind) const;

    /// Set integer value at the specified index.
    /// The element type is always considered as unsigned byte (uint8).
    /// @param ind index as byte element
    /// @param value integer value
    void setValue(int ind, int value);

    //

    /// Get float value at the specified index depending on the element type
    /// Fails if the element type is not float type.
    /// @param ind index
    /// @return float value
    double getAtF(int ind) const;

    /// Set float value at the specified index depending on the element type
    /// Fails if the element type is not float type.
    /// @param ind index
    /// @param value float value
    void setAtF(int ind, double value);

    /// Get integer value at the specified index depending on the element type
    /// Fails if the element type is not integral type.
    /// @param ind index
    /// @return integer value
    int getAt(int ind) const;

    /// Set integer value at the specified index depending on the element type
    /// Fails if the element type is not integral type.
    /// @param ind index
    /// @param value integer value
    void setAt(int ind, int value);

    //////////

    LString toString() const;
};

}  // namespace qlib
