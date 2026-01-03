// -*-Mode: C++;-*-
//

#include <common.h>

#include "LByteArray.hpp"

namespace qlib {

LByteArray::~LByteArray()
{
    // MB_DPRINTLN("LByteArray::~LByteArray()");
}

bool LByteArray::isIntElem() const
{
    if (m_nElemType == type_consts::QTC_UINT8 || m_nElemType == type_consts::QTC_INT8 ||
        m_nElemType == type_consts::QTC_UINT16 ||
        m_nElemType == type_consts::QTC_INT16 ||
        m_nElemType == type_consts::QTC_UINT32 ||
        m_nElemType == type_consts::QTC_INT32 ||
        m_nElemType == type_consts::QTC_UINT64 || m_nElemType == type_consts::QTC_INT64)
        return true;
    else
        return false;
}

bool LByteArray::isFloatElem() const
{
    if (m_nElemType == type_consts::QTC_FLOAT8 ||
        m_nElemType == type_consts::QTC_FLOAT16 ||
        m_nElemType == type_consts::QTC_FLOAT32 ||
        m_nElemType == type_consts::QTC_FLOAT64 ||
        m_nElemType == type_consts::QTC_FLOAT128)
        return true;
    else
        return false;
}

// static
int LByteArray::getElemSize(int nElemType)
{
    int nElemSize = -1;
    if (nElemType == type_consts::QTC_UINT8 || nElemType == type_consts::QTC_INT8 ||
        nElemType == type_consts::QTC_FLOAT8)
        nElemSize = 1;
    else if (nElemType == type_consts::QTC_UINT16 ||
             nElemType == type_consts::QTC_INT16 ||
             nElemType == type_consts::QTC_FLOAT16)
        nElemSize = 2;
    else if (nElemType == type_consts::QTC_UINT32 ||
             nElemType == type_consts::QTC_INT32 ||
             nElemType == type_consts::QTC_FLOAT32)
        nElemSize = 4;
    else if (nElemType == type_consts::QTC_UINT64 ||
             nElemType == type_consts::QTC_INT64 ||
             nElemType == type_consts::QTC_FLOAT64)
        nElemSize = 8;
    else if (nElemType == type_consts::QTC_FLOAT128)
        nElemSize = 16;
    return nElemSize;
}

void LByteArray::init(int nElemType, int nElemCount)
{
    int nElemSize = getElemSize(nElemType);
    if (nElemSize < 0) {
        MB_THROW(RuntimeException,
                 LString::format("Unsupported element type %d", nElemType));
    }

    m_nElemType = nElemType;
    super_t::allocate(nElemSize * nElemCount);
}

void LByteArray::initFrom(int nElemType, int nElemCount, const void *pdata)
{
    int nElemSize = getElemSize(nElemType);
    if (nElemSize < 0) {
        MB_THROW(RuntimeException,
                 LString::format("Unsupported element type %d", nElemType));
    }

    m_nElemType = nElemType;
    super_t::allocate(nElemSize * nElemCount);
    const qbyte *src = reinterpret_cast<const qbyte *>(pdata);
    std::copy(src, src + nElemSize * nElemCount, super_t::data());
}

void LByteArray::refer(int nElemType, int nElemCount, void *pdata)
{
    int nElemSize = getElemSize(nElemType);
    if (nElemSize < 0) {
        MB_THROW(RuntimeException,
                 LString::format("Unsupported element type %d", nElemType));
    }

    m_nElemType = nElemType;
    super_t::refer(nElemSize * nElemCount, reinterpret_cast<qbyte *>(pdata));
}

//

int LByteArray::getValue(int ind) const
{
    if (!isIntElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));

    const int nsize = getSize();
    MB_ASSERT(0 <= ind && ind < nsize);
    if (ind < 0 || nsize <= ind)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray getValue() out of index %d", ind));
    return at(ind);
}

void LByteArray::setValue(int ind, int value)
{
    if (!isIntElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));

    const int nsize = getSize();
    MB_ASSERT(0 <= ind && ind < nsize);
    if (ind < 0 || nsize <= ind)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray setValue() out of index %d", ind));
    at(ind) = qbyte(value);
}

//

