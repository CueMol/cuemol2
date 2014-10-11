//
// CueMol2 plugin class with MacOSX implementation
//
// $Id: OSXPlugin.cpp,v 1.7 2009/08/13 08:46:06 rishitani Exp $

#include <common.h>
#include "npcommon.h"

#include <AGL/agl.h>
#include <OpenGL/gl.h>
#include <OpenGL/glu.h>

#include <qsys/sysdep/AglView.hpp>
#include <qsys/sysdep/AglDisplayContext.hpp>
#include "OSXPlugin.hpp"

#include <qsys/SceneManager.hpp>

using namespace np;
using gfx::DisplayContext;
using sysdep::AglDisplayContext;

//static char* s_AltText;
//extern short gResFile;

OSXPlugin::OSXPlugin(NPP pNPInstance) :
  Plugin(pNPInstance)
{
  // m_pDisplay(NULL), m_xwin(0), m_xtwgt(NULL)
  m_pCachedView=NULL;

  m_ctx = NULL;
  fSaveClip = NewRgn();

}

OSXPlugin::~OSXPlugin()
{
  if (fSaveClip)
    DisposeRgn(fSaveClip);
}

// if error dump agl errors to debugger string, return error                                                  
static GLenum aglDebugStr()
{
  GLenum err = aglGetError();
  if (AGL_NO_ERROR != err)
    MB_DPRINTLN("AGL ERROR: %s", (char *)aglErrorString(err));
  return err;
}

static GLenum glDebugStr()
{
  GLenum err = glGetError();
  if (GL_NO_ERROR != err)
    MB_DPRINTLN("GL ERROR: %s", (char *) gluErrorString(err));
  return err;
}


bool OSXPlugin::setupOpenGL(sysdep::AglView *pView)
{
  // Find an appropriate visual
  GLint dblBuf[] = {AGL_RGBA,
		  AGL_DOUBLEBUFFER,
		  AGL_DEPTH_SIZE, 24,
		  AGL_NONE };
  /*
  int quaBuf[] = {GLX_USE_GL,
		  GLX_RGBA,
		  GLX_DOUBLEBUFFER,
		  GLX_STEREO,
		  GLX_DEPTH_SIZE, 16,
		  None};
  */

  AGLPixelFormat fmt;
  short fNum;

  CGrafPtr ourPort = getGrafPort();

  if ((Ptr) kUnresolvedCFragSymbolAddress ==
      (Ptr) aglChoosePixelFormat) {
    LOG_DPRINTLN("OpenGL not installed");
    return false;
  }

  fmt = aglChoosePixelFormat(NULL, 0, dblBuf);
  aglDebugStr();
  if (NULL == fmt) {
    LOG_DPRINTLN("Could not find valid pixel format");
    return false;
  }

  AGLContext ctx_share=NULL;
  if (pView!=NULL) {
    DisplayContext *pShare = pView->getSiblingCtxt();
    if (pShare!=NULL) {
      AglDisplayContext *pwshcx = dynamic_cast<AglDisplayContext *>(pShare);
      if (pwshcx!=NULL) {
	ctx_share = pwshcx->getAGLContext();
      }
    }
  }

  m_ctx = aglCreateContext(fmt, ctx_share);
  aglDebugStr();
  if (NULL == m_ctx) {
    LOG_DPRINTLN("Could not create context");
    return false;
  }

  if (!aglSetDrawable(m_ctx, ourPort)){
    aglDebugStr();
    LOG_DPRINTLN("aglSetDrawable failed");
    return false;
  }

  /*
  if (!aglSetCurrentContext(m_ctx)) {
    aglDebugStr();
    aglSetDrawable(m_ctx, NULL);
    return false;
  }
  */

  aglDestroyPixelFormat(fmt);

  MB_DPRINTLN("OSX_np> AGL Setup OK.");
  return true;
}

