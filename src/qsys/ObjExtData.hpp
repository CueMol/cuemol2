// -*-Mode: C++;-*-
//
// Object extension data
//

#ifndef QSYS_OBJEXTDATA_HPP_INCLUDE_
#define QSYS_OBJEXTDATA_HPP_INCLUDE_

#include "qsys.hpp"

#include <qlib/LScrObjects.hpp>
#include <qlib/MapTable.hpp>

namespace qsys {

  using qlib::LString;

  class QSYS_API ObjExtData :
    public qlib::LSimpleCopyScrObject
  {
  public:
    ObjExtData();
    ObjExtData(const ObjExtData &arg);
    virtual ~ObjExtData();

    typedef qlib::MapTable<LString> DataTab;

    virtual void writeQdfData(DataTab &out);

    virtual void readQdfData(const DataTab &in);
  };

}

#endif

