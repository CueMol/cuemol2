// -*-Mode: C++;-*-
//
// LByteArray class implementation
//

#include <common.h>

#include "LByteArray.hpp"
#include "LExceptions.hpp"

using namespace qlib;

void LByteArray::setShape(const IntVec3D &s)
{
  // check shape consistency
  const int total = getSize();
  if (total<s.x()*s.y()*s.z()) {
    LString msg = LString::format("LByteArray.setShape: total size(%d) is smaller than (%d,%d,%d)", total, s.x(), s.y(), s.z());
    MB_THROW(RuntimeException, msg);
    return;
  }

  if (m_nDim==2) {
    if (s.z()>1) {
      LString msg = LString::format("LByteArray.setShape: dim(%d) and shape(%d,%d,%d) mismatch",
				    m_nDim, s.x(), s.y(), s.z());
      MB_THROW(RuntimeException, msg);
      return;
    }
  }
  else if (m_nDim==1) {
    if (s.y()>1 || s.z()>1) {
      LString msg = LString::format("LByteArray.setShape: dim(%d) and shape(%d,%d,%d) mismatch",
				    m_nDim, s.x(), s.y(), s.z());
      MB_THROW(RuntimeException, msg);
      return;
    }
  }

  m_shape = s;
}

void LByteArray::init(int nElemType, int nElemCount)
{
  int nElemSize=getElemSize(nElemType);
  if (nElemSize<0) {
    MB_THROW(RuntimeException,
	     LString::format("Unsupported element type %d", nElemType));
  }

  m_nElemType = nElemType;
  Array<qbyte>::allocate(nElemSize*nElemCount);

  m_shape = IntVec3D(nElemCount, 1, 1);
  m_nDim = 1;
}

void LByteArray::initRefer(int nElemType, int nElemCount, qbyte *pdata)
{
  int nElemSize=getElemSize(nElemType);
  if (nElemSize<0) {
    MB_THROW(RuntimeException,
	     LString::format("Unsupported element type %d", nElemType));
  }

  m_nElemType = nElemType;
  Array<qbyte>::refer(nElemSize*nElemCount, pdata);

  m_shape = IntVec3D(nElemCount, 1, 1);
  m_nDim = 1;
}


int LByteArray::getValue(int ind) const
{
  if (!isIntElem())
    MB_THROW(RuntimeException,
	     LString::format("Element type %d mismatch", m_nElemType));
  

  int nElemSize = getElemSize(m_nElemType);
  int addr = ind*nElemSize;
  const int nsize = getSize();
  if (ind<0 || nsize<=addr)
    MB_THROW(IndexOutOfBoundsException,
             LString::format("LByteArray get() out of index %d", ind));
  
  const qbyte *pdata = Array<qbyte>::data();
  if (m_nElemType==type_consts::QTC_INT32) {
    const qint32 *pp = reinterpret_cast<const qint32 *>(pdata);
    return pp[ind];
  }
  else if (m_nElemType==type_consts::QTC_INT16) {
    const qint16 *pp = reinterpret_cast<const qint16 *>(pdata);
    return pp[ind];
  }
  else if (m_nElemType==type_consts::QTC_UINT16) {
    const quint16 *pp = reinterpret_cast<const quint16 *>(pdata);
    return pp[ind];
  }
  else if (m_nElemType==type_consts::QTC_INT8) {
    const qint8 *pp = reinterpret_cast<const qint8 *>(pdata);
    return pp[ind];
  }
  else if (m_nElemType==type_consts::QTC_UINT8) {
    const quint8 *pp = reinterpret_cast<const quint8 *>(pdata);
    return pp[ind];
  }

  MB_THROW(RuntimeException,
	   LString::format("Unsupported element type %d", m_nElemType));
  return 0;

  /*
  const int nsize = getSize();
  MB_ASSERT(0<=ind && ind<nsize);
  if (ind<0 || nsize<=ind)
    MB_THROW(IndexOutOfBoundsException,
	     LString::format("LByteArray get() out of index %d", ind));
  return at(ind);
   */
}

void LByteArray::setValue(int ind, int value)
{
  if (!isIntElem())
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

  if (m_nElemType==type_consts::QTC_INT32) {
    qint32 *pp = reinterpret_cast<qint32 *>(pdata);
    pp[ind] = qint32(value);
    return;
  }
  else if (m_nElemType==type_consts::QTC_INT16) {
    qint16 *pp = reinterpret_cast<qint16 *>(pdata);
    pp[ind] = qint16(value);
    return;
  }
  else if (m_nElemType==type_consts::QTC_UINT16) {
    quint16 *pp = reinterpret_cast<quint16 *>(pdata);
    pp[ind] = quint16(value);
    return;
  }
  else if (m_nElemType==type_consts::QTC_INT8) {
    qint8 *pp = reinterpret_cast<qint8 *>(pdata);
    pp[ind] = qint8(value);
    return;
  }
  else if (m_nElemType==type_consts::QTC_UINT8) {
    quint8 *pp = reinterpret_cast<quint8 *>(pdata);
    pp[ind] = quint8(value);
    return;
  }

/*
  const int nsize = getSize();
  MB_ASSERT(0<=ind && ind<nsize);
  if (ind<0 || nsize<=ind)
    MB_THROW(IndexOutOfBoundsException,
	     LString::format("LByteArray get() out of index %d", ind));
  at(ind) = qbyte(value);
*/
}

double LByteArray::getValueF(int ind) const
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

void LByteArray::setValueF(int ind, double value)
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

LString LByteArray::toString() const
{
  return LString::format("ByteArray(type=%d, nelem=%d)", m_nElemType, getElemCount());
}
