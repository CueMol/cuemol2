// -*-Mode: C++;-*-
//
//  WGL dependent molecular viewer implementation
//
//  $Id: WglView.cpp,v 1.29 2011/02/20 09:34:26 rishitani Exp $

#include <common.h>

#ifdef HAVE_GLEW
#define GLEW_STATIC
#include <GL/glew.h>
#include <GL/wglew.h>
// #pragma comment(lib, "glew32.lib")
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

  m_nMultiSamples = 16;  // default: 4xMSAA
  m_bHasMultisample = false;


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

  setupPixelFormat();
  
  // create and enable the render context (RC)
  const int contextAttribs[] = {
    WGL_CONTEXT_MAJOR_VERSION_ARB, 4,
    WGL_CONTEXT_MINOR_VERSION_ARB, 1,  // OpenGL 4.1
    WGL_CONTEXT_PROFILE_MASK_ARB, WGL_CONTEXT_CORE_PROFILE_BIT_ARB,
    WGL_CONTEXT_FLAGS_ARB, WGL_CONTEXT_FORWARD_COMPATIBLE_BIT_ARB,
    0
  };

  m_hGL = wglCreateContextAttribsARB(m_hDC, 0, contextAttribs);
  // m_hGL = ::wglCreateContext( m_hDC );

  if (hOldGL==NULL) {
    setupShareList();
  }
  else {
    ::wglShareLists(hOldGL, m_hGL);
    ::wglMakeCurrent( NULL, NULL );
    ::wglDeleteContext(hOldGL);
  }

  // create display context object for OpenGL
  if (m_pCtxt==NULL) {
    m_pCtxt = MB_NEW WglDisplayContext();
    m_pCtxt->setTargetView(this);
  }

  m_pCtxt->attach(m_hDC, m_hGL);

  m_pCtxt->setCurrent();

  // perform OpenGL-common initialization tasks
  super_t::setup();

#ifdef HAVE_GLEW
  if (m_bHasMultisample && WGL_ARB_multisample) {
    glEnable(GL_MULTISAMPLE_ARB);
    LOG_DPRINTLN("Multisample antialiasing enabled");
  }
#endif

  m_bInitOK = true;
  MB_DPRINTLN("WglView::setup() OK.");

  return true;
}

void WglView::unloading()
{
    super_t::unloading();

  if (m_pCtxt!=NULL) {
    delete m_pCtxt;
    m_pCtxt = NULL;
  }

  ::wglMakeCurrent( NULL, NULL );
  ::wglDeleteContext( m_hGL );
}

////////////////////////////////////////////

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

int WglView::choosePixFmt(bool bStereo)
{
  const int colorBitSizes[] = {32, 24, 16, 0};
  int pixelformat;

  for (int i = 0; colorBitSizes[i] > 0; ++i) {
    auto nColorBits = colorBitSizes[i];
    m_pfd.cColorBits = nColorBits;
    if (bStereo)
      m_pfd.dwFlags |= PFD_STEREO;
    else
      m_pfd.dwFlags &= ~PFD_STEREO;

    pixelformat = ::ChoosePixelFormat(m_hDC, &m_pfd);
    if (pixelformat == 0) {
      continue;
    }

    ::DescribePixelFormat(m_hDC, pixelformat,
                          sizeof(PIXELFORMATDESCRIPTOR), &m_pfd);
    
    // check the selected pixel format
    if (bStereo)
      if (!(m_pfd.dwFlags & PFD_STEREO))
        continue;
    if (nColorBits>m_pfd.cColorBits)
      continue;

    // OK
    return pixelformat;
  }

  MB_DPRINTLN("ChoosePixFmt(stereo:%d) failed", bStereo);
  return 0;
}

