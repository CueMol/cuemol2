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

  m_pXformMat = NULL;

  // m_charge = 0.0;
  // m_radius = 0.0;
}

/// copy ctor
MolAtom::MolAtom(const MolAtom &src)
{
  // Do not copy parent Mol ID
  // (copied obj does not belong to the original one's mol)
  // m_molID = src.m_molID;
  m_molID = qlib::invalid_uid;

  m_name = src.m_name;
  m_canonName = src.m_canonName;
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
  
  m_pXformMat = NULL;
  if (src.m_pXformMat != NULL) {
    m_pXformMat = new qlib::Matrix4D(*src.m_pXformMat);
  }
}

/// dtor
MolAtom::~MolAtom()
{
  // m_props.clearAndDelete();
  if (m_paib!=NULL) delete [] m_paib;

  if (m_pXformMat!=NULL) delete m_pXformMat;
}

////////////////////////////////////////

Vector4D MolAtom::getPos() const
{
  Vector4D p = m_pos;
  if (m_pXformMat==NULL) {
    return p;
  }
  else {
    p.w() = 1.0;
    m_pXformMat->xform4D(p);
    return p;
  }
}

/// Set Atom position
void MolAtom::setPos(const Vector4D &vec)
{
  if (m_pXformMat==NULL) {
    m_pos = vec;
  }
  else {
    MB_THROW(qlib::RuntimeException, "Cannot set atom position to the xformMat applied atom/mol");
  }
}

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

LString MolAtom::toString() const
{
  return formatMsg();
}

bool MolAtom::isBonded(int aid) const
{
  BOOST_FOREACH(MolBond *pelem, m_bonded) {
    if (pelem->getAtom1()==aid)
      return true;
    if (pelem->getAtom2()==aid)
      return true;
  }
  return false;
}

MolBond *MolAtom::getBond(int aid) const
{
  BOOST_FOREACH(MolBond *pelem, m_bonded) {
    if (pelem->getAtom1()==aid)
      return pelem;
    if (pelem->getAtom2()==aid)
      return pelem;
  }
  return NULL;
}

bool MolAtom::addBond(MolBond *pBond)
{
  int aid1 = pBond->getAtom1();
  int aid2 = pBond->getAtom2();

/*  if (aid1<0 || aid1>10000) {
    MB_ASSERT(false);
  }
  if (aid2<0 || aid2>10000) {
    MB_ASSERT(false);
  }*/

  if (aid1==getID()) {
    if (isBonded(aid2))
      return false;
  }
  else if (aid2==getID()) {
    if (isBonded(aid1))
      return false;
  }
  else {
    MB_ASSERT(false);
  }

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


void MolAtom::setXformMatrix(const qlib::Matrix4D &m)
{
  resetXformMatrix();
  if (m.isIdent())
    return;
  m_pXformMat = MB_NEW qlib::Matrix4D(m);
}

void MolAtom::resetXformMatrix()
{
  if (m_pXformMat!=NULL) {
    delete m_pXformMat;
    m_pXformMat = NULL;
  }
}


double MolAtom::calcDihe(const MolAtomPtr &pA2,const MolAtomPtr &pA3,const MolAtomPtr &pA4)
{
  Vector4D pos1 = getPos();
  Vector4D pos2 = pA2->getPos();
  Vector4D pos3 = pA3->getPos();
  Vector4D pos4 = pA4->getPos();

  return Vector4D::torsion(pos1, pos2, pos3, pos4);
}


////////////
#if 0

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

#endif

