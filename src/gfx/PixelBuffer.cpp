// -*-Mode: C++;-*-
//
//  Pixel buffer class
//

#include <common.h>

#include "PixelBuffer.hpp"

namespace gfx {

PixelBuffer::~PixelBuffer()
{
    MB_DPRINTLN("PixelBuffer::~PixelBuffer() rep=%p", m_pPixRep);
    clear();
}

PixelBuffer::PixelBuffer(const PixelBuffer &src)
    : m_nWidth(src.m_nWidth), m_nHeight(src.m_nHeight), m_nDepth(src.m_nDepth)
{
    // an unallocated source (TextImgBuf::clone() before any text) has no data
    m_pData = (src.m_pData != nullptr) ? new data_t(*src.m_pData) : nullptr;

    // the GPU representation belongs to the source
    m_pPixRep = nullptr;
    MB_DPRINTLN("PixelBuffer::PixelBuffer(copy)");
}

PixelBuffer &PixelBuffer::operator=(const PixelBuffer &src)
{
    if (&src == this) return *this;
    // the implicit assignment shared m_pData and m_pPixRep: double delete
    clear();
    m_nWidth = src.m_nWidth;
    m_nHeight = src.m_nHeight;
    m_nDepth = src.m_nDepth;
    m_pData = (src.m_pData != nullptr) ? new data_t(*src.m_pData) : nullptr;
    m_pPixRep = nullptr;
    return *this;
}

void PixelBuffer::resize(size_t n)
{
    if (m_pData != NULL) delete m_pData;
    // m_pData = MB_NEW data_t(n);
    m_pData = new data_t(n);
}

void PixelBuffer::clear()
{
    if (m_pData != nullptr) delete m_pData;
    m_pData = nullptr;

    if (m_pPixRep != nullptr) delete m_pPixRep;
    m_pPixRep = nullptr;
}

}  // namespace gfx
