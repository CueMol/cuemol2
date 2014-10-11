// -*-Mode: C++;-*-
//
//  AGL display context implementation
//
//  $Id: AglDisplayContext.cpp,v 1.6 2009/08/22 08:11:40 rishitani Exp $

#include <common.h>

#include <OpenGL/gl.h>
#include <OpenGL/glu.h>
#include <AGL/agl.h>

#include "AglDisplayContext.hpp"

using namespace sysdep;

AglDisplayContext::AglDisplayContext(int sceneid, AglView *pView)
  : OglDisplayContext(sceneid), m_pTargetView(pView)
{
  //m_win = 0;
  m_glcx=NULL;

}

AglDisplayContext::~AglDisplayContext()
{
}

bool AglDisplayContext::attach(AGLContext cx)
{
  m_glcx = cx;
  return true;
}


bool AglDisplayContext::setCurrent()
{
  if (m_glcx==NULL) {
    LOG_DPRINTLN("Fatal error: aglSetCurrent() not initialized!!");
    return false;
  }

  //MB_DPRINTLN("============== glXMakeCurrent");
  GLboolean res = ::aglSetCurrentContext(m_glcx);
  //MB_DPRINTLN(" aglMakeCurrent res=%d", res);

  return (bool)res;
}

bool AglDisplayContext::isCurrent() const
{
  AGLContext cx = ::aglGetCurrentContext();
  if (cx==m_glcx)
    return true;
  return false;
}