#ifdef HAVE_GLEW
// Choose pixel format using wglChoosePixelFormatARB extension function
int WglView::choosePixFmtARB(bool bStereo, int nMultiSamples)
{
  const int colorBitSizes[] = {32, 24, 16, 0};
  float fAttributes[] = {0, 0};
  int pixelFormat = 0;
  UINT numFormats = 0;

  for (int i = 0; colorBitSizes[i] > 0; ++i) {
    auto nColorBits = colorBitSizes[i];
    std::vector<int> attributes;
    // Basic attributes
    attributes.push_back(WGL_DRAW_TO_WINDOW_ARB); attributes.push_back(GL_TRUE);
    attributes.push_back(WGL_SUPPORT_OPENGL_ARB); attributes.push_back(GL_TRUE);
    attributes.push_back(WGL_ACCELERATION_ARB); attributes.push_back(WGL_FULL_ACCELERATION_ARB);
    attributes.push_back(WGL_COLOR_BITS_ARB); attributes.push_back(nColorBits);
    attributes.push_back(WGL_ALPHA_BITS_ARB); attributes.push_back(8);
    attributes.push_back(WGL_DEPTH_BITS_ARB); attributes.push_back(24);
    // attributes.push_back(WGL_STENCIL_BITS_ARB); attributes.push_back(8);
    attributes.push_back(WGL_DOUBLE_BUFFER_ARB); attributes.push_back(GL_TRUE);
    attributes.push_back(WGL_PIXEL_TYPE_ARB); attributes.push_back(WGL_TYPE_RGBA_ARB);
    // HW Stereo
    if (bStereo) {
      attributes.push_back(WGL_STEREO_ARB);
      attributes.push_back(GL_TRUE);
    }
    // MSAA
    if (nMultiSamples > 0 && WGL_ARB_multisample) {
      attributes.push_back(WGL_SAMPLE_BUFFERS_ARB);
      attributes.push_back(GL_TRUE);
      attributes.push_back(WGL_SAMPLES_ARB);
      attributes.push_back(nMultiSamples);
    }
    attributes.push_back(0);
    BOOL result = wglChoosePixelFormatARB(m_hDC, attributes.data(), fAttributes, 
                                          1, &pixelFormat, &numFormats);
  
    MB_DPRINTLN("wglChoosePixelFormatARB result=%d, pixfmt=%d, numfmt=%d", result, pixelFormat, numFormats);
    if (result && numFormats >= 1) {
      LOG_DPRINTLN("wglChoosePixelFormatARB cbit=%d, msaa=%d, stereo=%d OK", nColorBits, nMultiSamples, bStereo);
      return pixelFormat;
    }
  }
  
  return 0;
}
#endif


bool WglView::setPixFmt(int ipx)
{
  if (!::SetPixelFormat(m_hDC, ipx, &m_pfd))
    return false;

  return true;
}

/// Query hardware stereo capability
bool WglView::hasHWStereo() const
{
  //LOG_DPRINTLN("WglView> hasHWStereo: %d", m_bHasQuadBuffer);
  return m_bHasQuadBuffer;
}

////////////////////////////////////////////

bool WglView::setupPixelFormat()
{
  ::memset(&m_pfd, 0, sizeof(PIXELFORMATDESCRIPTOR));
  m_pfd.nSize = sizeof(PIXELFORMATDESCRIPTOR);
  m_pfd.nVersion = 1;
  m_pfd.dwFlags = PFD_DRAW_TO_WINDOW | PFD_SUPPORT_OPENGL | PFD_DOUBLEBUFFER;
  m_pfd.iPixelType = PFD_TYPE_RGBA;
  m_pfd.cColorBits = 24;
  m_pfd.cDepthBits = 32;
  m_pfd.iLayerType = PFD_MAIN_PLANE;
  m_pfd.cRedBits = 8;
  m_pfd.cGreenBits = 8;
  m_pfd.cBlueBits = 8;
  
#ifdef HAVE_GLEW
  if (!WGL_ARB_pixel_format) {
    LOG_DPRINTLN("WglView.PixFmt> Failed to initialize GLEW, falling back to legacy mode");
    return tryLegacyPixelFormat();
  }
  
  if (tryAdvancedPixelFormat()) {
    LOG_DPRINTLN("WglView.PixFmt> Advanced pixel format selected successfully");
    return true;
  }
#endif
  
  LOG_DPRINTLN("WglView.PixFmt> Falling back to legacy pixel format");
  return tryLegacyPixelFormat();
}


