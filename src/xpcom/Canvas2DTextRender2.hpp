//
//  Text rendering class impl using HTML5 Canvas 2D
//

#ifndef CANVAS2D_TEXT_RENDER2_HPP_INCLUDED__
#define CANVAS2D_TEXT_RENDER2_HPP_INCLUDED__

#include "xpcom.hpp"

#include <nsIDocShell.h>
#include <nsIDOMHTMLCanvasElement.h>
#include <nsIDOMCanvasRenderingContext2D.h>

#include <qlib/LString.hpp>
#include <gfx/TextRenderManager.hpp>
#include <gfx/PixelBuffer.hpp>

using qlib::LString;

//////////

class Canvas2DTextRender2 : public gfx::TextRenderImpl
{
public:
  Canvas2DTextRender2();

  virtual ~Canvas2DTextRender2();

  virtual bool renderText(const LString &str, gfx::PixelBuffer &buf);

  virtual void setMouseCursor(int ncursor) {}

  ///////////////////////////////////////////////

private:
  
  double m_dFontSize;
  LString m_strFontName;

  /// font descr in CSS font property name
  LString m_strCSSFont;

  LString m_strColor;
  LString m_strOlColor;
  double m_outlSize;

public:
  virtual bool setupFont(double fontsize,
		 const LString &fontname,
                 const LString &font_style,
                 const LString &font_wgt);
  
  /// setup font with color and outline width
  virtual bool setupFont(double fontsize,
			 const LString &fontname,
			 const LString &font_style,
			 const LString &font_wgt,
			 const gfx::ColorPtr &col,
			 double olsize,
			 const gfx::ColorPtr &olcol);
  

}; //class Canvas2DTextRender2

#endif

