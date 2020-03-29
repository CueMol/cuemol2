//
// Scene panel
//

#pragma once

#include "qt5_gui.hpp"
#include <QDockWidget>

class QtMolStructPanel : public QDockWidget
{
  Q_OBJECT;

public:
  QtMolStructPanel(QWidget *parent = nullptr);
  ~QtMolStructPanel();

  void createWidgets();


};
