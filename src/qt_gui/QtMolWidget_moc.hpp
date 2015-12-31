//
// Mol view widget implementation using QT5 QGLWidget
//

#ifndef QT_MOL_WIDGET_HPP_INCLUDED
#define QT_MOL_WIDGET_HPP_INCLUDED

#include "qtgui.hpp"
#include <QtOpenGL/QGLWidget>
#include <QtWidgets/QGestureEvent>

namespace qtgui {
  class QtglView;
}

namespace qsys {
  class InDevEvent;
}

namespace sysdep {
  class MouseEventHandler;
}

class QtMolWidget : public QGLWidget
{
  Q_OBJECT;
  
public:
  QtMolWidget(QWidget *parent = 0);
  QtMolWidget(const QGLFormat &format ,QWidget *parent = 0);
  ~QtMolWidget();
  
private:
  int m_nSceneID;
  int m_nViewID;
  
  qtgui::QtglView *m_pView;
  
public:
  void bind(int scid, int vwid);

  /// Setup Event/Timer manager
  static void setupEventTimer();

  static void setupTextRender();

public slots:
  
signals:
  
protected:
  void initializeGL() Q_DECL_OVERRIDE;
  void paintGL() Q_DECL_OVERRIDE;
  void resizeGL(int width, int height) Q_DECL_OVERRIDE;

  void mousePressEvent(QMouseEvent *event) Q_DECL_OVERRIDE;
  void mouseReleaseEvent(QMouseEvent *event) Q_DECL_OVERRIDE;
  void mouseMoveEvent(QMouseEvent *event) Q_DECL_OVERRIDE;
  
  void wheelEvent(QWheelEvent * event) Q_DECL_OVERRIDE;

  bool event(QEvent * event) Q_DECL_OVERRIDE;

private slots:
  
private:
  void setupMouseEvent(QMouseEvent *event, qsys::InDevEvent &ev);
  void setupWheelEvent(QWheelEvent *event, qsys::InDevEvent &ev);
  sysdep::MouseEventHandler *m_pMeh;

  bool gestureEvent(QGestureEvent * event);
  void pinchTriggered(QPinchGesture *gesture);
  void panTriggered(QPanGesture *gesture);
};

#endif // GLWIDGET_H

