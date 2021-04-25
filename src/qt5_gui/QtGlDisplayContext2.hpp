// -*-Mode: C++;-*-
//
//  Qt5 GL display context implementation
//

#pragma once

#include "qt5_gui.hpp"
#include <sysdep/OglDisplayContext.hpp>
#include "QtGlView2.hpp"

namespace qt5_gui {

  class QT5GUI_API QtGlDisplayContext2 : public sysdep::OglDisplayContext
  {
  private:

    QtGlView2 *m_pTargetView;

    void *m_pCtxt;

  public:
    QtGlDisplayContext2();

    virtual ~QtGlDisplayContext2();

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    ///////////////
    // system dependent methods

    void setup(void *pCtxt);
  };

}


