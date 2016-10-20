// -*-Mode: C++;-*-
//
// Molecular parameter/topology  module
//
// $Id: TopparManager.cpp,v 1.9 2011/04/03 11:11:06 rishitani Exp $

#include <common.h>

#include "TopparManager.hpp"

#include "ParamDB.hpp"
#include "TopoDB.hpp"
#include "CnsParFile.hpp"
#include "XMLTopparFile.hpp"
#include "MolAtom.hpp"
#include <qsys/SysConfig.hpp>

using namespace molstr;
using qsys::SysConfig;

SINGLETON_BASE_IMPL(TopparManager);

TopparManager::TopparManager()
{
  // create parameter dictionary
  m_pParamDB = MB_NEW ParamDB();

  // create residue topology/parameter dictionary
  m_pTopoDB = MB_NEW TopoDB();

}

TopparManager::~TopparManager()
{
  if (m_pParamDB!=NULL)
    delete m_pParamDB;

  if (m_pTopoDB!=NULL)
    delete m_pTopoDB;

}

bool TopparManager::readPrmTop(const char *fname, const char *filetype)
{
  if (LString(filetype).equals("cns")) {
    // attach params obj to CNSIO obj
    CnsParFile cnsio;
    cnsio.attach(m_pParamDB, m_pTopoDB);
    
    // read CNS parameter file
    if (!cnsio.read(fname))
      return false;
    
    LOG_DPRINTLN("Toppar> CNS format top/par file \"%s\" is loaded.", fname);
    return true;
  }
  else if (LString(filetype).equals("xml")) {
    LOG_DPRINTLN("Toppar> Loading XML format top/par file \"%s\"...", fname);

    XMLTopparFile pario;
    pario.attach(m_pParamDB, m_pTopoDB);
    
    if (!pario.read(fname))
      return false;
    
    return true;
  }
  else {
    MB_DPRINTLN("Toppar> unknown format \"%s\"", filetype);
    return false;
  }
}

ResiToppar *TopparManager::getResiToppar(const LString &resnam)
{
  return m_pTopoDB->get(resnam);
}

ResiToppar *TopparManager::createResiToppar(const LString &resnam)
{
  ResiToppar *pNewTop = MB_NEW ResiToppar();
  pNewTop->setName(resnam);
  m_pTopoDB->put(pNewTop);
  return pNewTop;
}

/*
bool TopparManager::searchNonbPar(const LString &atom,
                                 double &eps, double &sig,
                                 double &eps14, double &sig14) const
{
  return m_pParamDB->searchNonbPar(atom,
                                   eps, sig,
                                   eps14, sig14);
}
*/

/////////////////////////////////////////////////////

/** module initialization */
bool TopparManager::load()
{
  SysConfig *pconf = SysConfig::getInstance();
  SysConfig::Section *psec = pconf->getSection("toppar");
  bool bOK = false;
  if (psec!=NULL) {
    SysConfig::const_iterator iter = psec->begin();
    iter=psec->findName(iter, "toppar_file");
    for (; iter!=psec->end(); iter=psec->findName(++iter, "toppar_file")) {
      SysConfig::Section *pchild = *iter;
      LString val = pchild->getStringData();
      if (val.isEmpty()) continue;;

      int cpos = val.indexOf(':');
      if (cpos<0) continue;
      LString type = val.substr(0, cpos);
      LString fnam = val.substr(cpos+1);
      fnam = pconf->convPathName(fnam);

      /*if (!fnam.startsWith(MB_PATH_SEPARATOR)) {
        LString config_dir = pconf->get("config_dir");
        fnam = config_dir + MB_PATH_SEPARATOR + fnam;
      }*/
      
      if (readPrmTop(fnam, type))
        bOK = true;
    }
  }

  if (!bOK) {
    //
    // read from default directory with default type/filename
    //
    LString type("cns");
    LString fnam;

    for ( ;; ) {
      fnam = "queptl.prm";
      if (!readPrmTop(fnam, type))
        break;

      fnam = "queptl.top";
      if (!readPrmTop(fnam, type))
        break;

      fnam = "queptl.lin";
      if (!readPrmTop(fnam, type))
        break;

      return true;
    }
    LOG_DPRINTLN("Toppar> warning: no mol topology/parameter files is loaded.");
  }

  // m_pTopoDB->dump();
  return true;
}

