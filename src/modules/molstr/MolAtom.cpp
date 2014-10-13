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

