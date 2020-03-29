//
// Scene panel
//

#pragma once

#include "qt5_gui.hpp"
#include <QDockWidget>

class QtScenePanel : public QDockWidget
{
  Q_OBJECT;

public:
  QtScenePanel(QWidget *parent = nullptr);
  ~QtScenePanel();

  void createWidgets();


};
