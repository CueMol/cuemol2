// -*-Mode: C++;-*-
//
// Pixel buffer object
//

#ifndef GFX_PIXEL_BUFFER_HPP_INCLUDED_
#define GFX_PIXEL_BUFFER_HPP_INCLUDED_

#include "gfx.hpp"

#include <qlib/LString.hpp>

namespace gfx {

  using qlib::LString;

  class GFX_API PixelBuffer
  {
  private:
    int m_nWidth;
    int m_nHeight;
    int m_nDepth;
    typedef std::vector<QUE_BYTE> data_t;

    data_t *m_pData;

  public:
    PixelBuffer() : m_nWidth(0), m_nHeight(0), m_nDepth(8), m_pData(NULL) {}

    /// copy ctor
    PixelBuffer(const PixelBuffer &src);

    ~PixelBuffer();

    int getWidth() const { return m_nWidth; }
    int getHeight() const { return m_nHeight; }
    int getDepth() const { return m_nDepth; }

    void setHeight(int aValue) { m_nHeight = aValue; }
    void setWidth(int aValue) { m_nWidth = aValue; }
    void setDepth(int aValue) { m_nDepth = aValue; }

    //QUE_BYTE *data() { return &(super_t::operator[](0)); }
    //const QUE_BYTE *data() const { return &(super_t::operator[](0)); }

    QUE_BYTE *data()
    {
      if (m_pData==NULL) return NULL;
      return &( m_pData->operator[](0) );
    }

    const QUE_BYTE *data() const
    {
      if (m_pData==NULL) return NULL;
      return &( m_pData->operator[](0) );
    }

    size_t size() const
    {
      if (m_pData==NULL) return 0;
      return m_pData->size();
    }

    void resize(size_t n);

    QUE_BYTE at(int index) const { return m_pData->at(index); }

    void clear();

  };

}

#endif
