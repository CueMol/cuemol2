// -*-Mode: C++;-*-
//
// GLESView implementation using iOS API
//

#include <common.h>

#include "IosQmView.hpp"

#import "EAGLView.h"

IosQmView::IosQmView()
{
}

IosQmView::~IosQmView()
{
}

void IosQmView::setup(EAGLView *pView)
{
  m_pEAGLView = pView;
  super_t::setup();

  // set initial view size
  int nWidth = [pView getWidth];
  int nHeight = [pView getHeight];
  setViewSize(nWidth, nHeight);
}

void IosQmView::drawScene()
{
  [m_pEAGLView setFramebuffer];

  int nWidth = [m_pEAGLView getWidth];
  int nHeight = [m_pEAGLView getHeight];
  
  int nOldW = getWidth();
  int nOldH = getHeight();
  if (nWidth!=nOldW || nHeight!=nOldH) {
    double ratio = double(nHeight)/double(nOldH);
    setZoom(ratio*getZoom());
    setViewSize(nWidth, nHeight);
  }

  super_t::drawScene();
  [m_pEAGLView presentFramebuffer];
}

////////////////////////////////////////////

namespace qsys {
  //static
  qsys::View *View::createView()
  {
    qsys::View *pret = MB_NEW IosQmView();
    MB_DPRINTLN("IosQmView created (%p, ID=%d)", pret, (int) pret->getUID());
    return pret;
  }
}
