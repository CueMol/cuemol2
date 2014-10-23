// -*-Mode: C++;-*-
//
// PSE loader module
//

#include <common.h>

#include "pseread.hpp"

#include <qsys/RendererFactory.hpp>
#include <qsys/StreamManager.hpp>
#include "PSEFileReader.hpp"

extern void pseread_regClasses();
extern void pseread_unregClasses();

namespace pseread {

  using qsys::RendererFactory;
  using qsys::StreamManager;

  bool init()
  {
    pseread_regClasses();

    // register IO handlers
    StreamManager *pSM = StreamManager::getInstance();
    pSM->registWriter<PSEFileReader>();

    MB_DPRINTLN("pseread init: OK");
    return true;
  }

  void fini()
  {
    // pseread_unregClasses();

    MB_DPRINTLN("pseread fini: OK");
  }

}

