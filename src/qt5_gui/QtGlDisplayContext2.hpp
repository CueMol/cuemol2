// -*-Mode: C++;-*-
//
//  Qt5 GL display context implementation
//

#pragma once

#include <sysdep/OglDisplayContext.hpp>

#include "QtGlView2.hpp"
#include "qt5_gui.hpp"

namespace qt5_gui {

class QT5GUI_API QtGlDisplayContext2 : public sysdep::OglDisplayContext
{
private:
    QtGlView2 *m_pTargetView;

    void *m_pCtxt;
    void *m_pQtWidget;

public:
    QtGlDisplayContext2(void *pQtWidget);

    virtual ~QtGlDisplayContext2();

    virtual bool setCurrent();
    virtual bool isCurrent() const;

    ///////////////
    // system dependent methods

    void setup(void *pCtxt);
    void *getImpl() { return m_pCtxt; }
};

}  // namespace qt5_gui
