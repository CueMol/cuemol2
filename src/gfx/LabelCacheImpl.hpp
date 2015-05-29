// -*-Mode: C++;-*-
//
// Label/Pixel buffer cache implementation
//

#ifndef GFX_LABEL_CACHE_IMPL_HPP_INCLUDED_
#define GFX_LABEL_CACHE_IMPL_HPP_INCLUDED_

#include "gfx.hpp"

#include <qlib/LString.hpp>
#include <qlib/Vector4D.hpp>
#include "PixelBuffer.hpp"
#include "TextRenderManager.hpp"

namespace gfx {

  using qlib::LString;
  using qlib::Vector4D;
  class DisplayContext;

  class GFX_API LabelCacheImpl
  {
  private:
    struct PixCacheElem
    {
      int m_nID;
      Vector4D pos;
      gfx::PixelBuffer *pPixBuf;
      LString str;

      PixCacheElem(int id, const Vector4D &apos, const LString &astr)
           : m_nID(id), pos(apos), pPixBuf(NULL), str(astr)
      {
      }
    
    };

    typedef std::deque<PixCacheElem> PixBufCache;
    PixBufCache m_data;
    
    double m_dFontSize;
    LString m_strFontName, m_strFontStyle, m_strFontWgt;

    int m_nNextID;

    double m_dScaleFac;
    
  public:
    LabelCacheImpl() : m_nNextID(0), m_dScaleFac(-1.0)
    {
    }
    
    ~LabelCacheImpl()
    {
      invalidateAll();
    }

    void setFont(double fs, const LString &fn, const LString &fsty, const LString &fw);

    void setFontSize(double val);
    double getFontSize() const { return m_dFontSize; }
    
    void setFontName(const LString &val);
    LString getFontName() const { return m_strFontName; }
    
    void setFontStyle(const LString &val);
    LString getFontStyle() const { return m_strFontStyle; }
    
    void setFontWgt(const LString &val);
    LString getFontWgt() const { return m_strFontWgt; }

    int addString(const Vector4D &pos, const LString &str);

    bool remove(int id);

    bool isEmpty() const { return m_data.empty(); }

    /// Draw the rendered text image to display (pdc)
    void draw(DisplayContext *pdc);

    /// Invalidate all pixel image data
    void invalidateAll();

    /// Render the image data from texts
    void render(double pixscl);

  };  

}

#endif


