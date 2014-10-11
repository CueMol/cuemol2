// -*-Mode: C++;-*-
//
// Color definition compiler
//
// $Id: ColCompiler.cpp,v 1.2 2011/04/10 10:46:09 rishitani Exp $

#include <common.h>

#include "ColCompiler.hpp"
#include "SolidColor.hpp"
#include "NamedColor.hpp"
#include "MolColorRef.hpp"
//#include "StyleMgr.hpp"
#include <qlib/LChar.hpp>

using namespace gfx;
using qlib::LChar;

SINGLETON_BASE_IMPL(ColCompiler);

int colparse();

ColCompiler::ColCompiler()
{
}

ColCompiler::~ColCompiler()
{
}

int ColCompiler::yyparse_wrapper()
{
  int res;
  try {
    res = colparse();
  }
  catch (const qlib::LException &e) {
    //LOG_DPRINTLN("Error at line %d: %s", qs::gpcg->getLineNo(), e.getMsg().c_str());
    return -1;
  }
  return res;
}

/// Compile color definition
AbstractColor *ColCompiler::compile(const LString &cmd)
{
  resetScannerState();
  resetParserState();
  m_alpha = 1.0;
  m_material = LString();

  char *porig = m_sbuf = LChar::dup(cmd.c_str());
  m_nsize = LChar::length(porig);

  if (yyparse_wrapper()!=0) {
    LOG_DPRINTLN("ColCompiler> compile error: \"%s\"", cmd.c_str());
    delete [] porig;
    return NULL;
  }

  // MB_DPRINTLN("Col compilation OK.");

  delete [] porig;

  AbstractColor *pRet = NULL;
  switch (m_nMode) {
  case CC_MODE_NAMED: {

    //StyleMgr *pSM = StyleMgr::getInstance();
    //qlib::uid_t ctxt = pSM->getContextID();
    //if (ctxt==qlib::invalid_uid) {
    //MB_DPRINTLN("CC> Named color %s created outside context", m_name.c_str());
    //}
    //pRet = new NamedColor(m_name, ctxt);

    // New impl (2011/4): context ID is resolved in NamedColor
    pRet = MB_NEW NamedColor(m_name);
    break;
  }

  case CC_MODE_RGB:
    pRet = MB_NEW SolidColor(m_vecval.x(), m_vecval.y(), m_vecval.z(), m_alpha);
    break;

  case CC_MODE_RGBHEX: {
    SolidColor *pSRet = MB_NEW SolidColor(m_nRGBHex);
    pSRet->setAlpha(m_alpha);
    pRet = pSRet;
    break;
  }

  case CC_MODE_HSB: {
    pRet = SolidColor::createRawHSB(m_vecval.x()/360.0, m_vecval.y(), m_vecval.z(), m_alpha);
    break;
  }

  case CC_MODE_MOLCOL: {
    pRet = MB_NEW MolColorRef();
  }

  case CC_MODE_CMYK:
    break;
  default:
    break;
  }

  if (pRet==NULL) return pRet;

  {
    qlib::MapTable<LString>::const_iterator iter = m_defs.begin();
    qlib::MapTable<LString>::const_iterator eiter = m_defs.end();
    for (; iter!=eiter; ++iter) {
      const LString &key = iter->first;
      if (!pRet->hasWritableProperty(key))
	continue;
      qlib::LVariant var(iter->second);
      if (!pRet->setProperty(key, var)) {
	LOG_DPRINTLN("CC> ERROR!!, cannot set color modifier (%s, %s)", key.c_str(), iter->second.c_str());
	continue;
      }
    }
  }

  m_defs.clear();
  return pRet;
}

int ColCompiler::feedInput(char *buf, int nmax)
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

