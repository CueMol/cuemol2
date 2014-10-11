//
// molecular surface module
//  module loader/common impl
//
// $Id: surface.cpp,v 1.8 2011/04/03 08:08:46 rishitani Exp $
//

#include <common.h>

#include "surface.hpp"

#include <qsys/RendererFactory.hpp>
#include "MolSurfRenderer.hpp"
#include "MSMSFileReader.hpp"
#include "OpenDXPotReader.hpp"
#include "XYZRFileWriter.hpp"
#include "PQRFileWriter.hpp"
#include "QdfSurfWriter.hpp"
#include "QdfSurfReader.hpp"
#include "QdfPotWriter.hpp"
#include "QdfPotReader.hpp"

//#include "MS2TestRenderer.hpp"
#include "DirectSurfRenderer.hpp"

#include <qsys/StreamManager.hpp>

extern void surface_regClasses();
extern void surface_unregClasses();

namespace surface {

bool init()
{
  surface_regClasses();
  QdfSurfWriter::regClass();
  QdfSurfReader::regClass();
  QdfPotWriter::regClass();
  QdfPotReader::regClass();
  

  qsys::RendererFactory *pRF = qsys::RendererFactory::getInstance();
  pRF->regist<MolSurfRenderer>();

  //pRF->regist<MS2TestRenderer>();
  pRF->regist<DirectSurfRenderer>();

  qsys::StreamManager *pSM = qsys::StreamManager::getInstance();
  pSM->registReader<MSMSFileReader>();
  pSM->registReader<OpenDXPotReader>();
  pSM->registWriter<XYZRFileWriter>();
  pSM->registWriter<PQRFileWriter>();
  pSM->registWriter<QdfSurfWriter>();
  pSM->registReader<QdfSurfReader>();
  pSM->registWriter<QdfPotWriter>();
  pSM->registReader<QdfPotReader>();


  MB_DPRINTLN("surface init: OK");
  return true;
}

void fini()
{
  // PDBFileReader::unregClass();
  // surface_unregClasses();
  
  MB_DPRINTLN("surface fini: OK");
}

}

