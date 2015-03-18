//
// Text rendering routine using HTML5 Canvas 2D
//

#include <common.h>

#include "Canvas2DTextRender2.hpp"

#include <boost/multi_array.hpp>
#include <boost/shared_ptr.hpp>

#include <qlib/Utils.hpp>

#include <qsys/ScrEventManager.hpp>
#include <gfx/TextImgBuf.hpp>
#include <gfx/AbstractColor.hpp>

using qlib::LString;

//////////////////////////////

Canvas2DTextRender2::Canvas2DTextRender2()
{
  m_dFontSize = 0.0;
}

Canvas2DTextRender2::~Canvas2DTextRender2()
{
}

//////////////////////////////

typedef boost::const_multi_array_ref<QUE_BYTE, 3> ConstArrayRef;
typedef boost::multi_array_ref<QUE_BYTE, 3> ArrayRef;

// make HTML5 CSS font name string
bool Canvas2DTextRender2::setupFont(double fontsize,
				    const LString &fontname,
                                    const LString &font_style,
                                    const LString &font_wgt)
{
  LString cssfont;

  // Font style
  if (font_style.equalsIgnoreCase("italic")) {
    cssfont += "italic ";
  }
  else if (font_style.equalsIgnoreCase("oblique")) {
    cssfont += "oblique ";
  }
  //else if (font_style.equalsIgnoreCase("normal"))
  // normal may be default

  // Font weight
  if (font_wgt.equalsIgnoreCase("bold")) {
    cssfont += "bold ";
  }
  //if (font_wgt.equalsIgnoreCase("normal")) {
  // default is normal

  // Font size (always in pixel)
  cssfont += LString::format("%dpx ", int(fontsize));
  cssfont += fontname;

  m_dFontSize = fontsize;
  m_strFontName = fontname;
  m_strCSSFont = cssfont;

  m_outlSize = -1.0;
  m_strColor = LString();
  m_strOlColor = LString();

  return true;
}

// make HTML5 CSS font name string
bool Canvas2DTextRender2::setupFont(double fontsize,
				    const LString &fontname,
                                    const LString &font_style,
                                    const LString &font_wgt,
				    const gfx::ColorPtr &col,
				    double olsize,
				    const gfx::ColorPtr &olcol)
{
  setupFont(fontsize, fontname, font_style, font_wgt);

  ensureNotNull(col);
  ensureNotNull(olcol);
  quint32 cc = col->getCode();
  m_strColor = LString::format("#%02X%02X%02X",
			       gfx::getRCode(cc),
			       gfx::getGCode(cc),
			       gfx::getBCode(cc));
  cc = olcol->getCode();
  m_strOlColor = LString::format("#%02X%02X%02X",
			       gfx::getRCode(cc),
			       gfx::getGCode(cc),
			       gfx::getBCode(cc));
  m_outlSize = olsize;

  return true;
}

///////////////////////////////////////////////////

namespace {
  class TextRenderEvent : public qlib::LEvent
  {
  public:
    gfx::TextImgBufPtr m_pAry;
    
    virtual ~TextRenderEvent()
  {
  }
    
    virtual LCloneableObject *clone() const {
      return MB_NEW TextRenderEvent(*this);
    }
    
    virtual qlib::LScriptable *getScrObject() const {
      return m_pAry.copy();
    }
  };
}

/// Render text to the pixel buffer
bool Canvas2DTextRender2::renderText(const qlib::LString &str, gfx::PixelBuffer &buf)
{
  qsys::ScrEventManager *pSEM = qsys::ScrEventManager::getInstance();

  TextRenderEvent ev;

  ev.m_pAry = gfx::TextImgBufPtr(MB_NEW gfx::TextImgBuf());
  ev.m_pAry->setText(str);
  ev.m_pAry->setFont(m_strCSSFont);

  if (m_outlSize<0.0) {
    ev.m_pAry->setDepth(8);
    ev.m_pAry->setMode(gfx::TextImgBuf::TIB_SIMPLE);
  }
  else {
    ev.m_pAry->setDepth(32);
    ev.m_pAry->setMode(gfx::TextImgBuf::TIB_OUTLINE);
    ev.m_pAry->setOlSize(m_outlSize);
    ev.m_pAry->setColor(m_strColor);
    ev.m_pAry->setOlColor(m_strOlColor);
  }

  int height = (int) ceil(m_dFontSize);
  ev.m_pAry->setHeight(height);

  LString category = "renderText";

  pSEM->fireEventScript(category,
                        qsys::ScrEventManager::SEM_EXTND,
                        qsys::ScrEventManager::SEM_OTHER,
                        qlib::invalid_uid, ev);

  // ev.m_pAry->dump();
  // buf = *(ev.m_pAry);
  // delete ev.m_pAry;

  int i, j, k;
  QUE_BYTE *psrc = ev.m_pAry->data();
  int w = ev.m_pAry->getWidth();
  int h = ev.m_pAry->getHeight();
  int ndep = ev.m_pAry->getDepth()/8;
  int nsize = w*h*ndep;
  if (buf.size()<nsize)
    buf.resize(nsize);
  
  // copy and invert the image along the Y-axis direction
  ConstArrayRef source(psrc, boost::extents[h][w][ndep]);
  ArrayRef dest(buf.data(), boost::extents[h][w][ndep]);
  for (j=0; j<h; j++) {
    for (i=0; i<w; i++) {
      for (k=0; k<ndep; k++) {
	//MB_DPRINTLN("(x=%d,y=%d,c=%d) = %d", i,j,k,source[j][i][k]);
	dest[h-j-1][i][k] = source[j][i][k];
      }
    }
  }
  
  buf.setDepth(ndep*8);
  buf.setWidth(w);
  buf.setHeight(h);

  return true;
}  

////////////////////////////////////////////////////////////////////////////////////////

gfx::TextRenderImpl *createTextRender()
{
  Canvas2DTextRender2 *pTTR = new Canvas2DTextRender2;
  pTTR->setupFont(12.0, "sans-serif", "normal", "normal");
  //pTTR->setupFont(20.0, "Times New Roman", FONT_STYLE_NORMAL, FONT_WEIGHT_NORMAL);

  return pTTR;
}

void destroyTextRender(void *pTR)
{
  Canvas2DTextRender2 *pTTR = static_cast<Canvas2DTextRender2 *>(pTR);
  delete pTTR;
}

