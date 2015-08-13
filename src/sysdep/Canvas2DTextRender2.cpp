//
// Text rendering routine using HTML5 Canvas 2D
//

#include <common.h>

#include "Canvas2DTextRender2.hpp"

#include <qlib/Utils.hpp>

#include <qsys/ScrEventManager.hpp>
#include <gfx/TextImgBuf.hpp>

using namespace sysdep;
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
bool Canvas2DTextRender2::setupFont(double fontsize, const LString &fontname,
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

  return true;
}


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


/// Render text to the pixel buffer
bool Canvas2DTextRender2::renderText(const qlib::LString &str, gfx::PixelBuffer &buf)
{
  qsys::ScrEventManager *pSEM = qsys::ScrEventManager::getInstance();

  TextRenderEvent ev;
  ev.m_pAry = gfx::TextImgBufPtr(MB_NEW gfx::TextImgBuf());
  ev.m_pAry->setText(str);
  ev.m_pAry->setFont(m_strCSSFont);

  int height = (int) ceil(m_dFontSize);
  ev.m_pAry->setHeight(height);
  LString category = "renderText";

  pSEM->fireEventScript(category,
                        qsys::ScrEventManager::SEM_EXTND,
                        qsys::ScrEventManager::SEM_OTHER,
                        qlib::invalid_uid, ev);

  // ev.m_pAry->dump();
  // delete ev.m_pAry;
  //buf = *(ev.m_pAry);
  {
    int i, j;
    QUE_BYTE *psrc = ev.m_pAry->data();
    int w = ev.m_pAry->getWidth();
    int h = ev.m_pAry->getHeight();
    int nsize = w*h;
    if (buf.size()<nsize)
      buf.resize(nsize);

    ConstArrayRef source(psrc, boost::extents[h][w][1]);
    ArrayRef dest(buf.data(), boost::extents[h][w][1]);
    for (j=0; j<h; j++) {
      for (i=0; i<w; i++) {
        //MB_DPRINTLN("(x=%d,y=%d,c=%d) = %d", i,j,0,xxx);
        dest[h-j-1][i][0] = source[j][i][0];
      }
    }

    buf.setDepth(8);
    buf.setWidth(w);
    buf.setHeight(h);
  }

  return true;
}  

////////////////////////////////////////////////////////////////////////////////////////

namespace sysdep {
  void *createTextRender()
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
}

