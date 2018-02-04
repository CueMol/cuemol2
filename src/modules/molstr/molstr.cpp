//
// Molecular structure module
//  module loader/common impl
//
// $Id: molstr.cpp,v 1.21 2011/04/03 14:10:05 rishitani Exp $
//

#include <common.h>

// #include <qlib/LDebug.hpp>
#include <qsys/StreamManager.hpp>
#include <qsys/RendererFactory.hpp>
#include "molstr.hpp"
#include "ElemSym.hpp"
#include "PDBFileReader.hpp"
#include "PDBFileWriter.hpp"
#include "QdfPdbReader.hpp"
#include "SimpleRenderer.hpp"
#include "TopparManager.hpp"
#include "SelCompiler.hpp"
#include "TraceRenderer.hpp"
#include "NameLabelRenderer.hpp"
#include "SelectionRenderer.hpp"
#include "SelCacheMgr.hpp"
#include "QdfMolWriter.hpp"
#include "QdfMolReader.hpp"

extern void molstr_regClasses();
extern void molstr_unregClasses();

using qsys::StreamManager;
using qsys::RendererFactory;

namespace molstr {

qlib::LString ResidIndex::toString() const
{
  if (second!='\0')
    return LString::format("%d%c", first, second);
  else
    return LString::format("%d", first);
}

ResidIndex ResidIndex::fromString(const LString &str_ind)
{
  int i, nlen = str_ind.length();
  int num;
  const char *sbuf = str_ind.c_str();

  for (i=nlen-1; i>=0; i--) {
    if (::isdigit(sbuf[i]))
      break;
  }
  ++i;

  if (!str_ind.substr(0, i).toInt(&num)) {
    LString msg = LString::format("ResidIndex.fromString: cannot convert str(%s) to resid index.", str_ind.c_str());
    MB_THROW(qlib::IllegalArgumentException, msg);
    return ResidIndex();
  }
  
  //for (i=0; i<nlen; ++i)
  //if (!::isdigit(sbuf[i]))
  //break;
  //if (!str_ind.substr(0, i+1).toInt(&num)) {
  //MB_THROW(qlib::IllegalArgumentException, str_ind);
  //return ResidIndex();
  //}

  if (i>=nlen)
    return ResidIndex(num);
  
  return ResidIndex(num, str_ind.getAt(i));
}

bool init()
{
  molstr_regClasses();
  QdfMolWriter::regClass();
  QdfMolReader::regClass();

  ElemSym::init();
  SelCompiler::init();
  TopparManager::init();

  // for external record handler registrer
  PDBFileReader::init();
  QdfPdbReader::init();
  
  TopparManager::getInstance()->load();
  
  StreamManager *pSM = StreamManager::getInstance();
  pSM->registReader<PDBFileReader>();
  pSM->registWriter<PDBFileWriter>();
  pSM->registReader<QdfPdbReader>();
  pSM->registWriter<QdfMolWriter>();
  pSM->registReader<QdfMolReader>();
  
  RendererFactory *pRF = RendererFactory::getInstance();
  pRF->regist<SimpleRenderer>();
  pRF->regist<TraceRenderer>();
  pRF->regist<NameLabelRenderer>();
  pRF->regist<SelectionRenderer>();
  
  SelCacheMgr::init();

  MB_DPRINTLN("molstr init: OK");
  return true;
}

void fini()
{
  SelCacheMgr::fini();

  // for external record handler registrer
  PDBFileReader::fini();
  QdfPdbReader::fini();

  TopparManager::fini();
  SelCompiler::fini();
  ElemSym::fini();

  // PDBFileReader::unregClass();
  QdfMolWriter::unregClass();
  QdfMolReader::unregClass();
  molstr_unregClasses();
  
  MB_DPRINTLN("molstr fini: OK");
}

}