namespace {

bool checkImpl(const LString &rname, const LString &key, const LString &avalue)
{
  TopoDB *pDB = TopparManager::getInstance()->getTopoDB();

  // Resolve alias name
  ResiToppar *pTop = pDB->get(rname);
  if (pTop==NULL) return false;

  if (avalue.equals(pTop->getType()))
    return true;

  // check type rprop (back compat)
  LString value;
  if (pTop->getPropStr("type", value) &&
      value.equals(avalue))
    return true;
    
  return false;
}

}

//static
bool TopparManager::isAminoAcid(const LString &rname)
{
  return checkImpl(rname, "type", "prot");
}

//static
bool TopparManager::isNuclAcid(const LString &rname)
{
  return checkImpl(rname, "type", "nucl");
}

namespace {
double elemBasedVdw(int eleid)
{
  switch (eleid) {
  case ElemSym::H:
    return 1.2;

  case ElemSym::C:
    return 1.7;

  case ElemSym::N:
    return 1.55;
    
  case ElemSym::O:
    return 1.52;
    
  case ElemSym::S:
    return 1.8;
    
  case ElemSym::P:
    return 1.8;
    
  default:
    return 1.7;
  }
}
}

double TopparManager::getVdwRadius(MolAtomPtr pAtom, bool bExplH)
{
  LString resn = pAtom->getResName();
  
  TopoDB *pDB = getTopoDB();

  // Resolve alias name
  ResiToppar *pTop = pDB->get(resn);
  if (pTop==NULL)
    return elemBasedVdw(pAtom->getElement());

  LString aname = pAtom->getName();
  
  TopAtom *pTA = pTop->getAtom(aname);
  if (pTA==NULL)
    return elemBasedVdw(pAtom->getElement());

  LString atype = pTA->type;

  ParamDB *pPDB = getParamDB();
  param::AtomVal *pPA = pPDB->getAtom(atype);
  if (pPA==NULL)
    return elemBasedVdw(pAtom->getElement());

  if (bExplH)
    return pPA->vdwr;

  if (pPA->vdwhr > 0.0)
    return pPA->vdwhr;

  return pPA->vdwr;
}

namespace {
bool getChargeImpl(ResiToppar *pTop, const LString &id, const LString &ns,
                  bool bExplH, double &rval)
{
  LString ns_aname = id;
  if (!ns.isEmpty())
    ns_aname = ns + ":" + id;

  TopAtom *pTA = pTop->getAtom(ns_aname);
  if (pTA==NULL)
    return false;

  if (bExplH) {
    rval = pTA->charge;
    return true;
  }

  double prot_chg = 0.0;
  double val;
  ResiToppar::BondList *pBL= pTop->getBondList();
  BOOST_FOREACH (const TopBond *pBond,
                 *pBL) {
    if (pBond->a1->name.equals(id)) {
      if (pBond->a2->elem.equals("H")) {
        if (getChargeImpl(pTop, pBond->a2->name, ns, true, val))
          prot_chg += val;
      }
    }
    else if (pBond->a2->name.equals(id)) {
      if (pBond->a1->elem.equals("H")) {
        if (getChargeImpl(pTop, pBond->a1->name, ns, true, val))
          prot_chg += val;
      }
    }
  }

  rval = pTA->charge + prot_chg;
  return true;
}
}

bool TopparManager::getCharge(MolAtomPtr pAtom, bool bExplH,
                              const LString &ns, double &rval)
{
  LString resn = pAtom->getResName();
  
  TopoDB *pDB = getTopoDB();

  // Resolve alias name
  ResiToppar *pTop = pDB->get(resn);
  if (pTop==NULL)
    return false;

  LString aname = pAtom->getName();
  return getChargeImpl(pTop, aname, ns, bExplH, rval);
  
/*
  LString ns_aname = aname;
  if (!ns.isEmpty())
    ns_aname = ns + ":" + aname;

  TopAtom *pTA = pTop->getAtom(ns_aname);
  if (pTA==NULL)
    return false;
  
  if (bExplH) {
    rval = pTA->charge;
    return true;
  }

  double prot_chg = 0.0;
  ResiToppar::BondList *pBL= pTop->getBondList();
  BOOST_FOREACH (const TopBond *pBond,
                 *pBL) {
    if (pBond->a1==pTA) {
      if (pBond->a2->elem.equals("H"))
        prot_chg += pBond->a2->charge;
    }
    else if (pBond->a2==pTA) {
      if (pBond->a1->elem.equals("H"))
        prot_chg += pBond->a1->charge;
    }
  }

  rval = pTA->charge + prot_chg;
  return true;
*/
}

