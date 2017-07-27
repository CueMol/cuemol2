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

#include "IntVec3D.hpp"

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

    //////////
  private:
    /// number of elements (max: 3D array)
    IntVec3D m_shape;

  public:
    const IntVec3D &getShape() const { return m_shape; }

    void setShape(const IntVec3D &s);

    //////////

  private:
    /// Dimension (max: 3)
    int m_nDim;

  public:
    int getDim() const { return m_nDim; }

    void setDim(int n) { m_nDim = n; }

    //////////

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

    void init(int nElemType, int nElemCount);

    void initRefer(int nElemType, int nElemCount, qbyte *pdata);

    //

    int getValue(int ind) const;

    void setValue(int ind, int value);

    //

    double getValueF(int ind) const;

    void setValueF(int ind, double value);

    //////////

    inline int ind(int ix, int iy, int iz) const {
      return iz + (iy + ix*m_shape.y())*m_shape.z();
    }

    inline int ind(int ix, int iy) const {
      return iy + ix*m_shape.y();
    }

    //////////

    LString toString() const;

  };

}

#endif
