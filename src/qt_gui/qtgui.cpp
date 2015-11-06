// -*-Mode: C++;-*-
//
//  QtGL dependent molecular viewer implementation
//

#include <common.h>

#include "qtgui.hpp"

#include "QtglView.hpp"

#include <qlib/LString.hpp>
#include <qlib/EventManager.hpp>

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

  class QtTimerImpl : public qlib::TimerImpl
  {
  private:

  public:
    QtTimerImpl()
    {
    }
    
    virtual ~QtTimerImpl()
    {
    }

    virtual qlib::time_value getCurrentTime()
    {
      qlib::time_value tval = 0;
      return tval;
    }

    virtual void start(qlib::time_value nperiod)
    {
    }

    virtual void stop()
    {
    }

    //static void timerCallbackFunc(nsITimer *aTimer, void *aClosure);
  };

}

namespace qtgui
{

  bool init()
  {
    qsys::View::setViewFactory(new QtglViewFactory);

    qlib::EventManager::getInstance()->initTimer(new QtTimerImpl);
    
    return true;
  }

  void fini()
  {
  }

}

