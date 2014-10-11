// -*-Mode: C++;-*-
// $Id: ResiToppar.cpp,v 1.8 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>

#include "ResiToppar.hpp"
#include "ParamDB.hpp"
#include <qlib/Utils.hpp>

using namespace molstr;

ResiToppar::ResiToppar()
{
  m_pMainChAtoms = NULL;
  m_pSideChAtoms = NULL;
}

ResiToppar::~ResiToppar()
{
  // MB_DPRINT("delete ResiToppar for %s\n", getName().c_str());
  std::for_each(m_bondList.begin(), m_bondList.end(), qlib::delete_ptr<TopBond *>());

//  while (m_anglList.size()>0) {
//    Angle *p = m_anglList.front();
//    m_anglList.pop_front();
//    delete p;
//  }

//  while (m_diheList.size()>0) {
//    Dihedral *p = m_diheList.front();
//    m_diheList.pop_front();
//    delete p;
//  }

  m_atomTab.clearAndDelete();

  std::for_each(m_rings.begin(), m_rings.end(), qlib::delete_ptr<RingAtomArray *>());

  if (m_pMainChAtoms!=NULL)
    delete m_pMainChAtoms;
  if (m_pSideChAtoms!=NULL)
    delete m_pSideChAtoms;
}

// add new atom
bool ResiToppar::addAtom(const LString &name, const LString &type,
                         double sig, double eps, double sig14, double eps14)
{
  if (getAtom(name)!=NULL)
    return false;
  
  TopAtom *pnew = MB_NEW TopAtom;
  pnew->name = name;
  pnew->type = type;
  pnew->sig = sig;
  pnew->eps = eps;
  pnew->sig14 = sig14;
  pnew->eps14 = eps14;

  pnew->elem = "";
  pnew->charge = 0.0;
  
  return m_atomTab.set(pnew->name, pnew);
  // return true;
}

// add new bond between a1 and a2
TopBond *ResiToppar::addBond(const LString &a1name, const LString &a2name,
                             double kf, double r0)
{
  TopAtom *a1 = getAtom(a1name);
  if (a1==NULL)
    return NULL;

  TopAtom *a2 = getAtom(a2name);
  if (a2==NULL)
    return NULL;

  if (getBond(a1, a2)!=NULL)
    return NULL;

  TopBond *pnew = MB_NEW TopBond;
  pnew->a1 = a1;
  pnew->a2 = a2;
  pnew->kf = kf;
  pnew->r0 = r0;
  pnew->esd = 0;
  m_bondList.push_back(pnew);

  //a1->b.push_back(pnew);
  //a2->b.push_back(pnew);

  return pnew;
}

// get bond obj between two atom obj a1 and a2
TopBond *ResiToppar::getBond(TopAtom *a1, TopAtom *a2) const
{
/*
  std::list<TopBond *>::const_iterator iter1 = a1->b.begin();
  std::list<TopBond *>::const_iterator iter2 = a2->b.begin();

  for ( ; iter1!=a1->b.end(); iter1++) {
    for ( ; iter2!=a2->b.end(); iter2++) {
      if (*iter1==*iter2)
	return *iter1;
    }
  }
  return NULL;
*/
  return getBond(a1->name, a2->name);
}

TopBond *ResiToppar::getBond(const LString &id1,
                             const LString &id2) const
{
  BOOST_FOREACH(const BondList::value_type &elem, m_bondList) {
    if (elem->a1->name.equals(id1) &&
	elem->a2->name.equals(id2))
      return elem;
    if (elem->a1->name.equals(id2) &&
	elem->a2->name.equals(id1))
      return elem;
  }

  return NULL;
}

bool ResiToppar::addPivotAtom(const LString &pivname)
{
//  const char *propname = "pivot_atom";
//  Atom *pa = getAtom(pivname);
//  if (pa==NULL)
//    return false;

  m_pivAtom = pivname;
  return true;
}

LString ResiToppar::getPivotAtom() const
{
  return m_pivAtom;
}

