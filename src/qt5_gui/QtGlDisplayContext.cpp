// -*-Mode: C++;-*-
//
//  Qt GL display context implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtGlDisplayContext.hpp"
#include "QtGlView.hpp"

#include "QtMolWidget.hpp"

using namespace qt5_gui;

// QtGlDisplayContext::QtGlDisplayContext(int sceneid, QtGlView *pView, void *pCtxt)
//      : OglDisplayContext(sceneid), m_pTargetView(pView), m_pCtxt(pCtxt)
// {
// }

QtGlDisplayContext::QtGlDisplayContext()
  : OglDisplayContext()
{
}

QtGlDisplayContext::~QtGlDisplayContext()
{
}

void QtGlDisplayContext::setup(void *pCtxt)
{
  m_pCtxt = pCtxt;
}

bool QtGlDisplayContext::setCurrent()
{
  QGLContext *pqctxt = static_cast<QGLContext *>(m_pCtxt);
  pqctxt->makeCurrent();
  return true;
}

bool QtGlDisplayContext::isCurrent() const
{
  const QGLContext *pcur = QGLContext::currentContext();
  if (pcur==m_pCtxt)
    return true;
  
  return false;
}

