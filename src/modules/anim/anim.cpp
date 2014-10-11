// -*-Mode: C++;-*-
//
// Animation module
//

#include <common.h>

#include "anim.hpp"

#include <qlib/LDebug.hpp>
// #include <qsys/RendererFactory.hpp>
// #include <qsys/StreamManager.hpp>

extern void anim_regClasses();
extern void anim_unregClasses();

namespace anim {

  //using qsys::RendererFactory;
  //using qsys::StreamManager;

  bool init()
  {
    anim_regClasses();

    MB_DPRINTLN("anim init: OK");
    return true;
  }

  void fini()
  {
    // anim_unregClasses();

    MB_DPRINTLN("anim fini: OK");
  }

}

