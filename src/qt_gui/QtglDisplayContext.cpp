// -*-Mode: C++;-*-
//
//  Qt GL display context implementation
//

#include <common.h>

#include "QtglDisplayContext.hpp"
#include "QtglView.hpp"

using namespace qtgui;

QtglDisplayContext::QtglDisplayContext(int sceneid, QtglView *pView)
     : OglDisplayContext(sceneid), m_pTargetView(pView)
{
}

QtglDisplayContext::~QtglDisplayContext()
{
}

bool QtglDisplayContext::setCurrent()
{
  return true;
}

bool QtglDisplayContext::isCurrent() const
{
  //return (::wglGetCurrentContext()==m_hGlrc);
  return false;
}

