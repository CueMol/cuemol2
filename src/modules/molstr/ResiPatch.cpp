//
//
// $Id: ResiPatch.cpp,v 1.8 2011/03/29 11:03:44 rishitani Exp $

#include <common.h>

#include "ResiPatch.hpp"

using namespace molstr;

ResiPatch::ResiPatch()
     : m_fIsLink(false),
       m_prevCh(0),
       m_nextCh(0),
       m_pLinkBond(NULL),
       m_dLinkAtomDist(0.0),
       m_bPoly(false)
{
}

/// Copy ctor
ResiPatch::ResiPatch(const ResiPatch &arg)
  : qlib::NamedObject(arg),
    m_fIsLink(arg.m_fIsLink),
    m_prevCh(arg.m_prevCh),
    m_nextCh(arg.m_nextCh),
    m_dLinkAtomDist(arg.m_dLinkAtomDist),
    m_bPoly(arg.m_bPoly)
{
  // perform deep copy
  {
    AtomTab::const_iterator iter = arg.m_atomTab.begin();
    for ( ;iter!=arg.m_atomTab.end(); ++iter )
      m_atomTab.set(iter->first, MB_NEW TopAtom(*(iter->second)));
  }

  {
    BondList::const_iterator iter = arg.m_bondList.begin();
    for ( ;iter!=arg.m_bondList.end(); ++iter )
      m_bondList.push_back(MB_NEW TopBond(*(*iter)));
  }


  if (arg.m_pLinkBond!=NULL)
    m_pLinkBond = MB_NEW TopBond(*arg.m_pLinkBond);
  else
    m_pLinkBond = NULL;

  /*
  {
    AnglList::const_iterator iter = arg.m_anglList.begin();
    for ( ;iter!=arg.m_anglList.end(); ++iter )
      m_anglList.push_back(MB_NEW Angle(*(*iter)));
  }

  {
    TorsList::const_iterator iter = arg.m_torsList.begin();
    for ( ;iter!=arg.m_torsList.end(); ++iter )
      m_torsList.push_back(MB_NEW Torsion(*(*iter)));
  }
  */
}

ResiPatch::~ResiPatch()
{
  m_atomTab.clearAndDelete();

  // delete link items
  while (m_bondList.size()>0) {
    delete m_bondList.front();
    m_bondList.pop_front();
  }

  if (m_pLinkBond!=NULL)
    delete m_pLinkBond;

  /*
  while (m_anglList.size()>0) {
    delete m_anglList.front();
    m_anglList.pop_front();
  }

  while (m_torsList.size()>0) {
    delete m_torsList.front();
    m_torsList.pop_front();
  }
  */

}

// add new atom
bool ResiPatch::addAtom(const LString &name, const LString &type, int mode)
{
  TopAtom *pa = MB_NEW TopAtom();
  pa->mode = mode;
  pa->name = name;
  pa->type = type;
  return m_atomTab.set(name, pa);
}

// add new bond between a1 and a2
TopBond *ResiPatch::addBond(const LString &a1name, const LString &a2name, int mode)
{
  TopBond *pb = MB_NEW TopBond();
  pb->mode = mode;
  pb->a1name = a1name;
  pb->a2name = a2name;

  pb->r0 = pb->esd = 0.0;
  m_bondList.push_back(pb);

  return pb;
}

TopBond *ResiPatch::getBond(const LString &a1name, const LString &a2name) const
{
  BOOST_FOREACH(TopBond *pElem, m_bondList) {
    if (pElem->a1name.equalsIgnoreCase(a1name) &&
	pElem->a2name.equalsIgnoreCase(a2name))
      return pElem;
  }
  return NULL;
}

/*
// add new angle between a1, a2, and a3
bool ResiPatch::addAngle(const LString &a1name, const LString &a2name,
			 const LString &a3name, int mode)
{
  Angle *pb = MB_NEW Angle;
  pb->mode = mode;
  pb->atomi = a1name;
  pb->atomj = a2name;
  pb->atomk = a3name;
  m_anglList.push_back(pb);

  return true;
}

// add new torsion between a1, a2, a3, and a4
bool ResiPatch::addTors(const LString &a1name, const LString &a2name, 
                        const LString &a3name, const LString &a4name, 
                        int mode, bool bDihe)
{
  Torsion *pb = MB_NEW Torsion;
  pb->mode = mode;
  pb->bdihe = bDihe;
  pb->atomi = a1name;
  pb->atomj = a2name;
  pb->atomk = a3name;
  pb->atoml = a4name;
  m_torsList.push_back(pb);

  return true;
}
*/

// check whether this obj is link or patch
bool ResiPatch::checkLinkObj()
{
  //if (m_fIsLink) {
  //MB_DPRINTLN("checkLink must be called only ONCE !!");
  //return NULL;
  //}

  // check the bond num. (link must contain one 'add-bond' operation)
  BondList::const_iterator bi = m_bondList.begin();
  int nbondadd = 0;
  TopBond *pBond = NULL;
  for (; bi!=m_bondList.end(); ++bi) {
    pBond = *bi;
    if (pBond->mode==PATCH_ADD) {
      nbondadd++;
    }
  }

  if (pBond==NULL || nbondadd!=1) {
    m_fIsLink = false;
    return false;
  }

  // extract patch character from the bond
  char link1 = pBond->a1name[0];
  char link2 = pBond->a2name[0];

  // MB_DPRINT("ResiChkLinkObj *** bond 1 %c, %c\n", link1, link2);

  // check names of all the other atoms begins linkage characters
  //   ( --> if not, this object is not a link patch type)
  {
    AtomTab::const_iterator ai = m_atomTab.begin();
    for (; ai!=m_atomTab.end(); ++ai) {
      LString keyname = (*ai).first;
      TopAtom *pAtom = ai->second;
      // MB_DPRINT("  --> atom%p %s\n", pAtom, keyname.c_str());
      //if (pAtom->mode!=PATCH_MODIFY) {
      //delete pkeys;
      //return NULL;
      //}
      char ch = pAtom->name[0];
      if (ch!=link1 && ch!=link2) {
        m_fIsLink = false;
        return false;
      }
    }
  }

  // MB_DPRINT("link chars : %c, %c\n", link1, link2);

  m_fIsLink = true;
  m_prevCh = link1;
  m_nextCh = link2;
  m_pLinkBond = MB_NEW TopBond(*pBond);
  return true;
}

TopBond *ResiPatch::getLinkBond() const
{
  // new ff (xml) impl
  if (isPolyLink() && !m_bondList.empty()) {
    return m_bondList.front();
  }

  // old ff (cns) impl
  if (!m_fIsLink)
    return NULL;
  return m_pLinkBond;
}

// search atom
bool ResiPatch::searchAtom(const LString &name, int &mode, LString &type)
{
  TopAtom *pa = m_atomTab.get(name);
  if (pa==NULL)
    return false;

  mode = pa->mode;
  type = pa->type;
  return true;
}

double ResiPatch::getLinkDist() const
{
  if (!m_fIsLink)
    return -1.0;
  return m_dLinkAtomDist;
}

void ResiPatch::setLinkDist(double d)
{
  m_dLinkAtomDist = d;
}

