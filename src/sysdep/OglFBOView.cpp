// -*-Mode: C++;-*-
//
// OpenGL implementation for off-screen image rendering using FBO
//
//  $Id: OglFBOView.cpp,v 1.5 2011/04/16 08:22:15 rishitani Exp $

#include <common.h>

#include "ogl.hpp"

#include <qlib/Utils.hpp>

#include "OglFBOView.hpp"
#include "OglDisplayContext.hpp"
#include <qsys/Scene.hpp>

using namespace sysdep;
using qsys::Scene;

#ifdef MB_DEBUG
#define CHECK_GL_ERROR(strmsg) \
{ GLenum errc; errc = glGetError(); MB_DPRINTLN(strmsg " GLError: %s",  gluErrorString(errc)); }
#else
#define CHECK_GL_ERROR(strmsg) {}
#endif

OglFBOView::OglFBOView()
{
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
  m_pParView = pParView;

  setViewSize(width, height);

  //
  // Make color buffer
  //
  glGenRenderbuffers(1, &m_nRendBufID);
  CHECK_GL_ERROR("ColorBuffer, glGenRenderbuffers");
  glBindRenderbuffer(GL_RENDERBUFFER_EXT, m_nRendBufID);
  CHECK_GL_ERROR("ColorBuffer, glBindRenderbuffer");
  glRenderbufferStorage(GL_RENDERBUFFER_EXT, GL_RGBA, width, height);
  CHECK_GL_ERROR("ColorBuffer, glRenderbufferStorage");

  //
  // Make depth buffer
  //
  glGenRenderbuffers(1, &m_nDepthBufID);
  CHECK_GL_ERROR("DepthBuffer, glGenRenderbuffers");
  glBindRenderbuffer(GL_RENDERBUFFER_EXT, m_nDepthBufID);
  CHECK_GL_ERROR("DepthBuffer, glBindRenderbuffer");
  glRenderbufferStorage(GL_RENDERBUFFER_EXT, GL_DEPTH_COMPONENT, width, height);
  CHECK_GL_ERROR("DepthBuffer, glRenderbufferStorage");

  glBindRenderbuffer(GL_RENDERBUFFER_EXT, 0);
  CHECK_GL_ERROR("DepthBuffer, glBindRenderbuffer");

  //
  // Make frame buffer
  //
  glGenFramebuffers(1, &m_nFrameBufID);
  CHECK_GL_ERROR("frame buffer, glGenFramebuffers");
  glBindFramebuffer(GL_FRAMEBUFFER_EXT, m_nFrameBufID);
  CHECK_GL_ERROR("frame buffer, glBindFramebuffer");

  glFramebufferRenderbuffer(GL_FRAMEBUFFER_EXT, GL_COLOR_ATTACHMENT0_EXT,
			       GL_RENDERBUFFER_EXT, m_nRendBufID);
  CHECK_GL_ERROR("frame buffer, glFramebufferRenderbuffer");
  if (glCheckFramebufferStatus(GL_FRAMEBUFFER_EXT) != GL_FRAMEBUFFER_COMPLETE_EXT) {
    CHECK_GL_ERROR("frame buffer, glCheckFramebufferStatus");
  }

  glFramebufferRenderbuffer(GL_FRAMEBUFFER_EXT, GL_DEPTH_ATTACHMENT_EXT,
			       GL_RENDERBUFFER_EXT, m_nDepthBufID);
  CHECK_GL_ERROR("frame buffer, glFramebufferRenderbuffer");
  if (glCheckFramebufferStatus(GL_FRAMEBUFFER_EXT) != GL_FRAMEBUFFER_COMPLETE_EXT) {
    CHECK_GL_ERROR("frame buffer, glCheckFramebufferStatus");
  }
  
  //glFramebufferRenderbuffer(GL_FRAMEBUFFER_EXT, GL_DEPTH_ATTACHMENT_EXT,
  //GL_RENDERBUFFER_EXT, m_nRendBufID);

  glBindFramebuffer(GL_FRAMEBUFFER_EXT, 0);
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
  glDeleteFramebuffers(1, &m_nFrameBufID);
  glDeleteRenderbuffers(1, &m_nRendBufID);
  glDeleteRenderbuffers(1, &m_nDepthBufID);
}

void OglFBOView::drawScene()
{
  // if (!m_bInitOK) return;
  //if (!safeSetCurrent()) return;

  glBindFramebuffer(GL_FRAMEBUFFER_EXT, m_nFrameBufID);
  //glBindRenderbuffer(GL_RENDERBUFFER_EXT, m_nRendBufID);

  qsys::ScenePtr pScene = getScene();
  if (pScene.isnull()) {
    MB_DPRINTLN("DrawScene: invalid scene %d !!", getSceneID());
    return;
  }

  DisplayContext *pdc = getDisplayContext();
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

  glBindFramebuffer(GL_FRAMEBUFFER_EXT, 0);
  glBindRenderbuffer(GL_RENDERBUFFER_EXT, 0);

  return;
}

void OglFBOView::readPixels(int x, int y, int width, int height, char *pbuf, int nbufsize, int ncomp)
{
  glBindFramebuffer(GL_FRAMEBUFFER_EXT, m_nFrameBufID);
  glBindRenderbuffer(GL_RENDERBUFFER_EXT, m_nRendBufID);

  super_t::readPixels(x, y, width, height, pbuf, nbufsize, ncomp);

  glBindFramebuffer(GL_FRAMEBUFFER_EXT, 0);
  glBindRenderbuffer(GL_RENDERBUFFER_EXT, 0);
}

