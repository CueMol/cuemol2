// -*-Mode: C++;-*-
//
// DrawObj: base class of UI drawing object
//

#pragma once

#include "qsys.hpp"

#include <qlib/ObjectManager.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/LPropEvent.hpp>
#include <qlib/mcutils.hpp>
#include <gfx/DrawAttrArray.hpp>

namespace gfx {
class DisplayContext;
}

namespace qsys {

using gfx::DisplayContext;
using qlib::LString;

///////////

class QSYS_API DrawObj : public qlib::LNoCopyScrObject, public qlib::LUIDObject
//  public qlib::LPropEventListener
{
    MC_SCRIPTABLE;

private:
    bool m_bEnabled;

public:
public:
    DrawObj();
    virtual ~DrawObj();

    virtual void display(DisplayContext *pdc) = 0;
    virtual void display2D(DisplayContext *pdc) = 0;

    bool isEnabled() const
    {
        return m_bEnabled;
    }
    virtual void setEnabled(bool f);
};

}  // namespace qsys
