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

  public:
    LabelCacheImpl() : m_nNextID(0)
    {
    }
    
    ~LabelCacheImpl()
    {
      invalidate();
    }

    void setupFont(double fs, const LString &fn, const LString &fsty, const LString &fw)
    {
      m_dFontSize = fs;
      m_strFontName = fn;
      m_strFontStyle = fsty;
      m_strFontWgt = fw;
    }

    int addString(const Vector4D &pos, const LString &str);

    bool remove(int id);

    bool isEmpty() const { return m_data.empty(); }

    /// Draw the rendered text image to display (pdc)
    void draw(DisplayContext *pdc);

    /// Invalidate pixel image data
    void invalidate();

    /// Render the image data from texts
    void render();

  };  

}

#endif


