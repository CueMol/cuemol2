//
// XRBR: XML-RPC bridge module
//

#include <common.h>
#include <qlib/LString.hpp>

#include "xrbr.hpp"
#include "XmlRpcMgr.hpp"

namespace xrbr {

  bool init()
  {
    XmlRpcManager::init();
  }

  void fini()
  {
    XmlRpcManager::fini();
  }

  void serverRun()
  {
    XmlRpcManager *pMgr = XmlRpcManager::getInstance();
    pMgr->run();
  }

}
