// -*-Mode: C++;-*-
//
//  QtGL dependent molecular viewer implementation
//

#include <common.h>

#include "qtgui.hpp"

#include "QtglView.hpp"

namespace {
  class QtglViewFactory : public qsys::ViewFactory
  {
  public:
    QtglViewFactory() {}
    virtual ~QtglViewFactory() {}
    virtual qsys::View* create() {
      return new qtgui::QtglView();
    }
  };
}

namespace qtgui
{

  bool init()
  {
    qsys::View::setViewFactory(new QtglViewFactory);

    return true;
  }

  void fini()
  {
  }

}

