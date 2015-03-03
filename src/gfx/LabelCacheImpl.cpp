// -*-Mode: C++;-*-
//
// Label/Pixel buffer cache implementation
//

#include <common.h>

#include "LabelCacheImpl.hpp"
#include "DisplayContext.hpp"

using namespace gfx;

void LabelCacheImpl::draw(DisplayContext *pdc, bool bUseCache /*=true*/)
{
  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  if (pTRM==NULL)
    return;

  double scl = pdc->getPixSclFac();
  pTRM->setupFont(m_dFontSize * scl, m_strFontName, m_strFontStyle, m_strFontWgt);

  PixBufCache::iterator iter = m_data.begin();
  PixBufCache::iterator eiter = m_data.end();
  for (; iter!=eiter; ++iter) {
    const Vector4D &pos = iter->pos;

    if (!bUseCache) {
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
      pixbuf = MB_NEW gfx::PixelBuffer();
      if (!pTRM->renderText(iter->str, *pixbuf))
        return;
      iter->pPixBuf = pixbuf;
    }
  }
}

void LabelCacheImpl::invalidate()
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

