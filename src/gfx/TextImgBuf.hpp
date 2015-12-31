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
#include <qlib/mcutils.hpp>

namespace gfx {

  using qlib::LString;

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

  };

  typedef qlib::LScrSp<TextImgBuf> TextImgBufPtr;
}

#endif