void OSXPlugin::setupAglViewport()
{
  if (m_pCachedView==NULL) return;

  MB_DPRINTLN("setupAglViewport (x,y)=(%d,%d)",m_pWindow->x, m_pWindow->y);
  MB_DPRINTLN("                 (w,h)=(%d,%d)",m_pWindow->width, m_pWindow->height);
  MB_DPRINTLN("                 (l,t,r,b)=(%d,%d,%d,%d)",
	      m_pWindow->clipRect.left,
	      m_pWindow->clipRect.top,
	      m_pWindow->clipRect.right,
	      m_pWindow->clipRect.bottom);

  int view_w = m_pWindow->clipRect.right-m_pWindow->clipRect.left;
  int view_h = m_pWindow->clipRect.bottom-m_pWindow->clipRect.top;

  int cont_height;
  AglDisplayContext *pCtxt = (AglDisplayContext *) m_pCachedView->getDisplayContext();
  AGLContext ctx = pCtxt->getAGLContext();

  GrafPtr ourPort = getGrafPort();
  WindowPtr w = GetWindowFromPort(ourPort);
  Rect drt;
  GetWindowBounds(w, kWindowContentRgn, &drt);
  cont_height = drt.bottom-drt.top;
  //MB_DPRINTLN("w.cont.top %d, w.cont.bottom %d",drt.top,drt.bottom);

  GLint bufferRect[4];
  bufferRect[0] = m_pWindow->x;
  //bufferRect[1] = (bounds.bottom - bounds.top) - (m_pWindow->y + m_pWindow->height);
  bufferRect[1] = cont_height - (m_pWindow->y + m_pWindow->height);
  bufferRect[2] = view_w;
  bufferRect[3] = view_h;
  aglSetInteger(ctx, AGL_BUFFER_RECT, bufferRect);
  aglEnable(ctx, AGL_BUFFER_RECT);

  aglSetDrawable(m_ctx, ourPort);
  aglUpdateContext(ctx);

  m_pCachedView->setViewPos(m_pWindow->x, m_pWindow->y);
}


#if 0
  //NP_Port *pport = (NP_Port *) m_pWindow->window;
  if (!FocusDraw()) {
    MB_DPRINTLN("FocusDraw failed.");
  }

  // Setup GLX
  if (!setupOpenGL())
    return false;

  RestoreDraw();

#endif

void OSXPlugin::cleanupOpenGL()
{
  if (m_ctx==NULL) return;
  aglSetCurrentContext(m_ctx);
  aglSetDrawable(m_ctx, NULL);
  aglSetCurrentContext(NULL);
  aglDestroyContext(m_ctx);
  aglDebugStr (); // check for errors
  m_ctx = NULL;
}

bool OSXPlugin::init(NPWindow* pNPWindow)
{
  if (!Plugin::init(pNPWindow))
    return false;

  if (m_pCachedView==NULL) {
    bindImpl();
  }

  //MB_DPRINTLN("######## height: %p", pNPWindow->height);
  //MB_DPRINTLN("######## width: %p", pNPWindow->width);
  //if (m_pCachedView!=NULL)
  //m_pCachedView->sizeChanged(pNPWindow->width, pNPWindow->height);

  return true;
}

void OSXPlugin::fini()
{
  // This destroys the related views (refering m_ctx)
  Plugin::fini();
  cleanupOpenGL();
}

int OSXPlugin::handleEvent(void *event)
{
  //MB_DPRINTLN("######## what: %d", ((EventRecord *)event) ->what);
  //MB_DPRINTLN("######## height: %d", m_pWindow->height);
  //MB_DPRINTLN("######## width: %d", m_pWindow->width);

  if (m_pCachedView) {
    EventRecord *pEv = (EventRecord *)event;
    if (pEv->what==updateEvt) {
      setupAglViewport();
    }
    //else if (pEv->what==mouseDown) {
    //*((int *)0) = 1;
    //}
    return m_pCachedView->handleEvent(pEv, m_pWindow->width, m_pWindow->height);
  }
  return FALSE;

}

void OSXPlugin::windowResized(NPWindow* pNPWindow)
{
  m_pWindow = pNPWindow;

  if (m_pCachedView!=NULL) {
    setupAglViewport();
    m_pCachedView->sizeChanged(pNPWindow->width, pNPWindow->height);
  }
}

bool OSXPlugin::bind(int nSceneID, int nViewID)
{
  if (!Plugin::bindCommon(nSceneID, nViewID))
    return false;

  if (!isInitialized()) {
    // bind later
    return true;
  }

  return bindImpl();
}

bool OSXPlugin::bindImpl()
{
  qsys::View *ptmp = Plugin::getViewPtr().get();
  if (ptmp==NULL) return false;
  
  MB_DPRINTLN("OSX bind: view %p type=%s", ptmp, typeid(*ptmp).name());
  sysdep::AglView *pAglView = dynamic_cast<sysdep::AglView *>(ptmp);
  if (pAglView==NULL) {
    LOG_DPRINTLN("OSX bind failed: invalid view %p !!", ptmp);
    return false;
  }

  if (!setupOpenGL(pAglView)) {
    LOG_DPRINTLN("OSX bind failed: setup OpenGL !!");
    m_pCachedView=NULL;
    return false;
  }

  GrafPtr ourPort = getGrafPort();
  WindowPtr w = GetWindowFromPort(ourPort);
  bool res = pAglView->attach(m_ctx, w);
  MB_DPRINTLN("OSX bind: %s", res?"OK":"NG");
  if (!res) {
    m_pCachedView=NULL;
    return false;
  }

  m_pCachedView=pAglView;
  return true;
}

