// -*-Mode: C++;-*-
//
// Pixel buffer object
//

#ifndef GFX_PIXEL_BUFFER_HPP_INCLUDED_
#define GFX_PIXEL_BUFFER_HPP_INCLUDED_

#include "gfx.hpp"

#include <qlib/LString.hpp>
#include <qlib/LExceptions.hpp>

namespace gfx {

  using qlib::LString;
  using qlib::IndexOutOfBoundsException;

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

    //////////

    void setAt(int ind, int value)
    {
      QUE_BYTE *pdata = data();
      if (pdata==NULL) {
        MB_THROW(IndexOutOfBoundsException,
                 LString("TextImgBuf setAt() array is null"));
      }
      if (ind>=(int)size()||ind<0) {
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setAt() out of index %d", ind));
      }
      pdata[ind] = (QUE_BYTE) value;
    }
    
    int getAt(int ind) const
    {
      const QUE_BYTE *pdata = data();
      if (pdata==NULL) {
        MB_THROW(IndexOutOfBoundsException,
                 LString("TextImgBuf setAt() array is null"));
      }
      if (ind>=(int)size()||ind<0) {
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setAt() out of index %d", ind));
      }
      return pdata[ind];
    }

    //////////

    void setAt2D(int x, int y, int value)
    {
      QUE_BYTE *pdata = data();
      if (pdata==NULL) {
        MB_THROW(IndexOutOfBoundsException,
                 LString("TextImgBuf setAt() array is null"));
      }
      size_t ind = x + y*getWidth();
      if (ind>=(int)size()||ind<0) {
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setAt() out of index %d", ind));
      }
      pdata[ind] = (QUE_BYTE) value;
    }
    
    int getAt2D(int x, int y) const
    {
      const QUE_BYTE *pdata = data();
      if (pdata==NULL) {
        MB_THROW(IndexOutOfBoundsException,
                 LString("TextImgBuf setAt() array is null"));
      }
      size_t ind = x + y*getWidth();
      if (ind>=(int)size()||ind<0) {
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setAt() out of index %d", ind));
      }
      return pdata[ind];
    }

    void dump() const
    {
      for (int y=0; y<getHeight(); ++y) {
        for (int x=0; x<getWidth(); ++x) {
          int val = getAt2D(x, y);
          MB_DPRINT("%02X", val);
        }
        MB_DPRINTLN("");
      }
    }

  };

}

#endif
