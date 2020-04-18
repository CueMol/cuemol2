// -*-Mode: C++;-*-
//
// Text rendering manager
//

#ifndef GFX_TEXT_RENDER_MANAGER_HPP_
#define GFX_TEXT_RENDER_MANAGER_HPP_

#include "gfx.hpp"

// #include <qlib/MapTable.hpp>
// #include <qlib/LVariant.hpp>
#include <qlib/SingletonBase.hpp>

namespace gfx {

using qlib::LString;
class PixelBuffer;
//typedef const unsigned char *PixelBuffer;

//
//  Text rendering implementation
//
class GFX_API TextRenderImpl
{
public:
  TextRenderImpl() {}
  virtual ~TextRenderImpl() {}

  virtual bool renderText(const LString &str, PixelBuffer &buf) =0;
  virtual bool setupFont(double fontsize, const LString &fontname,
                         const LString &font_style,
                         const LString &font_wgt) =0;
};



//
//  Text rendering manager
//
  class GFX_API TextRenderManager : public qlib::SingletonBase<TextRenderManager>
  {
  private:
    TextRenderImpl *m_pImpl;

  public:
    
    ////////////////////////////////////////////
    //
    
    TextRenderManager() : m_pImpl(NULL) {}
    ~TextRenderManager() {}
    
    void setImpl(TextRenderImpl *p)
    {
      m_pImpl = p;
    }

    TextRenderImpl *getImpl() const
    {
      return m_pImpl;
    }

    
    bool setupFont(double fontsize, const LString &fontname,
                   const LString &font_style,
                   const LString &font_wgt) {
      if (m_pImpl==NULL) return false;
      return m_pImpl->setupFont(fontsize, fontname, font_style, font_wgt);
    }

    bool renderText(const LString &str, PixelBuffer &buf) {
      if (m_pImpl==NULL) return false;
      return m_pImpl->renderText(str, buf);
    }

  private:
    
  public:
    //////////
    // Initializer/finalizer

    static bool init()
    {
      return qlib::SingletonBase<TextRenderManager>::init();
    }
    
    static void fini()
    {
      qlib::SingletonBase<TextRenderManager>::fini();
    }
  };

}

SINGLETON_BASE_DECL(gfx::TextRenderManager);

#endif
