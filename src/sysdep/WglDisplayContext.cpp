// -*-Mode: C++;-*-
//
//  WGL display context implementation
//
//  $Id: WglDisplayContext.cpp,v 1.9 2010/12/23 09:33:49 rishitani Exp $

#include <common.h>

#ifdef WIN32
#  include <windows.h>
#endif

#include "ogl.hpp"

#include "WglDisplayContext.hpp"
#include "WglView.hpp"

using namespace sysdep;

WglDisplayContext::WglDisplayContext(int sceneid, WglView *pView)
     : OglDisplayContext(sceneid), m_pTargetView(pView)
{
}

WglDisplayContext::~WglDisplayContext()
{
}

bool WglDisplayContext::attach(HDC hdc, HGLRC hGL)
{
  m_hDC = hdc;
  m_hGlrc = hGL;

  return true;
}

bool WglDisplayContext::setCurrent()
{
  if (isCurrent())
    return true;
  
  if (!::wglMakeCurrent(m_hDC, m_hGlrc))
    return false;
  
  return true;
}

bool WglDisplayContext::isCurrent() const
{
  return (::wglGetCurrentContext()==m_hGlrc);
}

