
%Module qmqtgui

%Import QtGui/QtGuimod.sip
%Import QtOpenGL/QtOpenGLmod.sip

class QtMolWidget : QGLWidget
{

%TypeHeaderCode
#include "QtMolWidget_moc.hpp"
%End

public:
  explicit QtMolWidget(QWidget *parent /TransferThis/ = 0);

  void bind(int scid, int vwid);
  
private:
    QtMolWidget(const QtMolWidget &);
};

%ModuleHeaderCode
#include "qtgui.hpp"
namespace qtgui {
  QTGUI_API bool init();
}
%End

%PostInitialisationCode
  qtgui::init();
%End

