// -*-Mode: C++;-*-
//
// $Id: MolAtom.cpp,v 1.9 2011/04/06 13:09:32 rishitani Exp $
//

#include "common.h"
#include <qlib/LChar.hpp>

#include "MolAtom.hpp"
#include "MolCoord.hpp"
#include "MolResidue.hpp"
#include "MolChain.hpp"
// #include "atomobj_inst.hpp"
#include <qsys/SceneManager.hpp>
// using qlib::LChar;
using namespace molstr;

/** default ctor */
MolAtom::MolAtom()
{

  m_molID = qlib::invalid_uid;
  m_nresid = 0;
  m_nID = -1;
  m_elem = ElemSym::XX;
  m_paib = NULL;
  
  // no = AtomSym::C;
  m_bfac = 1.0;
  m_occ = 1.0;

  m_confid = '\0';

  // m_charge = 0.0;
  // m_radius = 0.0;
}

/** copy ctor */
MolAtom::MolAtom(const MolAtom &src)
{
  // Do not copy parent Mol ID
  // (copied obj does not belong to the original one's mol)
  // m_molID = src.m_molID;
  m_molID = qlib::invalid_uid;

  m_name = src.m_name;
  m_chain = src.m_chain;
  m_resname = src.m_resname;
  m_nresid = src.m_nresid;
  m_nID = src.m_nID;

  m_elem = src.m_elem;
  m_pos = src.m_pos;
  m_bfac = src.m_bfac;
  m_occ = src.m_occ;
  m_confid = src.m_confid;

  // m_charge = src.m_charge;
  // m_radius = src.m_radius;

  m_paib = NULL;

  if (src.m_paib!=NULL) {
    m_paib = MB_NEW double[6];
    for (int i=0; i<6; ++i)
      m_paib[i] = src.m_paib[i];
  }
  
}

/** dtor */
MolAtom::~MolAtom()
{
  // m_props.clearAndDelete();
  if (m_paib!=NULL) delete [] m_paib;
}

////////////////////////////////////////

MolCoordPtr MolAtom::getParent() const
{
  qsys::ObjectPtr robj = qsys::SceneManager::getObjectS(m_molID);
  if (robj.isnull()) return MolCoordPtr();
  return MolCoordPtr(robj);
}

MolChainPtr MolAtom::getParentChain() const
{
  return getParent()->getChain(m_chain);
}

MolResiduePtr MolAtom::getParentResidue() const
{
  return getParent()->getResidue(m_chain, m_nresid);
}

LString MolAtom::getResIndexScr() const
{
  return m_nresid.toString();
}

LString MolAtom::formatMsg() const
{
  LString msg =
    getChainName()+" "+
      getResName()+" "+
        getResIndex().toString()+" "+
          getName();
  char confid = getConfID();
  if (confid)
    msg += LString(":")+confid;

  return msg;
}

bool MolAtom::isBonded(int aid) const
{
  BOOST_FOREACH(MolBond *pelem, m_bonded) {
    if (pelem->getAtom2()==aid)
      return true;
  }
  return false;
}

MolBond *MolAtom::getBond(int aid) const
{
  BOOST_FOREACH(MolBond *pelem, m_bonded) {
    if (pelem->getAtom2()==aid)
      return pelem;
  }
  return NULL;
}

bool MolAtom::addBond(MolBond *pBond)
{
  MB_ASSERT(pBond->getAtom1()==getID());
  int aid = pBond->getAtom2();
  if (isBonded(aid))
    return false;

  if (m_bonded.capacity()<=m_bonded.size())
    m_bonded.reserve(m_bonded.size()+4);

  m_bonded.push_back(pBond);
  return true;
}

bool MolAtom::removeBond(MolBond *pBond)
{
  BondList::iterator i = std::find(m_bonded.begin(), m_bonded.end(), pBond);
  if (i==m_bonded.end())
    return false; // not found
  m_bonded.erase(i);
  return true;
}

bool MolAtom::getAtomProp(const LString &propnm, qlib::LVariant &presult) const
{
  PropTab::const_iterator i = m_props.find(propnm);
  if (m_props.end()==i)
    return false; // not found!!

  presult = i->second;
  return true;
}

bool MolAtom::setAtomProp(const LString &propnm, const qlib::LVariant &pvalue)
{
  m_props.forceSet(propnm, pvalue);
  return true;
}

bool MolAtom::removeAtomProp(const LString &propnm)
{
  return m_props.remove(propnm);
}

int MolAtom::getAtomPropNames(std::set<LString> &names) const
{
  PropTab::const_iterator i = m_props.begin();
  PropTab::const_iterator ie = m_props.end();
  
  int nnames = 0;
  for (; i!=ie; ++i) {
    names.insert(i->first);
    ++nnames;
  }

  return nnames;
}

LString MolAtom::getPropTypeName(const LString &propnm) const
{
  PropTab::const_iterator i = m_props.find(propnm);
  if (m_props.end()==i)
    return LString(); // not found!!

  return i->second.getTypeString();
}


int MolAtom::getAtomPropInt(const LString &propnm) const
{
  qlib::LVariant var;
  if (!getAtomProp(propnm, var)) {
    MB_THROW(qlib::RuntimeException, "getAtomPropInt() prop not found");
    return 0;
  }
  if (!var.isInt()) {
    MB_THROW(qlib::RuntimeException, "getAtomPropInt() prop type error");
    return 0;
  }
  return var.getIntValue();
}

void MolAtom::setAtomPropInt(const LString &propnm, int value)
{
  qlib::LVariant var;
  var.setIntValue(value);
  setAtomProp(propnm, var);
}
    
double MolAtom::getAtomPropReal(const LString &propnm) const
{
  qlib::LVariant var;
  if (!getAtomProp(propnm, var)) {
    MB_THROW(qlib::RuntimeException, "getAtomPropInt() prop not found");
    return 0;
  }
  if (!var.isReal()) {
    MB_THROW(qlib::RuntimeException, "getAtomPropInt() prop type error");
    return 0;
  }
  return var.getRealValue();
}

void MolAtom::setAtomPropReal(const LString &propnm, double value)
{
  qlib::LVariant var;
  var.setRealValue(value);
  setAtomProp(propnm, var);
}

LString MolAtom::getAtomPropStr(const LString &propnm) const
{
  qlib::LVariant var;
  if (!getAtomProp(propnm, var)) {
    MB_THROW(qlib::RuntimeException, "getAtomPropStr() prop not found");
    return 0;
  }
  if (!var.isString()) {
    MB_THROW(qlib::RuntimeException, "getAtomPropStr() prop type error");
    return 0;
  }
  return var.getStringValue();
}

void MolAtom::setAtomPropStr(const LString &propnm, const LString &value)
{
  qlib::LVariant var;
  var.setStringValue(value);
  setAtomProp(propnm, var);
}

