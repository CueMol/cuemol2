//
// Dummy text rendering routine
//
// $Id: NullTextRender.cpp,v 1.1 2009/08/08 18:31:59 rishitani Exp $
//

#include <common.h>

#include "XPCCueMol.hpp"
#include "XPCObjWrapper.hpp"

#include <boost/multi_array.hpp>
#include <boost/shared_ptr.hpp>

#include <gfx/TextRenderManager.hpp>

class NullTextRender : public gfx::TextRenderImpl
{
private:
public:
  NullTextRender() {
  }
  virtual ~NullTextRender() {
  }

  virtual bool renderText(const qlib::LString &str, gfx::PixelBuffer &buf,
                          int &width, int &height) {
    return false;
  }

};

using namespace xpcom;

bool XPCCueMol::initTextRender()
{
  NullTextRender *pTTR = new NullTextRender;
  gfx::TextRenderManager *pTRM = gfx::TextRenderManager::getInstance();
  pTRM->setImpl(pTTR);
  //pTTR->setupFont();

  m_pTR = pTTR;
  return true;
}

void XPCCueMol::finiTextRender()
{
  NullTextRender *pTTR = static_cast<NullTextRender *>(m_pTR);
  delete pTTR;
}

