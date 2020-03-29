#pragma once

#include <gfx/TextRenderManager.hpp>
#include <qlib/qlib.hpp>

using qlib::LString;

class QtTextRender : public gfx::TextRenderImpl
{
public:
  QtTextRender();
  
  virtual ~QtTextRender();
  
  virtual bool renderText(const LString &str, gfx::PixelBuffer &buf);
  
  virtual bool setupFont(double fontsize, const LString &fontname,
                         const LString &font_style,
                         const LString &font_wgt);

    virtual void setMouseCursor(int ncursor);
  
  static void init();

  ///////////////////////////////////////////////
  
private:
  
  double m_dFontSize;
  LString m_strFontName;
  
  /// font descr in CSS font property name
  LString m_strCSSFont;
  
    
}; //class QtTextRender2
