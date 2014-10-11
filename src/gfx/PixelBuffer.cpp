// -*-Mode: C++;-*-
//
//  Pixel buffer class
//

#include <common.h>

#include "PixelBuffer.hpp"

using namespace gfx;


PixelBuffer::~PixelBuffer()
{
  clear();
}

PixelBuffer::PixelBuffer(const PixelBuffer &src)
     : m_nWidth(src.m_nWidth), m_nHeight(src.m_nHeight), m_nDepth(src.m_nDepth)
{
  size_t n = src.m_pData->size();
  m_pData = new data_t(n);
  for (int i=0; i<n; ++i)
    m_pData->operator[](i) = src.m_pData->operator[](i);
}

void PixelBuffer::resize(size_t n)
{
  if (m_pData!=NULL) delete m_pData;
  //m_pData = MB_NEW data_t(n);
  m_pData = new data_t(n);
}

void PixelBuffer::clear()
{
  if (m_pData!=NULL)
    delete m_pData;
  m_pData = NULL;
}


