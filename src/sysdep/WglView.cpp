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
#include <GL/wglew.h>
#pragma comment(lib, "glew32.lib")
#endif

#include <GL/gl.h>
#include <GL/glu.h>
#include <qlib/Utils.hpp>

#include "WglView.hpp"
#include "WglDisplayContext.hpp"

// #include "UpdateEvent.hpp"

// #define HITBUF_SIZE (64*1024)
using qsys::InDevEvent;

using namespace sysdep;

WglView::WglView()
{
  m_bCursorIn = false;
  // m_pHitBuf = MB_NEW GLuint[HITBUF_SIZE];
  m_bInitOK = false;

  m_pCtxt = NULL;

  m_hDC = NULL;
  m_hGL = NULL;
  m_hWnd = NULL;

  m_nDragStart = DRAG_NONE;

  m_bHasQuadBuffer = false;
/*
  m_hStdCursor = ::LoadCursor(NULL, IDC_ARROW);
  m_hWaitCursor = ::LoadCursor(NULL, IDC_WAIT);
  m_hHandCursor = ::LoadCursor(NULL, IDC_SIZEALL);
  m_hCrossCursor = ::LoadCursor(NULL, IDC_CROSS);
 */
}

WglView::~WglView()
{
  MB_DPRINTLN("WglView (ctxt=%p) destructing.", m_pCtxt);
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
  return m_pCtxt;
}

////////////////////////////////////////////

bool WglView::attach(HWND hWnd, HDC hDC)
{
  MB_ASSERT(hDC != NULL);
  MB_ASSERT(hWnd != NULL);

  // Save the old WND/DC
  HWND hOldWnd = NULL;
  HDC hOldDC = NULL;
  HGLRC hOldGL = NULL;
  if (m_hWnd!=NULL) {
    hOldWnd = m_hWnd;
    hOldDC = m_hDC;
    hOldGL = m_hGL;
  }

  m_hWnd = hWnd;
  m_hDC = hDC;

  MB_DPRINTLN("HWND==%p", m_hWnd);
  MB_DPRINTLN("HDC==%p", m_hDC);

  m_hGL = setupWglContext();

  if (hOldGL==NULL)
    setupShareList();
  else {
    ::wglShareLists(hOldGL, m_hGL);
    ::wglMakeCurrent( NULL, NULL );
    ::wglDeleteContext(hOldGL);
  }

  // create display context object for OpenGL
  if (m_pCtxt==NULL)
    m_pCtxt = MB_NEW WglDisplayContext(getSceneID(), this);

  if (!m_pCtxt->attach(m_hDC, m_hGL)) {
    // NOTE: This cannot be happen!!
    //LOG_DPRINTLN("Fatal error Cannot create WglDisplayContext!!");
    //delete pCtxt;
    return false;
  }

  m_pCtxt->setCurrent();

  // perform OpenGL-common initialization tasks
  OglView::setup();

  if (WGLEW_EXT_swap_control) {
    int res = wglSwapIntervalEXT(0);
    LOG_DPRINTLN("WglView> wglSwapIntervalEXT(0): %d", res);
  }
  
  m_bInitOK = true;
  MB_DPRINTLN("WglView::setup() OK.");

  return true;
}

void WglView::unloading()
{
  /*if (m_hDC!=NULL && m_hWnd!=NULL) {
    // HDC will be destroyed at delete m_pDspCtxt!!
    ::ReleaseDC(m_hWnd, m_hDC);
    m_hDC = NULL;
  }*/
  
  if (m_pCtxt!=NULL) {
    delete m_pCtxt;
    m_pCtxt = NULL;
  }

  ::wglMakeCurrent( NULL, NULL );
  ::wglDeleteContext( m_hGL );
}

////////////////////////////////////////////

/// Setup OpenGL (stage 1)
HGLRC WglView::setupWglContext()
{
  setupPixelFormat();
  
  // create and enable the render context (RC)
  return ::wglCreateContext( m_hDC );
}

/// Setup OpenGL (stage 2)
bool WglView::setupShareList()
{
  DisplayContext *pShare = getSiblingCtxt();
  WglDisplayContext *pwshcx = dynamic_cast<WglDisplayContext *>(pShare);
  if (pwshcx==NULL) {
    MB_DPRINTLN("WGL> No sibling context.");
    return true;
  }
  HGLRC shcx = pwshcx->getHGLRC();
  ::wglShareLists(shcx, m_hGL);
  return true;
}

bool WglView::setupPixelFormat()
{
  int ipx;
  /*
  int ipx = ::GetPixelFormat(m_hDC);
  if (ipx>0) {
    ::DescribePixelFormat(m_hDC, ipx,
                          sizeof(PIXELFORMATDESCRIPTOR), &m_pfd);
    return true;
  }
   */

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
      LOG_DPRINTLN("WglView.PixFmt> cbits=%d (hardware stereo) is accepted.", bufsz[i]);
      m_bHasQuadBuffer = true;
      break;
    }
  }

  if (m_bHasQuadBuffer) {
    LOG_DPRINTLN("WglView.PixFmt> Quadbuffer stereo capable videoboard is detected.");
    if (getStereoMode()==qsys::Camera::CSM_HW_QBUF) {
      setPixFmt(ipx);
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
      LOG_DPRINTLN("WglView.PixFmt> cbits=%d (no stereo) is accepted.", bufsz[i]);
      setPixFmt(ipx);
      return true;
    }
  }

  LOG_DPRINTLN("WglView.PixFmt> FATAL ERROR, No suitable OpenGL pixel format was found!!");
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
