// -*-Mode: C++;-*-
//
// dictionary class of residue topology
//
// $Id: TopoDB.cpp,v 1.14 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>

#include "TopoDB.hpp"

#include "ResiToppar.hpp"
#include "ResiPatch.hpp"
#include "MolResidue.hpp"
#include "MolCoord.hpp"

using namespace molstr;

TopoDB::~TopoDB()
{
  m_residTab.clearAndDelete();
  m_patchTab.clearAndDelete();
}

////////////////////////////////////////////////////////////

ResiPatch *TopoDB::patchPrefixGet(char prefix, const LString &key) const
{
  LString pfxname = LString(prefix) + key.c_str();
  return m_patchTab.get(pfxname.c_str());
}

/** register new linkage between two residues */
bool TopoDB::addLinkByName(const LString &prev_res, char prev_ch,
			     const LString &next_res, char next_ch,
			     const LString &link_name)
{
  //MB_DPRINT("addLinkByName search %s\n",plusname.c_str());
  ResiPatch *pPatch = patchPrefixGet('+', link_name);
  if (pPatch==NULL)
    return false;

  // process the case in that prev and next is inverted
  if (pPatch->getPrevPrefix()!=prev_ch ||
      pPatch->getNextPrefix()!=next_ch) {

    pPatch = patchPrefixGet('-', link_name);

    if (pPatch->getPrevPrefix()!=prev_ch ||
        pPatch->getNextPrefix()!=next_ch)
      return false;
  }

  Linkage link;
  link.prev = prev_ch;
  link.next = next_ch;
  link.patch_name = pPatch->getName();

  LString key(prev_res.c_str());
  key.append(':');
  key.append(next_res.c_str());

  //MB_DPRINT("linkage LINK register %s\n",key.c_str());
  return m_linkDict.set(key, link);
  //return true;
}

ResiPatch *TopoDB::findLink(MolResiduePtr pPrev, MolResiduePtr pNext)
{
  ResiPatch *pRet = NULL;

  pRet = findLinkImpl2(pPrev, pNext, true);
  if (pRet!=NULL)
    return pRet;

  // try old version
  LString resid1 = pPrev->getName();
  LString resid2 = pNext->getName();
  pRet = findLinkImpl(resid1, resid2);
  
  return pRet;
}

ResiPatch *TopoDB::findLinkImpl(const LString &aPrevRes, const LString &aNextRes)
{
  // Resolve alias name
  ResiToppar *pTopPrev = get(aPrevRes);
  ResiToppar *pTopNext = get(aNextRes);
  if (pTopPrev==NULL || pTopNext==NULL) return NULL;
  const LString prev_res = pTopPrev->getName();
  const LString next_res = pTopNext->getName();

  // At first, find the complete matching entry
  LString key(prev_res.c_str());
  key.append(':');
  key.append(next_res.c_str());

  //MB_DPRINT("linkage find %s\n",key.c_str());

  if (m_linkDict.containsKey(key)) {
    Linkage link = m_linkDict.get(key);
    return patchGet(link.patch_name);
  }

  // find the (prev==wildcard) case
  key = LString("*:") + next_res.c_str();
  if (m_linkDict.containsKey(key)) {
    //MB_DPRINT("linkage find %s\n",key.c_str());
    Linkage link = m_linkDict.get(key);
    return patchGet(link.patch_name);
  }

  // find the (next==wildcard) case
  key = LString(prev_res.c_str()) + ":*";
  if (m_linkDict.containsKey(key)) {
    //MB_DPRINT("linkage find %s\n",key.c_str());
    Linkage link = m_linkDict.get(key);
    return patchGet(link.patch_name);
  }

  return NULL;
}

/// Add new linkage between two residues
bool TopoDB::addLink2(const LString &resid1, const LString &group1,
		      const LString &resid2, const LString &group2,
		      const LString &patch_name)
{
  Link2 value;
  value.resid1 = resid1;
  value.resid2 = resid2;
  value.group1 = group1;
  value.group2 = group2;
  value.patch_name = patch_name;
  m_link2Data.push_back(value);
  return true;
}

