// -*-Mode: C++;-*-
//
// OpenGL implementation for off-screen image rendering using FBO
//
//  $Id: OglFBOView.cpp,v 1.5 2011/04/16 08:22:15 rishitani Exp $

#include <common.h>

#ifdef WIN32
#  include <windows.h>
#endif

#if defined(HAVE_GL_GLEXT_H)
#  define GL_GLEXT_PROTOTYPES
#endif

#ifdef HAVE_GL_GL_H
#  include <GL/gl.h>
#elif defined(HAVE_OPENGL_GL_H)
#  include <OpenGL/gl.h>
#else
#  error no gl.h
#endif

#ifdef HAVE_GL_GLU_H
#  include <GL/glu.h>
#elif defined(HAVE_OPENGL_GLU_H)
#  include <OpenGL/glu.h>
#else
#  error no glu.h
#endif

#if defined(HAVE_GL_GLEXT_H)
#  include <GL/glext.h>
#elif defined(HAVE_OPENGL_GLEXT_H)
#  include <OpenGL/glext.h>
#elif defined(WIN32)
#  include "glext.h"
#endif

#include <qlib/Utils.hpp>

#include "OglFBOView.hpp"
#include "OglDisplayContext.hpp"
#include <qsys/Scene.hpp>

using namespace sysdep;
using qsys::Scene;

#ifdef WIN32
PFNGLGENFRAMEBUFFERSEXTPROC glGenFramebuffersEXT = NULL;
PFNGLBINDFRAMEBUFFEREXTPROC glBindFramebufferEXT = NULL;
//PFNGLFRAMEBUFFERTEXTURE2DEXTPROC glFramebufferTexture2DEXT = NULL;
PFNGLGENRENDERBUFFERSEXTPROC glGenRenderbuffersEXT = NULL;
PFNGLBINDRENDERBUFFEREXTPROC glBindRenderbufferEXT = NULL;
PFNGLRENDERBUFFERSTORAGEEXTPROC glRenderbufferStorageEXT = NULL;
PFNGLFRAMEBUFFERRENDERBUFFEREXTPROC glFramebufferRenderbufferEXT = NULL;
PFNGLCHECKFRAMEBUFFERSTATUSEXTPROC glCheckFramebufferStatusEXT = NULL;
PFNGLDELETEFRAMEBUFFERSEXTPROC glDeleteFramebuffersEXT = NULL;
PFNGLDELETERENDERBUFFERSEXTPROC glDeleteRenderbuffersEXT = NULL;
#endif

#ifdef MB_DEBUG
#define CHECK_GL_ERROR(strmsg) \
{ GLenum errc; errc = glGetError(); MB_DPRINTLN(strmsg " GLError: %s",  gluErrorString(errc)); }
#else
#define CHECK_GL_ERROR(strmsg) {}
#endif

OglFBOView::OglFBOView()
{
#ifdef WIN32
  if (glGenFramebuffersEXT)
    return;
  glGenFramebuffersEXT =
    (PFNGLGENFRAMEBUFFERSEXTPROC)wglGetProcAddress("glGenFramebuffersEXT");
  glBindFramebufferEXT =
    (PFNGLBINDFRAMEBUFFEREXTPROC)wglGetProcAddress("glBindFramebufferEXT");
//  glFramebufferTexture2DEXT =
//    (PFNGLFRAMEBUFFERTEXTURE2DEXTPROC)wglGetProcAddress("glFramebufferTexture2DEXT");
  glGenRenderbuffersEXT =
    (PFNGLGENRENDERBUFFERSEXTPROC)wglGetProcAddress("glGenRenderbuffersEXT");
  glBindRenderbufferEXT =
    (PFNGLBINDRENDERBUFFEREXTPROC)wglGetProcAddress("glBindRenderbufferEXT");
  glRenderbufferStorageEXT =
    (PFNGLRENDERBUFFERSTORAGEEXTPROC)wglGetProcAddress("glRenderbufferStorageEXT");
  glFramebufferRenderbufferEXT =
    (PFNGLFRAMEBUFFERRENDERBUFFEREXTPROC)wglGetProcAddress("glFramebufferRenderbufferEXT");
  glCheckFramebufferStatusEXT =
    (PFNGLCHECKFRAMEBUFFERSTATUSEXTPROC)wglGetProcAddress("glCheckFramebufferStatusEXT");
  glDeleteFramebuffersEXT =
    (PFNGLDELETEFRAMEBUFFERSEXTPROC)wglGetProcAddress("glDeleteFramebuffersEXT");
  glDeleteRenderbuffersEXT =
    (PFNGLDELETERENDERBUFFERSEXTPROC)wglGetProcAddress("glDeleteRenderbuffersEXT");
#endif
  
}

OglFBOView::~OglFBOView()
{
  if (m_pParView!=NULL)
    detach();
}

LString OglFBOView::toString() const
{
  return LString::format("OGL FBO View(%p)", this);
}

DisplayContext *OglFBOView::getDisplayContext()
{
  if (m_pParView==NULL)
    return NULL;
  return m_pParView->getDisplayContext();
}

