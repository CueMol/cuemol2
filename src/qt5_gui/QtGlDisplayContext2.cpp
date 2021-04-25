// -*-Mode: C++;-*-
//
//  Qt GL display context implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtGlDisplayContext2.hpp"
#include "QtGlView2.hpp"

#include "QtMolWidget2.hpp"
#include <QtWidgets/QOpenGLContext>

using namespace qt5_gui;

QtGlDisplayContext2::QtGlDisplayContext2()
  : OglDisplayContext()
{
}

QtGlDisplayContext2::~QtGlDisplayContext2()
{
}

void QtGlDisplayContext2::setup(void *pCtxt)
{
  m_pCtxt = pCtxt;
}

bool QtGlDisplayContext2::setCurrent()
{
  QOpenGLContext *pqctxt = static_cast<QOpenGLContext *>(m_pCtxt);
  pqctxt->makeCurrent();
  return true;
}

bool QtGlDisplayContext2::isCurrent() const
{
  const QOpenGLContext *pcur = QOpenGLContext::currentContext();
  if (pcur==m_pCtxt)
    return true;
  
  return false;
}