void ResiToppar::addRing(const std::list<LString> &rmembs)
{
  int nsize = rmembs.size();
  if (nsize<=0)
    return;
  
  int i=0;
  RingAtomArray *tags = MB_NEW RingAtomArray(nsize);

  std::list<LString>::const_iterator iter = rmembs.begin();
  for ( ; iter!=rmembs.end(); iter++, i++) {
    tags->at(i) = *iter;
    // MB_DPRINT("%s ", tags->at(i).c_str());
  }
  // MB_DPRINTLN("");
  m_rings.push_back(tags);
}

const ResiToppar::RingAtomArray *ResiToppar::getRing(int ith)
{
  if (ith<0 || ith>=m_rings.size())
    return NULL;

  RingSet::const_iterator iter = m_rings.begin();
  for (; ith>0; iter++,ith--) ;

  return *iter;
}

int ResiToppar::getRingCount() const
{
  int nring;
  nring = m_rings.size();
  return nring;
}

///////////////////

void ResiToppar::addSideCh(const std::list<LString> &rmembs)
{
  if (m_pSideChAtoms==NULL)
    m_pSideChAtoms = MB_NEW std::vector<LString>(rmembs.size());

  std::list<LString>::const_iterator iter = rmembs.begin();
  std::list<LString>::const_iterator end = rmembs.end();
  for (int i=0; iter!=end; ++iter, ++i)
    m_pSideChAtoms->at(i) = *iter;
  
}

void ResiToppar::addMainCh(const std::list<LString> &rmembs)
{
  if (m_pMainChAtoms==NULL)
    m_pMainChAtoms = MB_NEW std::vector<LString>(rmembs.size());

  std::list<LString>::const_iterator iter = rmembs.begin();
  std::list<LString>::const_iterator end = rmembs.end();
  for (int i=0; iter!=end; ++iter, ++i)
    m_pMainChAtoms->at(i) = *iter;
}

bool ResiToppar::isSideCh(const LString &aname) const
{
  // if undefined, all atom is main chain atom
  if (m_pSideChAtoms==NULL)
    return false;

  std::vector<LString>::const_iterator iter =
    std::find(m_pSideChAtoms->begin(), m_pSideChAtoms->end(), aname);
  if (iter==m_pSideChAtoms->end())
    return false;

  return true;
}

bool ResiToppar::isMainCh(const LString &aname) const
{
  // if undefined, all atom is main chain atom
  if (m_pMainChAtoms==NULL)
    return true;

  std::vector<LString>::const_iterator iter =
    std::find(m_pMainChAtoms->begin(), m_pMainChAtoms->end(), aname);
  if (iter==m_pMainChAtoms->end())
    return false;

  return true;
}

void ResiToppar::dump() const
{
  MB_DPRINTLN("ResiToppar id=%s {", getName().c_str());
  BOOST_FOREACH(const AtomTab::value_type &elem, m_atomTab) {
    TopAtom *pAtom = elem.second;
    MB_DPRINTLN("  atom id=%s, type=%s, elem=%s, chg=%f",
		elem.first.c_str(),
		pAtom->type.c_str(),
		pAtom->elem.c_str(),
		pAtom->charge);
  }

  BOOST_FOREACH(const AtomAliasTab::value_type &elem, m_atomAliasTab) {
    MB_DPRINTLN("  atomalias %s --> %s",
		elem.first.c_str(),
		elem.second.c_str());
  }

  BOOST_FOREACH(const BondList::value_type &elem, m_bondList) {
    const TopBond *pBond = elem;
    MB_DPRINTLN("  bond id1=%s, id2=%s, type=%d, length=%f, esd=%f",
		pBond->a1->name.c_str(),
		pBond->a2->name.c_str(),
		pBond->type,
		pBond->r0,
		pBond->esd);
  }

  MB_DPRINTLN("}");
}

/// Get atom obj by name (resolving aliases)
TopAtom *ResiToppar::getAtom(const LString &name) const
{
  TopAtom *pA = m_atomTab.get(name);
  if (pA!=NULL)
    return pA;

  // try to resolve alias name
  AtomAliasTab::const_iterator iter = m_atomAliasTab.find(name);
  if (iter==m_atomAliasTab.end()) return NULL;
  LString cname = iter->second;

  //MB_DPRINTLN("TopoDB::get() resolved alias %s for %s",
  //key.c_str(), cname.c_str());

  return m_atomTab.get(cname);
}

