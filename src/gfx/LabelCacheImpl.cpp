// -*-Mode: C++;-*-
//
// Label/Pixel buffer cache implementation
//

#include <common.h>

#include "LabelCacheImpl.hpp"
#include "DisplayContext.hpp"

using namespace gfx;

void LabelCacheImpl::draw(DisplayContext *pdc)
{
  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  if (pTRM==NULL)
    return;

  double scl = pdc->getPixSclFac();
  pTRM->setupFont(m_dFontSize * scl, m_strFontName, m_strFontStyle, m_strFontWgt);

  bool bUseCache = false;
  if (m_dScaleFac<0.0) {
    bUseCache = true;
    m_dScaleFac = scl;
  }
  else if (qlib::isNear4(scl, m_dScaleFac)) {
    //MB_DPRINTLN("LabelCache> cache scl(%f) = draw scl (%f) --> use cache", m_dScaleFac, scl);
    bUseCache = true;
  }
  else {
    MB_DPRINTLN("LabelCache> cache scl(%f) != draw scl (%f) --> not use cache", m_dScaleFac, scl);
  }
  
  PixBufCache::iterator iter = m_data.begin();
  PixBufCache::iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    const Vector4D &pos = iter->pos;

    if (!bUseCache) {
      MB_DPRINTLN("LabelCache> Not use cache <%s>.", iter->str.c_str());
      gfx::PixelBuffer *pixbuf = MB_NEW gfx::PixelBuffer();
      if (!pTRM->renderText(iter->str, *pixbuf))
        return;
      pdc->drawPixels(pos, *pixbuf, ColorPtr());
      delete pixbuf;
    }
    else {
      gfx::PixelBuffer *pixbuf = iter->pPixBuf;
      if (pixbuf==NULL) {
        pixbuf = MB_NEW gfx::PixelBuffer();
        MB_DPRINTLN("LabelCache> new pixbuf for <%s> created.", iter->str.c_str());
        if (!pTRM->renderText(iter->str, *pixbuf))
          return;
        iter->pPixBuf = pixbuf;
      }
      pdc->drawPixels(pos, *pixbuf, ColorPtr());
    }
  }
}

void LabelCacheImpl::render(double scl)
{
  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  if (pTRM==NULL)
    return;

  // double scl = 1.0; //pdc->getPixSclFac();
  pTRM->setupFont(m_dFontSize * scl, m_strFontName, m_strFontStyle, m_strFontWgt);

  PixBufCache::iterator iter = m_data.begin();
  PixBufCache::iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    const Vector4D &pos = iter->pos;
    gfx::PixelBuffer *pixbuf = iter->pPixBuf;
    if (pixbuf==NULL) {
      MB_DPRINTLN("LabelCache> new pixbuf for <%s> created.", iter->str.c_str());
      pixbuf = MB_NEW gfx::PixelBuffer();
      if (!pTRM->renderText(iter->str, *pixbuf))
        return;
      iter->pPixBuf = pixbuf;
    }
  }
}

void LabelCacheImpl::invalidateAll()
{
  PixBufCache::iterator iter = m_data.begin();
  PixBufCache::iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    if (iter->pPixBuf!=NULL)
      delete iter->pPixBuf;
  }
  m_data.clear();
}

int LabelCacheImpl::addString(const Vector4D &pos, const LString &str)
{
  int rid = m_nNextID;
  m_data.push_back(PixCacheElem(m_nNextID, pos, str));
  ++m_nNextID;
  return rid;
}


bool LabelCacheImpl::remove(int id)
{
  PixBufCache::iterator iter = m_data.begin();
  PixBufCache::iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    if (iter->m_nID==id) {
      m_data.erase(iter);
      return true;
    }
  }

  return false;
}

void LabelCacheImpl::setFont(double fs, const LString &fn, const LString &fsty, const LString &fw)
{
  m_dFontSize = fs;
  m_strFontName = fn;
  m_strFontStyle = fsty;
  m_strFontWgt = fw;
}

