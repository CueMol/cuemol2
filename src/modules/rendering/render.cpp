// -*-Mode: C++;-*-
//
// Scene rendering module
//

#include <common.h>

#include "render.hpp"

#include "MqoSceneExporter.hpp"
#include "PngSceneExporter.hpp"
#include "PovSceneExporter.hpp"
#include "WbpSceneExporter.hpp"
#include "StlSceneExporter.hpp"
#include "LuxRendSceneExporter.hpp"

#include <qsys/StreamManager.hpp>

#ifndef QM_BUILD_LW
#endif

extern void render_regClasses();
extern void render_unregClasses();

namespace render {

  using qsys::StreamManager;

  bool init()
  {
    render_regClasses();

#ifndef QM_BUILD_LW
#endif

    // register IO handlers
    StreamManager *pSM = StreamManager::getInstance();
    pSM->registWriter<MqoSceneExporter>();
    pSM->registWriter<PngSceneExporter>();
    pSM->registWriter<PovSceneExporter>();
    pSM->registWriter<WbpSceneExporter>();
    pSM->registWriter<StlSceneExporter>();
    pSM->registWriter<LuxRendSceneExporter>();

#ifndef QM_BUILD_LW
#endif

    MB_DPRINTLN("render init: OK");
    return true;
  }

  void fini()
  {
    render_unregClasses();

    MB_DPRINTLN("render fini: OK");
  }

}

