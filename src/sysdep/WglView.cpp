// -*-Mode: C++;-*-
//
//  WGL dependent molecular viewer implementation
//
//  $Id: WglView.cpp,v 1.29 2011/02/20 09:34:26 rishitani Exp $

#include <common.h>

#ifdef WIN32
#  include <windows.h>
#endif

#ifdef HAVE_GLEW
#include <GL/glew.h>
#pragma comment(lib, "glew32.lib")
#endif

#include <GL/gl.h>
#include <GL/glu.h>
#include <qlib/Utils.hpp>

#include "WglView.hpp"
#include "WglDisplayContext.hpp"
#include "AutoDispCtxt.hpp"

// #include "UpdateEvent.hpp"

// #define HITBUF_SIZE (64*1024)
using qsys::InDevEvent;

using namespace sysdep;

WglDisplayContext *WglView::m_pCtxt = NULL;
int WglView::m_nCtxtRefs = 0;


WglView::WglView()
{
  m_bCursorIn = false;
  m_bInitOK = false;

  m_hDC = NULL;
  m_hWnd = NULL;

  m_nDragStart = DRAG_NONE;

  m_bHasQuadBuffer = false;
}

WglView::~WglView()
{
  MB_DPRINTLN("WglView (ctxt=%p) destructed.", m_pCtxt);

  --m_nCtxtRefs;
  MB_DPRINTLN("WglView> dtor() ctxt ref=%d", m_nCtxtRefs);

  if (m_nCtxtRefs==0) {
    MB_DPRINTLN("WglView> destructing ctxt");
    if (m_pCtxt!=NULL) {
      HGLRC h = m_pCtxt->getHGLRC();
      delete m_pCtxt;
      
      wglMakeCurrent(NULL, NULL);
      if (wglDeleteContext(h))
        MB_DPRINTLN("WglDisplayContext> delete ctxt %p OK", h);
      else
        MB_DPRINTLN("WglDisplayContext> delete ctxt %p failed", h);
    }
    m_pCtxt = NULL;
  }
}

LString WglView::toString() const
{
  return LString::format("WGL/OpenGL View(%p)", this);
}

void WglView::swapBuffers()
{
  if (m_hDC!=NULL)
    ::SwapBuffers(m_hDC);
}

DisplayContext *WglView::getDisplayContext()
{
  //m_pCtxt->setTargetView(this);
  //m_pCtxt->setCurrent();
  return m_pCtxt;
}

////////////////////////////////////////////

bool WglView::attach(HWND hWnd, HDC hDC)
{
  MB_ASSERT(hDC != NULL);
  MB_ASSERT(hWnd != NULL);

  HGLRC hOldGL = NULL;
  if (m_hWnd!=NULL) {
    // Current HWND is not NULL: reload() case
    // TO DO: ???
  }

  m_hWnd = hWnd;
  m_hDC = hDC;

  MB_DPRINTLN("HWND==%p", m_hWnd);
  MB_DPRINTLN("HDC==%p", m_hDC);

  // Apply pixel format to this window's HDC
  setupPixelFormat();

  if (m_pCtxt==NULL) {
    // Display context has not been created (startup case)
    HGLRC hGL = ::wglCreateContext( m_hDC );
    m_pCtxt = MB_NEW WglDisplayContext(getSceneID());
    m_pCtxt->setHGLRC(hGL);
  }
  ++m_nCtxtRefs;
  MB_DPRINTLN("WglView> attach() ctxt ref=%d", m_nCtxtRefs);
  
  // m_pCtxt->setTargetView(this);
  // m_pCtxt->setCurrent();
  AutoDispCtxt adc(this);

  // perform OpenGL-common initialization tasks
  OglView::setup();

  m_bInitOK = true;
  MB_DPRINTLN("WglView::setup() OK.");

  return true;
}

void WglView::unloading()
{
  MB_DPRINTLN("WglView> unloading() called.");

/*
  if (m_pCtxt!=NULL)
    delete m_pCtxt;
  m_pCtxt = NULL;
 */
}

////////////////////////////////////////////