/// Search ResiLink obj
ResiPatch *TopoDB::findLinkImpl2(MolResiduePtr pPrev, MolResiduePtr pNext,
                                 bool bPoly)
{
  MolCoordPtr pmol = pPrev->getParent();

  LString resid1 = pPrev->getName();
  LString resid2 = pNext->getName();

  // Resolve alias name
  ResiToppar *pTopPrev = get(resid1);
  ResiToppar *pTopNext = get(resid2);

  if (pTopPrev==NULL || pTopNext==NULL)
    return NULL; // --> link is not found

  LString group1 = pTopPrev->getType();
  LString group2 = pTopNext->getType();

  //////////

  int nMaxScore = 0;
  LString maxName;

  BOOST_FOREACH(const Link2 &elem, m_link2Data) {
    //MB_DPRINTLN("Link2 (%s:%s,%s:%s) --> %s",
    //elem.resid1.c_str(), elem.group1.c_str(),
    //elem.resid2.c_str(), elem.group2.c_str(),
    //elem.patch_name.c_str());

    ResiPatch *pPatch = patchGet(elem.patch_name);
    if (pPatch==NULL) {
      MB_ASSERT(pPatch!=NULL);
      continue; // ignore invalid patch entry
    }
    
    if (bPoly) {
      // check polymer links only
      if (!pPatch->isPolyLink())
        continue;
    }

    int score = 0;

    if (elem.resid1.isEmpty()) {
      // wildcard/any match
      score += 1;
    }
    else if (elem.resid1.equalsIgnoreCase(resid1)) {
      // spec match
      score += 3;
    }
    else {
      // nomatch
      continue;
    }

    if (elem.group1.isEmpty()) {
      // group wildcard/any match
      score += 1;
    }
    else if (elem.group1.equalsIgnoreCase(group1)) {
      // group spec match
      score += 2;
    }
    else {
      // nomatch
      continue;
    }

    ////

    if (elem.resid2.isEmpty()) {
      // wildcard/any match
      score += 1;
    }
    else if (elem.resid2.equalsIgnoreCase(resid2)) {
      // spec match
      score += 3;
    }
    else {
      // nomatch
      continue;
    }

    if (elem.group2.isEmpty()) {
      // group wildcard/any match
      score += 1;
    }
    else if (elem.group2.equalsIgnoreCase(group2)) {
      // group spec match
      score += 2;
    }
    else {
      // nomatch
      continue;
    }

    ////
    // check existence/distance of atoms

    // get bond obj in the linkage
    TopBond* pBond = pPatch->getLinkBond();
    if (pBond==NULL)
      continue; // ERROR!!
    
    const char *a1nm = pBond->a1name.c_str();
    const char *a2nm = pBond->a2name.c_str();
    int aid1 = pPrev->getAtomID(a1nm);
    int aid2 = pNext->getAtomID(a2nm);
    if (aid1<0 ||aid2<0) {
      // nomatch
      continue;
    }

    if (!pmol.isnull()) {
      // bonding tolerance: 10.0 sigma
      const double dtol = 10.0;
      const double dl = pBond->r0;
      const double esd = pBond->esd;
      // const double dlow = dl - esd*dtol;
      const double dhigh = dl + esd*dtol;
      
      MolAtomPtr pAtom1 = pmol->getAtom(aid1);
      MolAtomPtr pAtom2 = pmol->getAtom(aid2);
      if (pAtom1.isnull() || pAtom2.isnull())
        continue;
      double d = ( (pAtom1->getPos()) - (pAtom2->getPos()) ).length();
      if (d>dhigh)
        continue;
    }
    
    ////

    if (nMaxScore<score) {
      nMaxScore = score;
      maxName = elem.patch_name;
    }

  }

  //MB_DPRINTLN("Link2 find: max score=%d, name=%s", nMaxScore, maxName.c_str());

  if (maxName.isEmpty())
    return NULL; // not found

  return patchGet(maxName);
}



////

ResiToppar *TopoDB::get(const LString &key, qlib::uid_t uid /*= qlib::invalid_uid*/) const
{
  ResiToppar *pTop = m_residTab.get(key);
  if (pTop!=NULL)
    return pTop;

  // try to resolve alias name
  AliasTab::const_iterator iter = m_aliasTab.find(key);
  if (iter!=m_aliasTab.end()) {
    LString cname = iter->second;
    //MB_DPRINTLN("TopoDB::get() resolved alias %s for %s",
    //key.c_str(), cname.c_str());
    pTop = m_residTab.get(cname);
    if (pTop!=NULL)
      return pTop;
  }
  
  // try UID-decorated name
  LString dkey = getUIDDecName(key, uid);
  pTop = m_residTab.get(dkey);
  if (pTop!=NULL)
    return pTop;

  // ATTN: UID-decorated alias name cannot occur current implementation

  // Not found!!
  return NULL;
}


void TopoDB::dump() const
{

  BOOST_FOREACH(const ResidTab::value_type &elem, m_residTab) {
    elem.second->dump();
  }

  BOOST_FOREACH(const AliasTab::value_type &elem, m_aliasTab) {
    MB_DPRINTLN("ResAlias %s --> %s", elem.first.c_str(), elem.second.c_str());
  }

  BOOST_FOREACH(const Link2 &elem, m_link2Data) {
    MB_DPRINTLN("Link2 (%s:%s,%s:%s) --> %s",
		elem.resid1.c_str(), elem.group1.c_str(),
		elem.resid2.c_str(), elem.group2.c_str(),
		elem.patch_name.c_str());
  }

}

