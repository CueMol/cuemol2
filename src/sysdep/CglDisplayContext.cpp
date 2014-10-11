// -*-Mode: C++;-*-
//
//  CGL display context implementation
//
//  $Id: CglDisplayContext.cpp,v 1.2 2010/09/05 14:29:20 rishitani Exp $

#include <common.h>

#include <OpenGL/OpenGL.h>
#include <OpenGL/gl.h>
#include <OpenGL/glu.h>

#include "CglDisplayContext.hpp"

using namespace sysdep;

CglDisplayContext::CglDisplayContext(int sceneid, CglView *pView)
  : OglDisplayContext(sceneid), m_pTargetView(pView)
{
  m_glcx=NULL;
}

CglDisplayContext::~CglDisplayContext()
{
}

bool CglDisplayContext::attach(void *pnsc, CGLContextObj cx)
{
  m_pnsc = pnsc;
  m_glcx = cx;

  return true;
}


bool CglDisplayContext::setCurrent()
{
  if (m_glcx==NULL) {
    LOG_DPRINTLN("Fatal error: cglSetCurrent() not initialized!!");
    return false;
  }

  //MB_DPRINTLN("============== glXMakeCurrent");
  //GLboolean res = ::cglSetCurrentContext(m_glcx);
  CGLError res = ::CGLSetCurrentContext(m_glcx);
  //MB_DPRINTLN(" cglMakeCurrent res=%d", res);
  if (res==0)
    return true;

  MB_DPRINTLN(" CGLSetCurrent error: %s", CGLErrorString(res) );

  return false;
}

bool CglDisplayContext::isCurrent() const
{
  CGLContextObj cx = ::CGLGetCurrentContext();
  if (cx==m_glcx)
    return true;
  return false;
}
