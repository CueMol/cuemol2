// -*-Mode: C++;-*-
//
// Object extension data
//

#ifndef QSYS_OBJEXTDATA_HPP_INCLUDE_
#define QSYS_OBJEXTDATA_HPP_INCLUDE_

#include "qsys.hpp"

#include <qlib/LScrObjects.hpp>

namespace qsys {

using qlib::LString;

class QSYS_API ObjExtData :
  public qlib::LSimpleCopyScrObject
{
  // MC_SCRIPTABLE;
  // MC_CLONEABLE;

public:
  ObjExtData();
  ObjExtData(const ObjExtData &arg);
  virtual ~ObjExtData();

};

}

#endif

