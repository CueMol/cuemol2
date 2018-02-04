// -*-Mode: C++;-*-
//
// Molecular symmetry module
//  module loader/common definitions
//

#include <common.h>

#include "symm.hpp"
#include "SymOpDB.hpp"
#include "PDBCryst1Handler.hpp"
#include <modules/molstr/PDBFileReader.hpp>
#include "UnitCellRenderer.hpp"
#include "SymmRenderer.hpp"

extern void symm_regClasses();
extern void symm_unregClasses();

#include <qsys/RendererFactory.hpp>

#include <qsys/StreamManager.hpp>

namespace symm {

using qsys::RendererFactory;
using qsys::StreamManager;

bool init()
{
  symm_regClasses();
  
  // register renderers
  RendererFactory *pRF = RendererFactory::getInstance();
  pRF->regist<SymmRenderer>();
  pRF->regist<UnitCellRenderer>();

  StreamManager *pSM = StreamManager::getInstance();
  // pSM->registReader<CCP4MapReader>();

  // register symmetry read/write handler
  molstr::PDBFileReader::registerHandler(new PDBCryst1Handler);

  // initialize SymOpDB
  SymOpDB::init();

  //////////
  // Load symop.dat file

  SymOpDB *psymdb = SymOpDB::getInstance();
  psymdb->load();

  MB_DPRINTLN("symm init: OK");
  return true;
}

void fini()
{
  SymOpDB::fini();

  symm_unregClasses();

  MB_DPRINTLN("symm fini: OK");
}

}