bool WglView::setupPixelFormat()
{
  int ipx;

  ::memset(&m_pfd, 0, sizeof(PIXELFORMATDESCRIPTOR));
  m_pfd.nSize = (sizeof(PIXELFORMATDESCRIPTOR));
  m_pfd.nVersion = 1;

  m_pfd.dwFlags =
    PFD_DRAW_TO_WINDOW | // support window
      PFD_SUPPORT_OPENGL |          // support OpenGL
        PFD_DOUBLEBUFFER;           // double buffered
  m_pfd.iPixelType = PFD_TYPE_RGBA; // RGBA type
  m_pfd.cColorBits = 24; // 24-bit color depth
  m_pfd.cDepthBits = 32;
  m_pfd.iLayerType = PFD_MAIN_PLANE; // main layer
  
  m_pfd.cRedBits = 8;
  m_pfd.cGreenBits = 8;
  m_pfd.cBlueBits = 8;

  // valid color bit size
  int bufsz[] = {32, 24, 16, 0};
  int i;

  // Check Quad-buffered stereo capability
  m_bHasQuadBuffer = false;
  for (i=0; bufsz[i]>0; ++i) {
    ipx = choosePixFmt(bufsz[i], true);
    if (ipx>0) {
      // LOG_DPRINTLN("WglView> Hardware quadbuf stereo cap is found.");
      LOG_DPRINTLN("WglView> Quadbuffer stereo capable videoboard is detected.");
      m_bHasQuadBuffer = true;
      break;
    }
  }

  if (m_bHasQuadBuffer) {
    if (getStereoMode()==qsys::Camera::CSM_HW_QBUF) {
      setPixFmt(ipx);
      LOG_DPRINTLN("WglView> pixel format cbits=%d (HW stereo) is applied to HDC %p.",
                   bufsz[i], m_hDC);
      return true; // ==> Use the found quadbuffer stereo pixel format
    }
  }
  else {
    MB_DPRINTLN("Cannot use quad-buffered stereo in this environment.");
  }
  
  // Check non-stereo OpenGL pixel format
  for (i=0; bufsz[i]>0; ++i) {
    ipx = choosePixFmt(bufsz[i], false);
    if (ipx>0) {
      setPixFmt(ipx);
      LOG_DPRINTLN("WglView> pixel format cbits=%d (no stereo) is applied to HDC %p.",
                   bufsz[i], m_hDC);
      return true;
    }
  }

  LOG_DPRINTLN("WglView> FATAL ERROR, No suitable OpenGL pixel format was found!!");
  return false;
}

int WglView::choosePixFmt(int nColorBits, bool bStereo)
{
  int pixelformat;
  m_pfd.cColorBits = nColorBits;

  if (bStereo)
    m_pfd.dwFlags |= PFD_STEREO;
  else
    m_pfd.dwFlags &= ~PFD_STEREO;

  if ( (pixelformat = ::ChoosePixelFormat(m_hDC, &m_pfd)) == 0 ) {
    MB_DPRINTLN("ChoosePixFmt(cbit:%d, stereo:%d) failed", nColorBits, bStereo);
    return 0;
  }

  ::DescribePixelFormat(m_hDC, pixelformat,
                        sizeof(PIXELFORMATDESCRIPTOR), &m_pfd);
    
  // check the selected pixel format
  if (bStereo)
    if (!(m_pfd.dwFlags & PFD_STEREO))
      return 0;

  if (nColorBits>m_pfd.cColorBits)
    return 0;

  return pixelformat;
}

bool WglView::setPixFmt(int ipx)
{
  if (!::SetPixelFormat(m_hDC, ipx, &m_pfd))
    return false;

  return true;
}

/////////////////////////////////////////////////////////////////////////////

/// Query hardware stereo capability
bool WglView::hasHWStereo() const
{
  //LOG_DPRINTLN("WglView> hasHWStereo: %d", m_bHasQuadBuffer);
  return m_bHasQuadBuffer;
}

////////////////////////////////////////////

namespace qsys {
  //static
  qsys::View *View::createView()
  {
    qsys::View *pret = MB_NEW WglView();
    MB_DPRINTLN("WglView created (%p, ID=%d)", pret, pret->getUID());
    return pret;
//    return NULL;
  }
}
