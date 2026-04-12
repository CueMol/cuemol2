// -*-Mode: C++;-*-
//
// Text image buffer
//

#ifndef GFX_TEXT_IMAGE_BUFFER_HPP_INCLUDED_
#define GFX_TEXT_IMAGE_BUFFER_HPP_INCLUDED_

#include "gfx.hpp"

#include "PixelBuffer.hpp"
#include <qlib/LScrObjects.hpp>
#include <qlib/LByteArray.hpp>
#include <qlib/LVariant.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/LTypes.hpp>
#include <qlib/LExceptions.hpp>
#include <qlib/mcutils.hpp>

namespace gfx {

  using qlib::LString;
  using qlib::IndexOutOfBoundsException;

  ///
  /// Scriptable pixel buffer for text rendering
  ///
  class GFX_API TextImgBuf : public qlib::LSimpleCopyScrObject, public PixelBuffer
  {
    MC_SCRIPTABLE;
    MC_CLONEABLE;

    typedef PixelBuffer super_t;

  private:
    LString m_text;
    LString m_font;

  public:
    TextImgBuf()
         : super_t()
    {
    }

    /*
    TextImgBuf(int nsize)
         : super_t(nsize)
    {
    }
*/
    
    TextImgBuf(const TextImgBuf &a)
         : super_t(a)
    {
    }

    LString getText() const { return m_text; }
    void setText(const LString &txt) { m_text = txt; }

    LString getFont() const { return m_font; }
    void setFont(const LString &txt) { m_font = txt; }

    void setAt(int ind, int value)
    {
      QUE_BYTE *pdata = data();
      if (pdata==NULL) {
        MB_THROW(IndexOutOfBoundsException,
                 LString("TextImgBuf setAt() array is null"));
      }
      if (ind>=size()||ind<0) {
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
      if (ind>=size()||ind<0) {
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
      if (ind>=size()||ind<0) {
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
      if (ind>=size()||ind<0) {
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setAt() out of index %d", ind));
      }
      return pdata[ind];
    }

    void setDataFromRGBA(qlib::LByteArrayPtr pSrc)
    {
      if (pSrc.isnull())
        MB_THROW(qlib::NullPointerException,
                 LString("TextImgBuf setDataFromRGBA() src is null"));
      const size_t npix = size();
      if (pSrc->getSize() != npix * 4)
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setDataFromRGBA() size mismatch: src=%d, expected=%d",
                                 pSrc->getSize(), npix * 4));
      const QUE_BYTE *src = pSrc->data();
      QUE_BYTE *dst = data();
      for (size_t i = 0; i < npix; ++i) {
        dst[i] = src[i * 4 + 3];  // alpha channel
      }
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

  typedef qlib::LScrSp<TextImgBuf> TextImgBufPtr;
}

#endif
