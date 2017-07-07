// -*-Mode: C++;-*-
//
// Scriptable Byte Array
//

#ifndef L_BYTE_ARRAY_HPP_INCLUDED_
#define L_BYTE_ARRAY_HPP_INCLUDED_

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
    /// Element type (defined in LTypes.hpp, qlib::type_consts)
    int m_nElemType;

  public:
    int getElemType() const { return m_nElemType; }

    void setElemType(int n) { m_nElemType = n; }

/*
  private:
    /// number of elements (max: 3D array)
    IntVec3D m_shape;

  public:
    const IntVec3D &getShape() const { return m_shape; }

    void setShape(const IntVec3D &s) { m_shape = s; }
*/
  public:
    int getElemCount() const { return getSize()/getElemSize(m_nElemType); }
    
  public:
    LByteArray()
         : Array<qbyte>(), m_nElemType(type_consts::QTC_UINT8)
    {
    }

    LByteArray(int nsize)
         : Array<qbyte>(nsize), m_nElemType(type_consts::QTC_UINT8)
    {
    }

    LByteArray(const LByteArray &a)
         : Array<qbyte>(a), m_nElemType(a.m_nElemType)
    {
    }

    //////////

    bool isIntElem() const {
      if (m_nElemType==type_consts::QTC_UINT8||
          m_nElemType==type_consts::QTC_INT8||
          m_nElemType==type_consts::QTC_UINT16||
          m_nElemType==type_consts::QTC_INT16||
          m_nElemType==type_consts::QTC_UINT32||
          m_nElemType==type_consts::QTC_INT32||
          m_nElemType==type_consts::QTC_UINT64||
          m_nElemType==type_consts::QTC_INT64)
        return true;
      else
        return false;
    }

    bool isFloatElem() const {
      if (m_nElemType==type_consts::QTC_FLOAT8||
          m_nElemType==type_consts::QTC_FLOAT16||
          m_nElemType==type_consts::QTC_FLOAT32||
          m_nElemType==type_consts::QTC_FLOAT64||
          m_nElemType==type_consts::QTC_FLOAT128)
        return true;
      else
        return false;
    }

    static int getElemSize(int nElemType) {
      int nElemSize=-1;
      if (nElemType==type_consts::QTC_UINT8||
          nElemType==type_consts::QTC_INT8||
          nElemType==type_consts::QTC_FLOAT8)
        nElemSize=1;
      else if (nElemType==type_consts::QTC_UINT16||
               nElemType==type_consts::QTC_INT16||
               nElemType==type_consts::QTC_FLOAT16)
        nElemSize=2;
      else if (nElemType==type_consts::QTC_UINT32||
               nElemType==type_consts::QTC_INT32||
               nElemType==type_consts::QTC_FLOAT32)
        nElemSize=4;
      else if (nElemType==type_consts::QTC_UINT64||
               nElemType==type_consts::QTC_INT64||
               nElemType==type_consts::QTC_FLOAT64)
        nElemSize=8;
      else if (nElemType==type_consts::QTC_FLOAT128)
        nElemSize=16;
      return nElemSize;
    }

    void init(int nElemType, int nElemCount)
    {
      int nElemSize=getElemSize(nElemType);
      if (nElemSize<0) {
        MB_THROW(RuntimeException,
                 LString::format("Unsupported element type %d", nElemType));
      }

      m_nElemType = nElemType;
      Array<qbyte>::allocate(nElemSize*nElemCount);
    }
    

    //

    int getValue(int ind) const
    {
      if (!isIntElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));
      
      const int nsize = getSize();
      MB_ASSERT(0<=ind && ind<nsize);
      if (ind<0 || nsize<=ind)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray get() out of index %d", ind));
      return at(ind);
    }

    void setValue(int ind, int value)
    {
      if (!isIntElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));

      const int nsize = getSize();
      MB_ASSERT(0<=ind && ind<nsize);
      if (ind<0 || nsize<=ind)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray get() out of index %d", ind));
      at(ind) = qbyte(value);
    }

    //

    double getValueF(int ind) const
    {
      if (!isFloatElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));
      
      int nElemSize = getElemSize(m_nElemType);
      int addr = ind*nElemSize;
      const int nsize = getSize();
      //MB_ASSERT(0<=ind && ind*nElemSize<nsize);
      if (ind<0 || nsize<=addr)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray get() out of index %d", ind));

      const qbyte *pdata = Array<qbyte>::data();
      if (m_nElemType==type_consts::QTC_FLOAT32) {
        const qfloat32 *pp = reinterpret_cast<const qfloat32 *>(pdata);
        return double(pp[ind]);
      }
      else if (m_nElemType==type_consts::QTC_FLOAT64) {
        const qfloat64 *pp = reinterpret_cast<const qfloat64 *>(pdata);
        return double(pp[ind]);
      }

      MB_THROW(RuntimeException,
               LString::format("Unsupported element type %d", m_nElemType));
      return 0.0;
    }

    void setValueF(int ind, double value)
    {
      if (!isFloatElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));

      int nElemSize = getElemSize(m_nElemType);
      int addr = ind*nElemSize;
      const int nsize = getSize();
      //MB_ASSERT(0<=ind && ind*nElemSize<nsize);
      if (ind<0 || nsize<=addr)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray get() out of index %d", ind));

      qbyte *pdata = Array<qbyte>::data();
      if (m_nElemType==type_consts::QTC_FLOAT32) {
        qfloat32 *pp = reinterpret_cast<qfloat32 *>(pdata);
        pp[ind] = qfloat32(value);
        return;
      }
      else if (m_nElemType==type_consts::QTC_FLOAT64) {
        qfloat64 *pp = reinterpret_cast<qfloat64 *>(pdata);
        pp[ind] = qfloat64(value);
        return;
      }

      MB_THROW(RuntimeException,
               LString::format("Unsupported element type %d", m_nElemType));
    }

    //////////

    LString toString() const {
      return LString::format("ByteArray(type=%d, nelem=%d)", m_nElemType, getElemCount());
    }

  };

}

#endif