/// attach to the parent view and create fbo
bool OglFBOView::attach(OglView *pParView, int width, int height)
{
#ifdef WIN32
  if (glGenFramebuffersEXT==NULL)
    return false;
#endif

  m_pParView = pParView;

  setViewSize(width, height);

  //
  // Make color buffer
  //
  glGenRenderbuffersEXT(1, &m_nRendBufID);
  CHECK_GL_ERROR("ColorBuffer, glGenRenderbuffers");
  glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, m_nRendBufID);
  CHECK_GL_ERROR("ColorBuffer, glBindRenderbuffer");
  glRenderbufferStorageEXT(GL_RENDERBUFFER_EXT, GL_RGBA, width, height);
  CHECK_GL_ERROR("ColorBuffer, glRenderbufferStorage");

  //
  // Make depth buffer
  //
  glGenRenderbuffersEXT(1, &m_nDepthBufID);
  CHECK_GL_ERROR("DepthBuffer, glGenRenderbuffers");
  glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, m_nDepthBufID);
  CHECK_GL_ERROR("DepthBuffer, glBindRenderbuffer");
  glRenderbufferStorageEXT(GL_RENDERBUFFER_EXT, GL_DEPTH_COMPONENT, width, height);
  CHECK_GL_ERROR("DepthBuffer, glRenderbufferStorage");

  glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, 0);
  CHECK_GL_ERROR("DepthBuffer, glBindRenderbuffer");

  //
  // Make frame buffer
  //
  glGenFramebuffersEXT(1, &m_nFrameBufID);
  CHECK_GL_ERROR("frame buffer, glGenFramebuffers");
  glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, m_nFrameBufID);
  CHECK_GL_ERROR("frame buffer, glBindFramebuffer");

  glFramebufferRenderbufferEXT(GL_FRAMEBUFFER_EXT, GL_COLOR_ATTACHMENT0_EXT,
			       GL_RENDERBUFFER_EXT, m_nRendBufID);
  CHECK_GL_ERROR("frame buffer, glFramebufferRenderbuffer");
  if (glCheckFramebufferStatusEXT(GL_FRAMEBUFFER_EXT) != GL_FRAMEBUFFER_COMPLETE_EXT) {
    CHECK_GL_ERROR("frame buffer, glCheckFramebufferStatus");
  }

  glFramebufferRenderbufferEXT(GL_FRAMEBUFFER_EXT, GL_DEPTH_ATTACHMENT_EXT,
			       GL_RENDERBUFFER_EXT, m_nDepthBufID);
  CHECK_GL_ERROR("frame buffer, glFramebufferRenderbuffer");
  if (glCheckFramebufferStatusEXT(GL_FRAMEBUFFER_EXT) != GL_FRAMEBUFFER_COMPLETE_EXT) {
    CHECK_GL_ERROR("frame buffer, glCheckFramebufferStatus");
  }
  
  //glFramebufferRenderbufferEXT(GL_FRAMEBUFFER_EXT, GL_DEPTH_ATTACHMENT_EXT,
  //GL_RENDERBUFFER_EXT, m_nRendBufID);

  glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, 0);
  CHECK_GL_ERROR("frame buffer, glBindFramebuffer");

  return true;
}

/// detach from the parent view and perform cleanup
void OglFBOView::detach()
{
  if (m_pParView==NULL)
    return;
  m_pParView = NULL;
  
  if (glDeleteFramebuffersEXT==NULL)
    return;
  glDeleteFramebuffersEXT(1, &m_nFrameBufID);
  glDeleteRenderbuffersEXT(1, &m_nRendBufID);
  glDeleteRenderbuffersEXT(1, &m_nDepthBufID);
}

void OglFBOView::drawScene()
{
  // if (!m_bInitOK) return;
  //if (!safeSetCurrent()) return;

  glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, m_nFrameBufID);
  //glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, m_nRendBufID);

  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    MB_DPRINTLN("DrawScene: invalid scene %d !!", getSceneID());
    return;
  }

  DisplayContext *pdc = getDisplayContext();
  pdc->setTargetView(this);
  pdc->setCurrent();

  pdc->setLighting(false);

  ////////////////////////////////////////////////
  // Render 3D objects

  setUpProjMat(-1, -1);
  setUpModelMat(MM_NORMAL);
  glDrawBuffer(GL_COLOR_ATTACHMENT0_EXT);

  gfx::ColorPtr pBgCol = pScene->getBgColor();
  glClearColor(float(pBgCol->fr()), float(pBgCol->fg()), float(pBgCol->fb()), 1.0f);
  setFogColorImpl();
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

  glClearColor(float(pBgCol->fr()), float(pBgCol->fg()), float(pBgCol->fb()), 0.0f);
  glClear(GL_COLOR_BUFFER_BIT);

  pScene->display(pdc);

  /// Complete the rendering operations
  glFinish();

  glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, 0);
  glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, 0);

  return;
}

void OglFBOView::readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize, int ncomp)
{
  glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, m_nFrameBufID);
  glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, m_nRendBufID);

  super_t::readPixels(x, y, width, height, pbuf, nbufsize, ncomp);

  glBindFramebufferEXT(GL_FRAMEBUFFER_EXT, 0);
  glBindRenderbufferEXT(GL_RENDERBUFFER_EXT, 0);
}

