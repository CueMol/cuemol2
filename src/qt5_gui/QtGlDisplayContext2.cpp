// -*-Mode: C++;-*-
//
//  Qt GL display context implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtGlDisplayContext2.hpp"

#include <QtGui/QOpenGLContext>

#include "QtGlView2.hpp"
#include "QtMolWidget2.hpp"

using namespace qt5_gui;

QtGlDisplayContext2::QtGlDisplayContext2(void *pQtWidget)
    : OglDisplayContext(), m_pQtWidget(pQtWidget)
{
}

QtGlDisplayContext2::~QtGlDisplayContext2() {}

void QtGlDisplayContext2::setup(void *pCtxt)
{
    m_pCtxt = pCtxt;
}

bool QtGlDisplayContext2::setCurrent()
{
    // LOG_DPRINTLN("QtGlDisplayContext2.setCurrent called!!");
    // QOpenGLWidget *pGLWidget = static_cast<QOpenGLWidget *>(m_pQtWidget);
    // QOpenGLContext *pqctxt = static_cast<QOpenGLContext *>(m_pCtxt);
    // pqctxt->makeCurrent(pGLWidget);
    return true;
}

bool QtGlDisplayContext2::isCurrent() const
{
    const QOpenGLContext *pcur = QOpenGLContext::currentContext();
    if (pcur == m_pCtxt) return true;

    return false;
}
