// -*-Mode: C++;-*-
//
// Molecular parameter/topology  module
//
// $Id: SelCompiler.cpp,v 1.8 2011/04/10 10:48:09 rishitani Exp $

#include <common.h>

#include "SelCompiler.hpp"
#include "SelNodes.hpp"
#include <qlib/LChar.hpp>
#include "qsys/style/StyleMgr.hpp"

using namespace molstr;
using qlib::LChar;

SINGLETON_BASE_IMPL(SelCompiler);

int yyparse();

SelCompiler::SelCompiler()
{
  m_pBuilt = NULL;
}

SelCompiler::~SelCompiler()
{
  if (m_pBuilt!=NULL)
    delete m_pBuilt;
}

int SelCompiler::yyparse_wrapper()
{
  // m_bStart = true;
  int res;
  try {
    res = yyparse();
    //MB_DPRINTLN("yyparse() returned %d", res);
  }
  catch (const qlib::LException &e) {
    //LOG_DPRINTLN("Error at line %d: %s", qs::gpcg->getLineNo(), e.getMsg().c_str());
    return -1;
  }
  return res;
}

/// Compile select expression
SelSuperNode *SelCompiler::compile(const LString &cmd)
{
  // MB_ASSERT(s_pLock!=NULL);
  // s_pLock->lock();

  resetScannerState();
  resetParserState();

  char *porig = m_sbuf = LChar::dup(cmd.c_str());
  m_nsize = LChar::length(porig);

  if (yyparse_wrapper()!=0) {
    LOG_DPRINTLN("SelCompiler> compile error: \"%s\"", cmd.c_str());
    // s_pLock->unlock();
    delete [] porig;
    if (m_pBuilt!=NULL)
      delete m_pBuilt;
    m_pBuilt = NULL;
    return NULL;
  }

  //MB_DPRINTLN("compilation OK.");

  delete [] porig;
  SelSuperNode *pRet = m_pBuilt;
  m_pBuilt = NULL;

  return pRet;
}

int SelCompiler::yyInput(char *buf, int nmax)
{
  int result;

  if (m_nsize<=0 || nmax<=0)
    return 0;
    
  if (nmax>m_nsize)
    nmax = m_nsize;
    
  memcpy(buf, m_sbuf, nmax);
    
  m_nsize -= nmax;
  m_sbuf += nmax;
  result = nmax;

  return result;
}

void SelCompiler::evalNode(SelSuperNode *pNode)
{
  MB_ASSERT(m_pBuilt==NULL);
  m_pBuilt = pNode;
}

//static
bool SelCompiler::checkNameRef(const char *name)
{
  qsys::StyleMgr *pPM = qsys::StyleMgr::getInstance();
  qlib::uid_t nScopeID = pPM->getContextID();

  LString value = pPM->getStrData("sel", name, nScopeID);
  if (value.isEmpty()) {
      LString msg = LString::format("undefined reference %s", name);  
      LOG_DPRINTLN(msg.c_str());
      getInstance()->setErrorMsg(msg);
      return false;
  }

  return true;
}

