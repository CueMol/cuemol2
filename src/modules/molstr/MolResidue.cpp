// -*-Mode: C++;-*-
//
// Residue class
//
// $Id: MolResidue.cpp,v 1.14 2011/04/06 13:09:32 rishitani Exp $

#include <common.h>

#include "MolResidue.hpp"
#include "MolCoord.hpp"
#include "MolChain.hpp"

#include "ResiToppar.hpp"

#include <qsys/SceneManager.hpp>

using namespace molstr;

MolResidue::MolResidue()
{
  m_pTopology = NULL;
}

MolResidue::~MolResidue()
{
  //MB_DPRINTLN("Residue(%s:%d) %p destructing", m_name.c_str(), int(m_index), this);
  //MB_DPRINTLN("OK");
}

///////////////////////////////////////////////////////////////////////
// atom operations

int MolResidue::getAtomID(const LString &atomname, char confid /*= '\0'*/) const
{
  if (atomname.isEmpty()) return -1;

  // atom name with conf ID
  if (confid) {
    const LString encname = atomname + ":" + LString(confid);
    atomdata_t::const_iterator iter = m_atomData.find(encname);
    if (iter!=m_atomData.end())
      return iter->second;

    // check the canonical names
    {
      MolCoordPtr pmol = getParent();
      if (pmol.isnull())
        return -1;
      atomdata_t::const_iterator iter = m_atomData.begin();
      atomdata_t::const_iterator iend = m_atomData.end();
      for (; iter!=iend; ++iter) {
        const int aid = iter->second;
        if (aid<0) continue;
        MolAtomPtr pAtom = pmol->getAtom(aid);
        if (pAtom.isnull()) continue;
        LString cname = pAtom->getCName();
        if (cname.isEmpty()) continue;
        if (pAtom->getConfID()==confid &&
            atomname.equals(cname))
          return aid;
      }
    }

    // not found
    /*{
    MB_DPRINTLN("MolResid> atom %s not found in", encname.c_str());
      atomdata_t::const_iterator iter = m_atomData.begin();
      atomdata_t::const_iterator iend = m_atomData.end();
      for (; iter!=iend; ++iter) {
	MB_DPRINTLN("   %s (%d)", iter->first.c_str(), iter->second);
	}
	}*/
    return -1;
  }
  
  // atom name without conf ID
  {
    atomdata_t::const_iterator iter = m_atomData.find(atomname);
    if (iter!=m_atomData.end())
      return iter->second;
  }

  // ambigous matching with/without conf ID
  {
    MolCoordPtr pmol = getParent();
    if (pmol.isnull())
      return -1;

    atomdata_t::const_iterator iter = m_atomData.begin();
    atomdata_t::const_iterator iend = m_atomData.end();
    const LString prefix = atomname + ":";
    for (; iter!=iend; ++iter) {
      const LString &nm = iter->first;
      const int aid = iter->second;
      if (nm.equals(atomname) || nm.startsWith(prefix))
        return aid;

      // check the canonical names
      MolAtomPtr pAtom = pmol->getAtom(aid);
      LString cname = pAtom->getCName();
      if (!cname.isEmpty() && cname.equals(atomname))
        return aid;
    }
  }

  return -1;
}

bool MolResidue::appendAtom(MolAtomPtr pAtom)
{
  const LString &atomname = pAtom->getName();
  char confid = pAtom->getConfID();
  if (getAtomID(atomname, confid)>=0)
    return false;
  int atomid = pAtom->getID();

  // At first atom is non-bonded
  //  (bonded atoms will become bonded,
  //   after the topology to be applied)
  //pAtom->fBonded=false;
//  pAtom->resetBondCount();
  
  // MB_DPRINTLN("/%s/%s/", m_chain.c_str(), pAtom->getChainName().c_str());

  // check consistencies
  MB_ASSERT(pAtom->getParentUID()==m_molID);

  MB_ASSERT(m_name.equals(pAtom->getResName()));
  MB_ASSERT(pAtom->getResIndex()==getIndex());
  MB_ASSERT(m_chain.equals(pAtom->getChainName()));

  LString encname = atomname;
  if (confid)
    encname = atomname + ":" + LString(confid);

  m_atomData.set(encname, atomid);
  return true;
}

