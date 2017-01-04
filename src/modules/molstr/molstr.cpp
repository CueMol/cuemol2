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
#include "TopparManager.hpp"
#include "SelCompiler.hpp"
#include "TraceRenderer.hpp"
#include "NameLabelRenderer.hpp"
#include "SelectionRenderer.hpp"
#include "SelCacheMgr.hpp"
#include "QdfMolWriter.hpp"
#include "QdfMolReader.hpp"

#ifdef USE_OPENGL
#  include "SimpleRendGLSL.hpp"
#else
#  include "SimpleRenderer.hpp"
#endif

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
  const char *sbuf = str_ind.c_str();
  for (i=0; i<nlen; ++i)
    if (!::isdigit(sbuf[i]))
      break;
  int num;
  if (!str_ind.substr(0, i+1).toInt(&num)) {
    MB_THROW(qlib::IllegalArgumentException, str_ind);
    return ResidIndex();
  }
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

#ifdef USE_OPENGL
  pRF->regist<SimpleRendGLSL>();
#else
  pRF->regist<SimpleRenderer>();
#endif

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

  TopparManager::fini();
  
  SelCompiler::fini();
  ElemSym::fini();
  
  // for external record handler registrer
  PDBFileReader::fini();
  QdfPdbReader::fini();

  // PDBFileReader::unregClass();
  // molstr_unregClasses();
  
  MB_DPRINTLN("molstr fini: OK");
}

}
