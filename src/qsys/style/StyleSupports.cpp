// -*-Mode: C++;-*-
//
// Style supporting class utilities
//

#include <common.h>

#include "StyleSheet.hpp"
#include "StyleSupports.hpp"
//#include "StyleMgr.hpp"

#include <qlib/LPropEvent.hpp>
#include <qlib/ObjectManager.hpp>

using namespace qsys;

StyleSupports::~StyleSupports()
{
}

//////////////////////////////////////////////////
// style event class

StyleEvent::~StyleEvent()
{
}

qlib::LCloneableObject *StyleEvent::clone() const
{
  return MB_NEW StyleEvent(*this);
}

//////////////////////////////////////////////////
// other utility classes

bool StyleResetPropImpl::resetProperty(const LString &propnm,
                                       qlib::LDefSupportScrObjBase *pThat)
{
  if (pThat->isPropDefault(propnm))
    // we do not have to do anything
    return true;

  ////////////
  // stylesheet resolution

  qlib::LVariant styleval;
  bool res = StyleSheet::resolve3(propnm, pThat, styleval);
  if (!res) {
    // stylesheet value is not found --> implement default behaviour
    return false; // caller should call super_t::resetProperty(propnm) to reset to default!!
  }

  ////////////
  // reset to the stylesheet value

  // event supports & record old value
  qlib::LPropEvent ev(propnm);
  {
    qlib::LVariant oldvalue;
    bool res = pThat->getPropertyImpl(propnm, oldvalue);
    if (res)
      ev.setOldValue(oldvalue);
  }
  ev.setNewDefault(true);

  // set default flag
  pThat->setDefaultPropFlag(propnm, true);

  // Overwrite the property with stylesheet's value
  pThat->setPropertyImpl(propnm, styleval);

  ////////////
  // postprocessing

  // fire event
  pThat->nodePropChgImpl(ev);

  return true;
  //return res;
}

