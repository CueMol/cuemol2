//
//
//

#ifndef QT_MOL_WIDGET_HPP_INCLUDED
#define QT_MOL_WIDGET_HPP_INCLUDED

#include "qtgui.hpp"
#include <QtOpenGL/QGLWidget>

class QtMolWidget : public QGLWidget
{
  Q_OBJECT;
  
public:
  QtMolWidget(QWidget *parent = 0);
  ~QtMolWidget();
  
private:
  int m_nSceneID;
  int m_nViewID;
  
public:
  void bind(int scid, int vwid);

public slots:
  
signals:
  
protected:
  void initializeGL() Q_DECL_OVERRIDE;
  void paintGL() Q_DECL_OVERRIDE;
  void resizeGL(int width, int height) Q_DECL_OVERRIDE;
  void mousePressEvent(QMouseEvent *event) Q_DECL_OVERRIDE;
  void mouseMoveEvent(QMouseEvent *event) Q_DECL_OVERRIDE;
  
private slots:
  
private:
};

#endif // GLWIDGET_H

