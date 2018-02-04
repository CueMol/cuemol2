// -*-Mode: C++;-*-
//
// Light-weight viewer module
//

#include <common.h>

#include "lwview.hpp"

#include <qsys/RendererFactory.hpp>
#include <qsys/StreamManager.hpp>
#include "LWRenderer.hpp"
#include "QdfLWObjReader.hpp"
#ifndef QM_BUILD_LW
#  include "QdfLWObjWriter.hpp"
#endif

extern void lwview_regClasses();
extern void lwview_unregClasses();

namespace lwview {

  using qsys::RendererFactory;
  using qsys::StreamManager;

  bool init()
  {
    lwview_regClasses();
    QdfLWObjReader::regClass();
#ifndef QM_BUILD_LW
    QdfLWObjWriter::regClass();
#endif

    // register renderers
    RendererFactory *pRF = RendererFactory::getInstance();
    pRF->regist<LWRenderer>();

    // register IO handlers
    StreamManager *pSM = StreamManager::getInstance();
    pSM->registWriter<QdfLWObjReader>();
#ifndef QM_BUILD_LW
    pSM->registWriter<QdfLWObjWriter>();
#endif

    MB_DPRINTLN("lwview init: OK");
    return true;
  }

  void fini()
  {
    lwview_unregClasses();

    MB_DPRINTLN("lwview fini: OK");
  }

}

