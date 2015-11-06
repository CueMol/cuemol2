// -*-Mode: C++;-*-
//
//  Qt GL display context implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtglDisplayContext.hpp"
#include "QtglView.hpp"

#include "QtMolWidget_moc.hpp"

using namespace qtgui;

QtglDisplayContext::QtglDisplayContext(int sceneid, QtglView *pView, void *pCtxt)
     : OglDisplayContext(sceneid), m_pTargetView(pView), m_pCtxt(pCtxt)
{
}

QtglDisplayContext::~QtglDisplayContext()
{
}

bool QtglDisplayContext::setCurrent()
{
  QGLContext *pqctxt = static_cast<QGLContext *>(m_pCtxt);
  pqctxt->makeCurrent();
  return true;
}

bool QtglDisplayContext::isCurrent() const
{
  const QGLContext *pcur = QGLContext::currentContext();
  if (pcur==m_pCtxt)
    return true;

  return false;
}