// Try pixel format without extension
bool WglView::tryLegacyPixelFormat()
{
  int pixelFormat;
  
  // Stereo mode request
  bool needStereo = (getStereoMode() == qsys::Camera::CSM_HW_QBUF);

  // Check Quad-buffered stereo capability
  m_bHasQuadBuffer = false;
  pixelFormat = choosePixFmt(true);
  if (pixelFormat > 0) {
    LOG_DPRINTLN("WglView.PixFmt> Quadbuffer stereo capable videoboard is detected.");
    m_bHasQuadBuffer = true;
  }
  
  if (m_bHasQuadBuffer && needStereo) {
    setPixFmt(pixelFormat);
    return true;
  }
  
  // Check non-stereo OpenGL pixel format
  pixelFormat = choosePixFmt(false);
  if (pixelFormat > 0) {
    setPixFmt(pixelFormat);
    return true;
  }
  
  LOG_DPRINTLN("WglView.PixFmt> FATAL ERROR, No suitable OpenGL pixel format was found!!");
  return false;
}

#ifdef HAVE_GLEW

bool WglView::initializeGLEW()
{
  // Initialize GLEW
  static bool glewInitialized = false;
  if (!glewInitialized) {
    GLenum err = glewInit();
    if (err != GLEW_OK) {
      LOG_DPRINTLN("GLEW initialization failed: %s", glewGetErrorString(err));
      return false;
    }
    glewInitialized = true;
    LOG_DPRINTLN("GLEW initialized successfully");
  }
  return true;
}

bool WglView::tryMSAAPixelFormat(bool stereo, int& pixelFormat)
{
  const int sampleCounts[] = {16, 8, 4, 2, 0};
  
  for (int i = 0; sampleCounts[i] >= 0; ++i) {
    const auto smpCnt = sampleCounts[i];
    if (smpCnt > m_nMultiSamples) {
      continue;
    }
    
    pixelFormat = choosePixFmtARB(stereo, smpCnt);
    if (pixelFormat > 0) {
      // Check actual num of samples
      int actualSamples = 0;
      int iattrs[] = {WGL_SAMPLES_ARB, 0};
      wglGetPixelFormatAttribivARB(m_hDC, pixelFormat, 0, 1, 
                                   iattrs, &actualSamples);
      
      LOG_DPRINTLN("WglView.PixFmt> MSAA: stereo=%d, samples=%d (requested=%d)", 
                   stereo, actualSamples, smpCnt);
      
      // Update pixel format descriptor
      ::DescribePixelFormat(m_hDC, pixelFormat, sizeof(PIXELFORMATDESCRIPTOR), &m_pfd);
      return true;
    }
  }
  
  return false;
}

bool WglView::tryAdvancedPixelFormat()
{
  int pixelFormat = 0;
  
  // Stereo mode request
  bool needStereo = (getStereoMode() == qsys::Camera::CSM_HW_QBUF);
  
  // Check Quad-buffered stereo capability
  m_bHasMultisample = false;
  if (tryMSAAPixelFormat(true, pixelFormat)) {
    LOG_DPRINTLN("WglView.PixFmt> Quadbuffer stereo capable videoboard is detected.");
    m_bHasQuadBuffer = true;
  }

  if (m_bHasQuadBuffer && needStereo) {
    setPixFmt(pixelFormat);
    return true;
  }
  
  // Check non-stereo OpenGL pixel format
  if (tryMSAAPixelFormat(false, pixelFormat)) {
    setPixFmt(pixelFormat);
    return true;
  }

  LOG_DPRINTLN("WglView.PixFmt> FATAL ERROR, No suitable OpenGL pixel format was found!!");
  return false;
}

#endif
