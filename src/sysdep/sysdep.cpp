//
//  system-dependent module routines
//

#include <common.h>
#include "sysdep.hpp"

#include "OglProgObjMgr.hpp"

using namespace sysdep;

namespace sysdep {

  bool init()
  {
    OglProgObjMgr::init();
    return true;
  }

  void fini()
  {
    OglProgObjMgr::fini();
  }

}
