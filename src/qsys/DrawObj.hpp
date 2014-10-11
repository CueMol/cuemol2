// -*-Mode: C++;-*-
//
// DrawObj: base class of UI drawing object
//

#ifndef QSYS_DRAWINGOBJECT_HPP_INCLUDE_
#define QSYS_DRAWINGOBJECT_HPP_INCLUDE_

#include "qsys.hpp"

#include <qlib/ObjectManager.hpp>
#include <qlib/LScrObjects.hpp>
#include <qlib/LScrSmartPtr.hpp>
#include <qlib/LPropEvent.hpp>
#include <qlib/mcutils.hpp>

namespace gfx {
  class DisplayContext;
}

namespace qsys {

using qlib::LString;
using gfx::DisplayContext;

class QSYS_API DrawObj :
  public qlib::LNoCopyScrObject,
  public qlib::LUIDObject
//  public qlib::LPropEventListener
{
  MC_SCRIPTABLE;

private:
  bool m_bEnabled;

public:

  DrawObj();
  virtual ~DrawObj();

  virtual void display(DisplayContext *pdc) =0;
  virtual void display2D(DisplayContext *pdc) =0;

  bool isEnabled() const { return m_bEnabled; }
  virtual void setEnabled(bool f);

};

}

#endif

