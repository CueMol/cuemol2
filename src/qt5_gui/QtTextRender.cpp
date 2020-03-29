#define NO_USING_QTYPES
#include <common.h>
#include "QtTextRender.hpp"
#include <gfx/PixelBuffer.hpp>

#include <QFont>
#include <QFontMetrics>
#include <QImage>
#include <QPainter>

QtTextRender::QtTextRender()
{
  m_dFontSize = 12.0;
  m_strFontName = "san-serif";
}
  
QtTextRender::~QtTextRender()
{
}
  
bool QtTextRender::renderText(const LString &str, gfx::PixelBuffer &buf)
{
  //MB_DPRINTLN("QTrenderText: font=%s, size=%f, str=%s", m_strFontName.c_str(), m_dFontSize, str.c_str());

  QFont font;
  font.setFamily(m_strFontName.c_str());
  font.setPixelSize(int(m_dFontSize));

  QFontMetrics fm(font);
  // int w = fm.width(str.c_str());
  int w = fm.horizontalAdvance(str.c_str());
  int h = fm.height();
  if (w%4 != 0)
    w += (4-w%4);

  MB_DPRINTLN("QTrenderText: str=%s, size=(%d,%d)", str.c_str(), w, h);

  int nsize = w*h;
  if (buf.size()<nsize)
    buf.resize(nsize);

  buf.setDepth(8);
  buf.setWidth(w);
  buf.setHeight(h);

  gfx::PixelBuffer buf1;
  buf1.resize(nsize);
  buf1.setDepth(8);
  buf1.setWidth(w);
  buf1.setHeight(h);

  QUE_BYTE *pdata1 = buf1.data();
  int i,j;
  for (i=0; i<nsize; i++)
    pdata1[i] = 0;

  QImage img(pdata1, w, h, QImage::Format_Grayscale8);
  QPainter p(&img);

  p.setRenderHint(QPainter::TextAntialiasing);
  p.setRenderHint(QPainter::Antialiasing);
  // p.setRenderHint(QPainter::HighQualityAntialiasing);

  p.setFont(font);
  p.setPen(Qt::white);
  p.drawText(img.rect(), Qt::AlignCenter, str.c_str());
    
  // Reflect image along with the horizontal direction
  QUE_BYTE *pdata = buf.data();
  for (j=0; j<h; j++) {
    for (i=0; i<w; i++) {
      pdata[j*w+i] = pdata1[((h-1)-j)*w+i];
    }
  }

  // buf.dump();
  return true;
}
  
bool QtTextRender::setupFont(double fontsize, const LString &fontname,
			     const LString &font_style,
			     const LString &font_wgt)
{
  m_dFontSize = fontsize;
  m_strFontName = fontname;

  return true;
}

void QtTextRender::setMouseCursor(int ncursor) {}


//static
void QtTextRender::init()
{
  gfx::TextRenderImpl *pTR = MB_NEW QtTextRender();
  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  pTRM->setImpl(pTR);
}
