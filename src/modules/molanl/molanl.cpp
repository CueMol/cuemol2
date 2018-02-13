//
// Biomolecule analysis module
//  module loader/common impl
//
// $Id: molanl.cpp,v 1.2 2010/11/16 14:54:04 rishitani Exp $
//

#include <common.h>
#include <qlib/LDebug.hpp>

#include "molanl.hpp"
//#include "MapMeshRenderer.hpp"

extern void molanl_regClasses();
extern void molanl_unregClasses();

//#include <qsys/RendererFactory.hpp>
//using qsys::RendererFactory;
//#include <qsys/StreamManager.hpp>
//using qsys::StreamManager;

namespace molanl {

bool init()
{
  molanl_regClasses();

  MB_DPRINTLN("molanl init: OK");
  return true;
}

void fini()
{
  molanl_unregClasses();
  
  MB_DPRINTLN("molanl fini: OK");
}

}

