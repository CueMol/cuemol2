//
// Crystallographic visualization module
//  module loader/common impl
//
// $Id: xtal.cpp,v 1.3 2011/01/03 16:47:05 rishitani Exp $
//

#include <common.h>

#include "xtal.hpp"
#include "MapMeshRenderer.hpp"
#include "MapSurfRenderer.hpp"
#include "CCP4MapReader.hpp"
#include "BrixMapReader.hpp"
#include "MTZ2MapReader.hpp"
#include "XplorMapReader.hpp"
#include "QdfDenMapWriter.hpp"
#include "QdfDenMapReader.hpp"

#ifdef USE_OPENGL
#  include "GLSLMapMeshRenderer.hpp"
#  include "GLSLMapVolRenderer.hpp"
#  include "GLSLMapMesh2Renderer.hpp"
#endif

extern void xtal_regClasses();
extern void xtal_unregClasses();

#include <qsys/RendererFactory.hpp>
using qsys::RendererFactory;

#include <qsys/StreamManager.hpp>
using qsys::StreamManager;

namespace xtal {

bool init()
{
  xtal_regClasses();
  CCP4MapReader::regClass();
  BrixMapReader::regClass();
  XplorMapReader::regClass();
  QdfDenMapWriter::regClass();
  QdfDenMapReader::regClass();
  
  RendererFactory *pRF = RendererFactory::getInstance();
  pRF->regist<MapMeshRenderer>();
  pRF->regist<MapSurfRenderer>();

#ifdef USE_OPENGL
  pRF->regist<GLSLMapVolRenderer>();
  pRF->regist<GLSLMapMeshRenderer>();
  pRF->regist<GLSLMapMesh2Renderer>();
#endif

  StreamManager *pSM = StreamManager::getInstance();
  pSM->registReader<CCP4MapReader>();
  pSM->registReader<BrixMapReader>();
  pSM->registReader<MTZ2MapReader>();
  pSM->registReader<XplorMapReader>();
  pSM->registWriter<QdfDenMapWriter>();
  pSM->registWriter<QdfDenMapReader>();

  MB_DPRINTLN("xtal init: OK");
  return true;
}

void fini()
{
  // PDBFileReader::unregClass();
  // xtal_unregClasses();
  
  MB_DPRINTLN("xtal fini: OK");
}

}
