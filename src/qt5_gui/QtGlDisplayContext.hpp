// -*-Mode: C++;-*-
//
//  Qt5 GL display context implementation
//

#pragma once

#include "qt5_gui.hpp"
#include <sysdep/OglDisplayContext.hpp>
#include "QtGlView.hpp"

namespace qt5_gui {

  class QT5GUI_API QtGlDisplayContext : public sysdep::OglDisplayContext
  {
  private:

    QtGlView *m_pTargetView;

    void *m_pCtxt;

  public:
    // QtGlDisplayContext(int sceneid, QtGlView *pView, void *pCtxt);
    QtGlDisplayContext();

    virtual ~QtGlDisplayContext();

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    // virtual qsys::View *getTargetView() const {
    //   return m_pTargetView;
    // }

    ///////////////
    // system dependent methods

    void setup(void *pCtxt);
    // bool attach(HDC hdc, HGLRC hGL);
    // HGLRC getHGLRC() const { return m_hGlrc; }
  };

}