bool MolResidue::removeAtom(const LString &atomname, char confid /*= '\0'*/)
{
  if (confid) {
    const LString encname = atomname + ":" + LString(confid);
    return m_atomData.remove(encname);
  }

  atomdata_t::iterator iter = m_atomData.begin();
  int ndel = 0;
  const LString prefix = atomname + ":";
  for (;iter!=m_atomData.end();) {
    const LString &nm = iter->first;
    if (nm.equals(atomname) || nm.startsWith(prefix)) {
      atomdata_t::iterator diter = iter;
      ++iter;
      m_atomData.erase(diter);
      ++ndel;
      continue;
    }
    ++iter;
  }

  if (ndel>0) return true;
  else return false;
}

void MolResidue::setName(const LString &name)
{
  m_name = name;
}

MolCoordPtr MolResidue::getParent() const
{
  qsys::ObjectPtr robj = qsys::SceneManager::getObjectS(m_molID);
  if (robj.isnull()) return MolCoordPtr();
  return MolCoordPtr(robj);
}

MolChainPtr MolResidue::getParentChain() const
{
  return getParent()->getChain(m_chain);
}

LString MolResidue::toString() const
{
  LString molname;
  MolCoordPtr pmol = getParent();
  if (!pmol.isnull())
    molname = pmol->getName();
  return molname+" "+m_chain+" "+m_index.toString()+" "+m_name;
}

MolAtomPtr MolResidue::getAtom(const LString &atomname, char confid /*= '\0'*/) const
{
  MolCoordPtr pmol = getParent();
  if (pmol.isnull()) return MolAtomPtr();

  int aid = getAtomID(atomname, confid);
  if (aid<0) return MolAtomPtr();

  return pmol->getAtom(aid);
}

int MolResidue::getAltConfs(const LString &atomname, std::set<char> &confs) const
{
  atomdata_t::const_iterator iter = m_atomData.begin();
  int nadd = 0;
  const LString prefix = atomname + ":";
  const int npflen = prefix.length();
  for (;iter!=m_atomData.end();++iter) {
    const LString &nm = iter->first;
    if (nm.startsWith(prefix)) {
      char confid = nm.getAt(npflen);
      confs.insert(confid);
      ++nadd;
    }
    /*else if (nm.equals(atomname)) {
      // XXX: ???
      confs.insert(0);
      ++nadd;
    }*/
  }

  return nadd;
}

//////////////////////////////////////////////////
// property

bool MolResidue::setPropStr(const char *propname, const LString &value)
{
  // return m_strProps.insert(StrPropTab::value_type(propname, value)).second;
  m_strProps.forceSet(propname, value);
  return true;
}

bool MolResidue::removePropStr(const char *propname)
{
  return m_strProps.remove(propname);
}

bool MolResidue::getPropStr(const char *propname, LString &value) const
{
  StrPropTab::const_iterator i = m_strProps.find(propname);
  if (m_strProps.end()!=i) {
    value = i->second;
    return true;
  }

  // search the topology's proptab
  if (m_pTopology!=NULL)
    return m_pTopology->getPropStr(propname, value);

  return false;
}

int MolResidue::getResPropNames(std::set<LString> &names) const
{
  StrPropTab::const_iterator i = m_strProps.begin();
  StrPropTab::const_iterator ie = m_strProps.end();
  
  int nnames = 0;
  for (; i!=ie; ++i) {
    names.insert(i->first);
    ++nnames;
  }

  return nnames;
}


LString MolResidue::getAtomsJSON() const
{
  MolCoordPtr pmol = getParent();
  if (pmol.isnull()) return LString("[]");

  LString rval = "[";

  AtomCursor iter = atomBegin();
  AtomCursor eiter = atomEnd();
  bool bcomma = false;
  for (; iter!=eiter; ++iter) {
    if (bcomma) rval += ",";
    MolAtomPtr pAtom = pmol->getAtom(iter->second);
    rval += "{";
    rval += "\"name\":\""+iter->first.escapeQuots()+"\",";
    rval += LString::format("\"id\":%d,", iter->second);
    rval += "\"elem\":\""+pAtom->getElementName().escapeQuots()+"\"";
    rval += "}";
    bcomma = true;
  }
  rval += "]";

  return rval;
}

qlib::LScrVector4D MolResidue::getPivotPosScr() const
{
  MolAtomPtr pAtom = getPivotAtom();
  if (!pAtom.isnull())
    return pAtom->getPosScr();

  MolCoordPtr pMol = getParent();

  qlib::Vector4D rval;
  int natoms = 0;
  AtomCursor iter = atomBegin();
  AtomCursor eiter = atomEnd();
  for (; iter!=eiter; ++iter) {
    MolAtomPtr pAtom = pMol->getAtom(iter->second);
    rval += pAtom->getPos();
    ++natoms;
  }

  if (natoms!=0)
    rval = rval.divide(natoms);
  
  return qlib::LScrVector4D(rval);
}


