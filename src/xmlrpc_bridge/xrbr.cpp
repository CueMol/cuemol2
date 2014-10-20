//
// XRBR: XML-RPC bridge module
//

#include <common.h>
#include <qlib/LString.hpp>

#include "xrbr.hpp"
#include "XmlRpcMgr.hpp"

extern void xrbr_regClasses();

namespace xrbr {

  bool init()
  {
    xrbr_regClasses();
    XmlRpcMgr::init();
    return true;
  }

  void fini()
  {
    XmlRpcMgr::fini();
  }

  /*
  void serverRun()
  {
    XmlRpcMgr *pMgr = XmlRpcMgr::getInstance();
    pMgr->run();
  }
  */
}