/////////////////////////////

Plugin *np::createPluginObj(NPP npp)
{
  return new OSXPlugin(npp);
}

/////////////////////////////

#if 0

void DrawString(const unsigned char* text, short width, short height, short centerX, Rect drawRect)
{
  short length, textHeight, textWidth;

  if (!text)
    return;

  length = strlen((char*)text);
  TextFont(20);
  TextFace(underline);
  TextMode(srcCopy);
  TextSize(10);

  FontInfo fontInfo;
  GetFontInfo(&fontInfo);

  textHeight = fontInfo.ascent + fontInfo.descent + fontInfo.leading;
  textWidth = TextWidth(text, 0, length);
  MB_DPRINTLN("font info: h=%d, w=%d", textHeight, textWidth);
  if (width > textWidth && height > textHeight + 32) {
    int xpos = centerX - (textWidth >> 1);
    int ypos = 10; //drawRect.bottom + textHeight;
    MB_DPRINTLN("drawtrext: (%d,%d) %s, l=%d", xpos, ypos, text, length);
    MoveTo(xpos, ypos);
    DrawText(text, 0, length);
  }
}

void OSXPlugin::Draw(/*HiliteState hilite*/)
{
  UInt8 *pTheText;
  SInt32 height = m_pWindow->height;
  SInt32 width = m_pWindow->width;
  SInt32 centerX = (width) >> 1;
  SInt32 centerY = (height) >> 1;
  Rect drawRect;
  RGBColor black = { 0x0000, 0x0000, 0x0000 };
  RGBColor white = { 0xFFFF, 0xFFFF, 0xFFFF };
  RGBColor hiliteColor = { 0x0000, 0x0000, 0x0000 };
  short transform;

  drawRect.top = 0;
  drawRect.left = 0;
  drawRect.bottom = height;
  drawRect.right = width;

  if (height < 4 && width < 4)
    return;

#if 1
  int cont_height;
  {
    NP_Port *pPort = (NP_Port *)(m_pWindow->window); 
    WindowPtr w = GetWindowFromPort(pPort->port);
    Rect drt;
    GetWindowBounds(w, kWindowContentRgn, &drt);
    cont_height = drt.bottom-drt.top;
    //MB_DPRINTLN("w.cont.top %d, w.cont.bottom %d",drt.top,drt.bottom);
    MB_DPRINTLN("w.cont.bot-top %d",drt.bottom-drt.top);
  }

  {
    // Rect bounds;
    GLint bufferRect[4];
    // NP_Port *pPort = (NP_Port *)(m_pWindow->window); 
    // GetPortBounds(pPort->port, &bounds);
    bufferRect[0] = m_pWindow->x;
    //bufferRect[1] = (bounds.bottom - bounds.top) - (m_pWindow->y + m_pWindow->height);
    bufferRect[1] = cont_height - (m_pWindow->y + m_pWindow->height);
    bufferRect[2] = m_pWindow->width;
    bufferRect[3] = m_pWindow->height;
    aglSetInteger(m_ctx, AGL_BUFFER_RECT, bufferRect);
    aglEnable(m_ctx, AGL_BUFFER_RECT);

    // MB_DPRINTLN("bounds.bottom %d, clip.top %d bottom %d",bounds.bottom, m_pWindow->clipRect.top, m_pWindow->clipRect.bottom);
    //MB_DPRINTLN("BUF RECT x=%d, y=%d, w=%d, h=%d", bufferRect[0], bufferRect[1], bufferRect[2], bufferRect[3]);

    /*
    RgnHandle clipRgn = NewRgn();
    SetRectRgn(clipRgn, m_pWindow->clipRect.left, m_pWindow->clipRect.top,
	       m_pWindow->clipRect.right, m_pWindow->clipRect.bottom);
    aglSetInteger(m_ctx, AGL_CLIP_REGION, (const GLint*)clipRgn);
    aglEnable(m_ctx, AGL_CLIP_REGION);
    DisposeRgn(clipRgn);
    */

    aglUpdateContext(m_ctx);

    /*
    MB_DPRINTLN("Port X=%d, y=%d", pPort->portx, pPort->porty);
    MB_DPRINTLN("Win x=%d, y=%d", m_pWindow->x, m_pWindow->y);
    MB_DPRINTLN("    w=%d, h=%d", m_pWindow->width, m_pWindow->height);
    MB_DPRINTLN("Clp l=%d, t=%d", m_pWindow->clipRect.left, m_pWindow->clipRect.top);
    MB_DPRINTLN("    r=%d, b=%d", m_pWindow->clipRect.right, m_pWindow->clipRect.bottom);
    MB_DPRINTLN("Bnd l=%d, t=%d", bounds.left, bounds.top);
    MB_DPRINTLN("    r=%d, b=%d", bounds.right, bounds.bottom);
    */
  }

  //////////

  aglSetCurrentContext(m_ctx);
  { // set up viewport and projection                                                                   
    GLfloat fAspect;
    short w, h;

    w = drawRect.right - drawRect.left;
    h = drawRect.bottom - drawRect.top;

    // Prevent a divide by zero                                                                       
    if(h == 0)
      h = 1;
    fAspect = (GLfloat) w / (GLfloat) h;
    
    // Set Viewport to window dimensions                                                              
    glViewport (0, 0, (GLsizei) w, (GLsizei) h);
    glMatrixMode (GL_PROJECTION);

    // Reset coordinate system                                                                    
    glLoadIdentity ();

    // Setup perspective for viewing                                                              
    gluPerspective (45.0, fAspect, 0.1, 15);

    glDebugStr(); // check for errors                                                            
  }


  // initial GL settings                                                                                
  glShadeModel (GL_SMOOTH);

  glEnable(GL_DEPTH_TEST);    // Hidden surface removal                                                     
  glEnable(GL_CULL_FACE);     // Do not draw inside of cube                                                 
  glFrontFace(GL_CCW);        // Counter clock-wise polygons face out                                       
  glPolygonOffset (1.0,1.0);
  glEnable(GL_POLYGON_OFFSET_FILL);
  glClearColor (0.0f, 0.2f, 0.4f, 1.0f);
  glPointSize (3.0);
  glDebugStr (); // check for errors                                                                    

  ////////////

  glClear (GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

  glMatrixMode(GL_MODELVIEW);
  glLoadIdentity();

  aglSwapBuffers(m_ctx);
  aglDebugStr();
  return;
#endif

#if 0
  PenNormal();
  RGBForeColor(&black);
  RGBBackColor(&white);

  Pattern qdWhite;
  FillRect(&drawRect, GetQDGlobalsWhite(&qdWhite));

  //if (hilite == kHilited) {
  hiliteColor.red = 0xFFFF;
  transform = ttSelected;
    //}
    //else {
    //hiliteColor.blue = 0xFFFF;
    //transform = ttNone;
    //}

  RGBForeColor(&hiliteColor);
  FrameRect(&drawRect);

  /*
  if (height > 32 && width > 32 && CPlugin::sIconHandle) {
    drawRect.top = centerY - 16;
    drawRect.bottom = centerY + 16;
    drawRect.left = centerX - 16;
    drawRect.right = centerX + 16;
    PlotCIconHandle(&drawRect, atAbsoluteCenter, transform, CPlugin::sIconHandle);
  }

  if (fUserInstalledPlugin) {
    pTheText = (unsigned char*)CPlugin::sRefreshText;
  }
  else {
    pTheText = (unsigned char*)CPlugin::sAltText;
  }
  */

  pTheText = (UInt8 *)"12345ABCDE";
  //pTheText = (unsigned char*)s_AltText;
  RGBForeColor(&black);
  DrawString(pTheText, width, height, centerX, drawRect);
#endif
}

bool OSXPlugin::FocusDraw()
{
  if (!m_pWindow)
    return false;

  NP_Port* npport = (NP_Port*) m_pWindow->window;
  CGrafPtr ourPort = npport->port;

  if (m_pWindow->clipRect.left < m_pWindow->clipRect.right) {
    GetPort(&fSavePort);
    SetPort((GrafPtr) ourPort);
    Rect portRect;
    GetPortBounds(ourPort, &portRect);
    fSavePortTop = portRect.top;
    fSavePortLeft = portRect.left;
    GetClip(fSaveClip);

    fRevealedRect.top = m_pWindow->clipRect.top + npport->porty;
    fRevealedRect.left = m_pWindow->clipRect.left + npport->portx;
    fRevealedRect.bottom = m_pWindow->clipRect.bottom + npport->porty;
    fRevealedRect.right = m_pWindow->clipRect.right + npport->portx;
    SetOrigin(npport->portx, npport->porty);
    ClipRect(&fRevealedRect);

    return true;
  }
  else {
    return false;
  }
}

void OSXPlugin::RestoreDraw()
{
  SetOrigin(fSavePortLeft, fSavePortTop);
  SetClip(fSaveClip);
  SetPort(fSavePort);
}
#endif
