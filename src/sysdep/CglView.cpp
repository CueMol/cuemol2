// -*-Mode: C++;-*-
//
//  CGL dependent molecular viewer implementation
//
//  $Id: CglView.cpp,v 1.3 2010/09/05 14:29:20 rishitani Exp $

#include <common.h>

#include <OpenGL/OpenGL.h>
#include <OpenGL/gl.h>
#include <OpenGL/glu.h>

#include "CglView.hpp"
#include "CglDisplayContext.hpp"

#include <qlib/Utils.hpp>

// #include "UpdateEvent.hpp"
// #define HITBUF_SIZE (64*1024)

using qsys::InDevEvent;
using namespace sysdep;

CglView::CglView()
{
  m_bInitOK = false;
  m_pCtxt = NULL;
}

CglView::~CglView()
{
  MB_DPRINTLN("CglView (ctxt=%p) destructing.", m_pCtxt);
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
}

LString CglView::toString() const
{
  return LString::format("CGL/OpenGL View(%p)", this);
}

void CglView::unloading()
{
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
  m_pCtxt = NULL;
}

bool CglView::attach(void *pnsctxt, CGLContextObj ctx)
{
  if (m_pCtxt!=NULL) {
    LOG_DPRINTLN("ERROR!! CglView::attach(%p): already initialized with (%p)",
		 ctx, m_pCtxt);
    return false;
  }

  // CglDisplayContext *pCtxt = MB_NEW CglDisplayContext(getSceneID(), this);
  CglDisplayContext *pCtxt = MB_NEW CglDisplayContext();
  pCtxt->setTargetView(this);
  if (!pCtxt->attach(pnsctxt, ctx)) {
    delete pCtxt;
    return false;
  }

  // OK
  m_pCtxt = pCtxt;

  OglView::setup();

  m_bInitOK = true;
  MB_DPRINTLN("CglView::attach() OK.");

  return true;
}

void CglView::swapBuffers()
{
  CGLFlushDrawable( m_pCtxt->getCGLContext() );

  // MB_DPRINTLN("SwapBuffers");
}

DisplayContext *CglView::getDisplayContext()
{
  return m_pCtxt;
}

////////////////////////////////////////////

// namespace qsys {
//   //static
//   SYSDEP_API qsys::View *View::createView()
//   {
//     qsys::View *pret = MB_NEW CglView();
//     MB_DPRINTLN("CglView created (%p, ID=%d)", pret, pret->getUID());
//     return pret;
//   }
// }
