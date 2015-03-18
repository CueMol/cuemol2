// -*-Mode: C++;-*-
//
// Text image buffer
//

#ifndef GFX_TEXT_IMAGE_BUFFER_HPP_INCLUDED_
#define GFX_TEXT_IMAGE_BUFFER_HPP_INCLUDED_

#include "gfx.hpp"

#include "PixelBuffer.hpp"
#include <qlib/LScrObjects.hpp>
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

  public:
    TextImgBuf()
      : super_t(), m_nMode(TIB_SIMPLE), m_olsize(0.0)
    {
    }

    TextImgBuf(const TextImgBuf &a)
      : super_t(a),
      m_nMode(a.m_nMode),
      m_olsize(a.m_olsize),
      m_color(a.m_color),
      m_olcolor(a.m_olcolor)
    {
    }

    //////////
    // props

    /// rendering mode
  private:
    int m_nMode;
    
  public:
    static const int TIB_SIMPLE=0;
    static const int TIB_OUTLINE=1;
    static const int TIB_HTML=2;

    int getMode() const { return m_nMode; }
    void setMode(int n) { m_nMode = n; }

    /// text string
  private:
    LString m_text;

  public:
    LString getText() const { return m_text; }
    void setText(const LString &txt) { m_text = txt; }

    /// font name
  private:
    LString m_font;

  public:
    LString getFont() const { return m_font; }
    void setFont(const LString &txt) { m_font = txt; }

    /// outline size in pixel unit
  private:
    double m_olsize;

  public:
    double getOlSize() const { return m_olsize; }
    void setOlSize(double d) { m_olsize = d; }

    /// color
  private:
    LString m_color;

  public:
    LString getColor() const { return m_color; }
    void setColor(const LString &col) { m_color = col; }

    /// outline color
  private:
    LString m_olcolor;

  public:
    LString getOlColor() const { return m_olcolor; }
    void setOlColor(const LString &col) { m_olcolor = col; }


    //////////
    // 1-D access

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
    // 2-D access

    void setAt2D(int x, int y, quint32 value)
    {
      QUE_BYTE *pdata = data();
      if (pdata==NULL) {
        MB_THROW(IndexOutOfBoundsException,
                 LString("TextImgBuf setAt() array is null"));
      }
      size_t ndep = getDepth()/8;
      size_t ind = ( x + y*getWidth() )*ndep;
      if (ind>=size()) {
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setAt2D() out of index %d", ind));
      }
      if (ndep==1) {
	pdata[ind] = (QUE_BYTE) value;
      }
      else if (ndep==4) {
	pdata[ind] = (QUE_BYTE) (value >> 0) & 0xFF;
	pdata[ind+1] = (QUE_BYTE) (value >> 8) & 0xFF;
	pdata[ind+2] = (QUE_BYTE) (value >> 16) & 0xFF;
	pdata[ind+3] = (QUE_BYTE) (value >> 24) & 0xFF;
      }
      else {
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setAt2D() unsupported depth %d", getDepth()));
      }
    }
    
    quint32 getAt2D(int x, int y) const
    {
      const QUE_BYTE *pdata = data();
      if (pdata==NULL) {
        MB_THROW(IndexOutOfBoundsException,
                 LString("TextImgBuf setAt() array is null"));
      }
      size_t ndep = getDepth()/8;
      size_t ind = ( x + y*getWidth() )*ndep;
      if (ind>=size()) {
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setAt() out of index %d", ind));
      }

      if (ndep==1) {
	return pdata[ind];
      }
      else if (ndep==4) {
	const quint32 b = pdata[ind];
	const quint32 g = pdata[ind+1];
	const quint32 r = pdata[ind+2];
	const quint32 a = pdata[ind+3];
	return (((a & 0xFF) << 24) |
		((r & 0xFF) << 16) |
		((g & 0xFF) << 8)  |
		((b & 0xFF) << 0));
      }
      else {
        MB_THROW(IndexOutOfBoundsException,
                 LString::format("TextImgBuf setAt2D() unsupported depth %d", getDepth()));
      }
    }

    //////////

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

  MC_DECL_SCRSP(TextImgBuf);
}

#endif
