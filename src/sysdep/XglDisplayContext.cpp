// -*-Mode: C++;-*-
//
//  XGL display context implementation
//
//  $Id: XglDisplayContext.cpp,v 1.8 2009/08/22 11:10:46 rishitani Exp $

#include <common.h>
#include <GL/gl.h>
#include <GL/glu.h>

#include "XglDisplayContext.hpp"

using namespace sysdep;

/*
XglDisplayContext::XglDisplayContext(int sceneid, XglView *pView)
  : OglDisplayContext(sceneid)
{
  m_pDisplay = NULL;
  m_xwin = 0;
  m_glcx = NULL;
  m_pTargetView = pView;
}
*/

XglDisplayContext::XglDisplayContext()
  : OglDisplayContext()
{
  m_pDisplay = NULL;
  m_xwin = 0;
  m_glcx = NULL;
}

XglDisplayContext::~XglDisplayContext()
{
  if (m_glcx!=NULL && m_pDisplay!=NULL) {
    ::glXDestroyContext(m_pDisplay, m_glcx);
  }
}

//bool XglDisplayContext::setup(Display *pDsp, Window xwin, GLXContext cx)
bool XglDisplayContext::setup(Display *pDsp, Window xwin, DisplayContext *pShareCtxt)
{
  m_pDisplay = pDsp;
  m_xwin = xwin;

  //////////

  int dummy1;
  int dummy2;

  MB_DPRINTLN("glXQueryExtension(%p, &dummy1, &dummy2)", m_pDisplay);
  if(!glXQueryExtension(m_pDisplay, &dummy1, &dummy2)){
    LOG_DPRINTLN("NP> Fatal error: X server has no OpenGL GLX extension");
    return false;
  }

  // Find an appropriate visual
  int dblBuf[] = {GLX_USE_GL,
		  GLX_RGBA,
		  GLX_DOUBLEBUFFER,
		  GLX_DEPTH_SIZE, 16,
		  None};

  int quaBuf[] = {GLX_USE_GL,
		  GLX_RGBA,
		  GLX_DOUBLEBUFFER,
		  GLX_STEREO,
		  GLX_DEPTH_SIZE, 16,
		  None};

  // Find an OpenGL-capable RGB visual with depth buffer
  XVisualInfo *vi = glXChooseVisual(m_pDisplay, DefaultScreen(m_pDisplay), dblBuf);
  if (vi == NULL) {
    LOG_DPRINTLN("NP> TrueColor visual required for this program");
    return false;
  }
  if(vi->c_class != TrueColor) {
    MB_DPRINTLN("NPX11> TrueColor visual required for this program");
    return false;
  }

  // m_pvi = vi;

  //*** (4) create an OpenGL rendering context

  GLXContext shcx = None;
  XglDisplayContext *pXglShCtxt = dynamic_cast<XglDisplayContext *>(pShareCtxt);
  if (pXglShCtxt!=NULL)
    shcx = pXglShCtxt->getGLXContext();

  // create an OpenGL rendering context */
  GLXContext cx = glXCreateContext(m_pDisplay, vi, shcx,
				   GL_TRUE); // direct rendering if possible
  if (cx == NULL) {
    LOG_DPRINTLN("NPX11> could not create rendering context");
    return false;
  }

  m_glcx = cx;

  return true;
}

bool XglDisplayContext::setCurrent()
{
  if (m_glcx==NULL) {
    LOG_DPRINTLN("Fatal error: xglSetCurrent() not initialized!!");
    return false;
  }

  //MB_DPRINTLN("============== glXMakeCurrent (%p, %p, %p)", m_pDisplay, m_xwin, m_glcx);
  Bool res = ::glXMakeCurrent(m_pDisplay, m_xwin, m_glcx);
  //MB_DPRINTLN("============== glXMakeCurrent res=%d", res);

  return (bool)res;
}

bool XglDisplayContext::isCurrent() const
{
  GLXContext cx = ::glXGetCurrentContext();
  if (cx==m_glcx)
    return true;
  return false;
}
