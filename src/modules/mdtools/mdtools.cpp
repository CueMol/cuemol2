// -*-Mode: C++;-*-
//
// Light-weight viewer module
//

#include <common.h>

#include "mdtools.hpp"

#include <qsys/RendererFactory.hpp>
#include <qsys/StreamManager.hpp>
#include "NAMDCoorReader.hpp"
#include "PsfReader.hpp"
#include "DCDTrajReader.hpp"
#include "GROFileReader.hpp"
#include "XTCTrajReader.hpp"

extern void mdtools_regClasses();
extern void mdtools_unregClasses();

namespace mdtools {

  using qsys::RendererFactory;
  using qsys::StreamManager;

  bool init()
  {
    mdtools_regClasses();

    // register IO handlers
    StreamManager *pSM = StreamManager::getInstance();
    pSM->registWriter<NAMDCoorReader>();
    pSM->registWriter<PsfReader>();
    pSM->registWriter<DCDTrajReader>();
    pSM->registWriter<GROFileReader>();
    pSM->registWriter<XTCTrajReader>();

    MB_DPRINTLN("mdtools init: OK");
    return true;
  }

  void fini()
  {
    mdtools_unregClasses();

    MB_DPRINTLN("mdtools fini: OK");
  }

}

