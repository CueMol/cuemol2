//
// XRBR: RMI bridge module
//

#include <common.h>
#include <qlib/LString.hpp>

#include "xrbr.hpp"
// #include "XmlRpcMgr.hpp"
#include "RMIMgr.hpp"

extern void xrbr_regClasses();

namespace xrbr {

  bool init()
  {
    xrbr_regClasses();
    // XmlRpcMgr::init();
    RMIMgr::init();
    return true;
  }

  void fini()
  {
    //XmlRpcMgr::fini();
    RMIMgr::fini();
  }

}