int LByteArray::getAt(int ind) const
{
    if (!isIntElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));

    int nElemSize = getElemSize(m_nElemType);
    int addr = ind * nElemSize;
    const int nsize = getSize();
    // MB_ASSERT(0<=ind && ind*nElemSize<nsize);
    if (ind < 0 || nsize <= addr)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray get() out of index %d", ind));

    const qbyte *pdata = Array<qbyte>::data();
    if (m_nElemType == type_consts::QTC_UINT8) {
        const quint8 *pp = reinterpret_cast<const quint8 *>(pdata);
        return int(pp[ind]);
    } else if (m_nElemType == type_consts::QTC_INT8) {
        const qint8 *pp = reinterpret_cast<const qint8 *>(pdata);
        return int(pp[ind]);
    } else if (m_nElemType == type_consts::QTC_UINT16) {
        const quint16 *pp = reinterpret_cast<const quint16 *>(pdata);
        return int(pp[ind]);
    } else if (m_nElemType == type_consts::QTC_INT16) {
        const qint16 *pp = reinterpret_cast<const qint16 *>(pdata);
        return int(pp[ind]);
    } else if (m_nElemType == type_consts::QTC_UINT32) {
        const quint32 *pp = reinterpret_cast<const quint32 *>(pdata);
        if (pp[ind] > INT_MAX) {
            MB_THROW(RuntimeException,
                     LString::format("LByteArray::getAt(): value overflow %u",
                                     pp[ind]));
        }
        return int(pp[ind]);
    } else if (m_nElemType == type_consts::QTC_INT32) {
        const qint32 *pp = reinterpret_cast<const qint32 *>(pdata);
        return int(pp[ind]);
    }

    MB_THROW(RuntimeException,
             LString::format("Unsupported element type %d", m_nElemType));
    return 0;
}

void LByteArray::setAt(int ind, int value)
{
    if (!isIntElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));

    int nElemSize = getElemSize(m_nElemType);
    int addr = ind * nElemSize;
    const int nsize = getSize();
    // MB_ASSERT(0<=ind && ind*nElemSize<nsize);
    if (ind < 0 || nsize <= addr)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray setAt() out of index %d", ind));

    qbyte *pdata = Array<qbyte>::data();
    if (m_nElemType == type_consts::QTC_UINT8) {
        quint8 *pp = reinterpret_cast<quint8 *>(pdata);
        pp[ind] = quint8(value);
        return;
    } else if (m_nElemType == type_consts::QTC_INT8) {
        qint8 *pp = reinterpret_cast<qint8 *>(pdata);
        pp[ind] = qint8(value);
        return;
    } else if (m_nElemType == type_consts::QTC_UINT16) {
        quint16 *pp = reinterpret_cast<quint16 *>(pdata);
        pp[ind] = quint16(value);
        return;
    } else if (m_nElemType == type_consts::QTC_INT16) {
        qint16 *pp = reinterpret_cast<qint16 *>(pdata);
        pp[ind] = qint16(value);
        return;
    } else if (m_nElemType == type_consts::QTC_UINT32) {
        quint32 *pp = reinterpret_cast<quint32 *>(pdata);
        pp[ind] = quint32(value);
        return;
    } else if (m_nElemType == type_consts::QTC_INT32) {
        qint32 *pp = reinterpret_cast<qint32 *>(pdata);
        pp[ind] = qint32(value);
        return;
    }

    MB_THROW(RuntimeException,
             LString::format("Unsupported element type %d", m_nElemType));
}

double LByteArray::getAtF(int ind) const
{
    if (!isFloatElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));

    int nElemSize = getElemSize(m_nElemType);
    int addr = ind * nElemSize;
    const int nsize = getSize();
    // MB_ASSERT(0<=ind && ind*nElemSize<nsize);
    if (ind < 0 || nsize <= addr)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray getAtF() out of index %d", ind));

    const qbyte *pdata = Array<qbyte>::data();
    if (m_nElemType == type_consts::QTC_FLOAT32) {
        const qfloat32 *pp = reinterpret_cast<const qfloat32 *>(pdata);
        return double(pp[ind]);
    } else if (m_nElemType == type_consts::QTC_FLOAT64) {
        const qfloat64 *pp = reinterpret_cast<const qfloat64 *>(pdata);
        return double(pp[ind]);
    }

    MB_THROW(RuntimeException,
             LString::format("Unsupported element type %d", m_nElemType));
    return 0.0;
}

void LByteArray::setAtF(int ind, double value)
{
    if (!isFloatElem())
        MB_THROW(RuntimeException,
                 LString::format("Element type %d mismatch", m_nElemType));

    int nElemSize = getElemSize(m_nElemType);
    int addr = ind * nElemSize;
    const int nsize = getSize();
    // MB_ASSERT(0<=ind && ind*nElemSize<nsize);
    if (ind < 0 || nsize <= addr)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("LByteArray setAtF() out of index %d", ind));

    qbyte *pdata = Array<qbyte>::data();
    if (m_nElemType == type_consts::QTC_FLOAT32) {
        qfloat32 *pp = reinterpret_cast<qfloat32 *>(pdata);
        pp[ind] = qfloat32(value);
        return;
    } else if (m_nElemType == type_consts::QTC_FLOAT64) {
        qfloat64 *pp = reinterpret_cast<qfloat64 *>(pdata);
        pp[ind] = qfloat64(value);
        return;
    }

    MB_THROW(RuntimeException,
             LString::format("Unsupported element type %d", m_nElemType));
}

//////////

LString LByteArray::toString() const
{
    return LString::format("ByteArray(type=%d, nelem=%d)", m_nElemType, getElemCount());
}

}  // namespace qlib
