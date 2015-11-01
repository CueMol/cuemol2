//
// Qt MolView widget implementation
//

#define NO_USING_QTYPES
#include <common.h>

#include "QtMolWidget_moc.hpp"

#include <QtGui/QMouseEvent>
#include <QtCore/QTimer>

//using namespace qtgui;

QtMolWidget::QtMolWidget(QWidget *parent)
     : QGLWidget(parent)
{

  //QTimer *timer = new QTimer(this);
  //connect(timer, SIGNAL(timeout()), this, SLOT(advanceGears()));
  //timer->start(20);
}

QtMolWidget::~QtMolWidget()
{
}

void QtMolWidget::bind(int scid, int vwid)
{
  m_nSceneID = scid;
  m_nViewID = vwid;
}

void QtMolWidget::initializeGL()
{
  GLfloat lightPos[4] = { 5.0f, 5.0f, 10.0f, 1.0f };
  //static const GLfloat reflectance1[4] = { 0.8f, 0.1f, 0.0f, 1.0f };
  //static const GLfloat reflectance2[4] = { 0.0f, 0.8f, 0.2f, 1.0f };
  //static const GLfloat reflectance3[4] = { 0.2f, 0.2f, 1.0f, 1.0f };

  glLightfv(GL_LIGHT0, GL_POSITION, lightPos);
  glEnable(GL_LIGHTING);
  glEnable(GL_LIGHT0);
  glEnable(GL_DEPTH_TEST);
  
  glEnable(GL_NORMALIZE);
  glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
}

void QtMolWidget::paintGL()
{
  glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
  
  glPushMatrix();
  
  glRotated(+90.0, 1.0, 0.0, 0.0);
  
  glPopMatrix();
}

void QtMolWidget::resizeGL(int width, int height)
{
  int side = qMin(width, height);
  glViewport((width - side) / 2, (height - side) / 2, side, side);
  
  glMatrixMode(GL_PROJECTION);
  glLoadIdentity();
  glFrustum(-1.0, +1.0, -1.0, 1.0, 5.0, 60.0);
  glMatrixMode(GL_MODELVIEW);
  glLoadIdentity();
  glTranslated(0.0, 0.0, -40.0);
}

void QtMolWidget::mousePressEvent(QMouseEvent *event)
{
  //lastPos = event->pos();
}

void QtMolWidget::mouseMoveEvent(QMouseEvent *event)
{
  //int dx = event->x() - lastPos.x();
  //int dy = event->y() - lastPos.y();

  //if (event->buttons() & Qt::LeftButton) {
  //}
  // else if (event->buttons() & Qt::RightButton) {
  //}
  //lastPos = event->pos();
}

/*
void QtMolWidget::advanceGears()
{
    gear1Rot += 2 * 16;
    updateGL();
}
*/


