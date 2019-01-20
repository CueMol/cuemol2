// -*-Mode: C++;-*-
//
// Molecular model coordinates class
//
// $Id: MolCoord.cpp,v 1.21 2011/05/02 14:51:29 rishitani Exp $

#include <common.h>

#include "MolCoord.hpp"

#include "MolChain.hpp"
#include "MolResidue.hpp"
#include "MolAtom.hpp"
#include <qsys/SceneManager.hpp>
#include "AtomIterator.hpp"

#include "QdfMolWriter.hpp"
#include "PDBFileWriter.hpp"

using namespace molstr;

MolCoord::MolCoord()
{
  resetAllProps();
  // m_pSel = SelectionPtr(MB_NEW SelCommand());

  // ([^\.]+)\.(\d+)(\w*)\.([^\.]+)(:[^\.]+)?
  m_reAid.setPattern("^([^\\.]+)\\.(\\d+)(\\w*)\\.([^\\.:]+)(:([^\\.]+))?$");
  //m_reAid.setPattern("([^\\.]+)\\.(\\d+)(\\w*)\\.([^\\.]+)");
}

MolCoord::~MolCoord()
{
  m_chains.clear();
  m_atomPool.clear();
  m_bondPool.clearAndDelete();
}

///////////////////////////////////////////////////////////

MolChainPtr MolCoord::getChain(const LString &chname) const
{
  ChainPool::const_iterator iter = m_chains.find(chname);
  if (iter==m_chains.end())
    return MolChainPtr();
  return iter->second;
}

bool MolCoord::appendChain(MolChainPtr pChain)
{
  return m_chains.insert(ChainPool::value_type(pChain->getName(), pChain)).second;
}

bool MolCoord::removeChain(const LString &chname)
{
  ChainPool::iterator iter = m_chains.find(chname);
  if (iter==m_chains.end())
    return false;
  m_chains.erase(iter);
  return true;
}

///////////////////////////////////////////////////////////

MolResiduePtr MolCoord::getResidue(const LString &chain, ResidIndex resid) const
{
  MolChainPtr pChain = getChain(chain);
  if (pChain.isnull())
    return MolResiduePtr();

  return pChain->getResidue(resid);
}

MolResiduePtr MolCoord::getResidScr(const LString &chain, const LString &sresid) const
{
  return getResidue(chain, ResidIndex::fromString(sresid));
}

MolAtomPtr MolCoord::getAtom(int atomid) const
{
  AtomPool::const_iterator iter = m_atomPool.find(atomid);
  if (iter==m_atomPool.end())
    return MolAtomPtr();
  return iter->second;
}

MolAtomPtr MolCoord::getAtom(const LString &chain, ResidIndex resid,
                             const LString &aname, char cConfID /*='\0'*/) const
{
  MolResiduePtr pResid = getResidue(chain, resid);
  if (pResid.isnull())
    return MolAtomPtr();

  int id = pResid->getAtomID(aname, cConfID);
  if (id<0) return MolAtomPtr();
  return getAtom(id);

  /*
  if (cConfID=='\0') {
    int id = pResid->getAtomID(aname);
    if (id<0) return MolAtomPtr();
    return getAtom(id);
  }
  else {
    LString key = aname + ":" + cConfID;
    int id = pResid->getAtomID(key);
    if (id<0) return MolAtomPtr();
    return getAtom(id);
  }
  */
}

MolAtomPtr MolCoord::getAtomScr(const LString &chain, const LString &sresid,
                                const LString &aname) const
{
  return getAtom(chain, ResidIndex::fromString(sresid), aname);
}

/// Convert aid to (persistent) string representation
LString MolCoord::toStrAID(int atomid) const
{
  MolAtomPtr pAtom = getAtom(atomid);
  if (pAtom.isnull()) return LString();
  
  LString value = LString::format("%s.%s.%s",
                                  pAtom->getChainName().c_str(),
                                  pAtom->getResIndex().toString().c_str(),
                                  pAtom->getName().c_str());
  
  char conf_id = pAtom->getConfID();
  if (conf_id)
    value += ":" + LString(conf_id);

  return value;
}

/// Convert from (persistent) string representation to aid
int MolCoord::fromStrAID(const LString &strid) const
{
  if (!m_reAid.match(strid)) {
    LOG_DPRINTLN("MolCoord> Invalid aid strid=%s (re match failed)", strid.c_str());
    return -1;
  }

  // text type aid
  int nsc = m_reAid.getSubstrCount();
  if (nsc<4) {
    LOG_DPRINTLN("MolCoord> Invalid aid strid=%s", strid.c_str());
    return -1;
  }
  //elem.setAtomID(-1);
  LString sChainName = m_reAid.getSubstr(1);
  LString sResInd = m_reAid.getSubstr(2);
  ResidIndex nResInd;
  if (!sResInd.toInt(&nResInd.first)) {
    LOG_DPRINTLN("MolCoord> Invalid aid resid value=%s", sResInd.c_str());
    return -1;
  }
  LString sInsCode = m_reAid.getSubstr(3);
  if (sInsCode.isEmpty())
    nResInd.second = '\0';
  else
    nResInd.second = sInsCode.getAt(0);
  LString sAtomName = m_reAid.getSubstr(4);
  char cAltLoc = '\0';
  if (nsc>6) {
    LString sAltLoc = m_reAid.getSubstr(6);
    if (!sAltLoc.isEmpty())
      cAltLoc = sAltLoc.getAt(0);
  }

  MolAtomPtr pAtom = getAtom(sChainName, nResInd, sAtomName, cAltLoc);
  if (pAtom.isnull()) {
    LOG_DPRINTLN("MolCoord> fromStrAID/ atom <%s %s %s %c> not found in %s",
		 sChainName.c_str(), nResInd.toString().c_str(), sAtomName.c_str(),
		 cAltLoc=='\0'?' ':cAltLoc,
		 getName().c_str());
    return -1;
  }

  return pAtom->getID();
}

///////////////////////////////////////////////////////////

int MolCoord::appendAtom(MolAtomPtr pAtom)
{
  pAtom->setParentUID(getUID());

  const LString &cname = pAtom->getChainName();
  const LString &rname = pAtom->getResName();
  const LString &aname = pAtom->getName();
  ResidIndex nresid = pAtom->getResIndex();
  
  if (cname.length()<=0 ||
      aname.length()<=0) {
    LString msg =
      LString::format("MolCoord> ERROR: appending atom with invalid properties"
		      " (c:'%s' rn:'%s' ri:'%s' an:'%s')",
                      cname.c_str(), rname.c_str(), nresid.toString().c_str(),
		      aname.c_str());
    MB_DPRINTLN(msg);
    MB_THROW(qlib::IllegalArgumentException, msg);
    return -1;
  }

  MolChainPtr pCh = getChain(cname);
  if (pCh.isnull()) {
    pCh = MolChainPtr(MB_NEW MolChain());
    pCh->setParentUID(getUID());
    pCh->setName(cname);
    appendChain(pCh);
  }

  MolResiduePtr pRes = pCh->getResidue(nresid);
  if (pRes.isnull()) {
    pRes = MolResiduePtr(MB_NEW MolResidue());
    pRes->setParentUID(getUID());
    pRes->setIndex(nresid);
    pRes->setName(rname);
    // pRes->setChainName(cname);
    pCh->appendResidue(pRes);
  }
  else {
    const LString &pre_rname = pRes->getName();
    if (!pre_rname.equals(rname)) {
      MB_DPRINTLN("MolCoord> ERROR: appending an atom (%s %s%s %s) with inconsistent residue (%s)",
                  cname.c_str(), rname.c_str(),
                  nresid.toString().c_str(), aname.c_str(),
                  pre_rname.c_str());
      // TO DO: throw exception (???)
      // This is often the case, so is not an exception.
      // return -1;
    }
  }
  
  //
  // Append to the atompool --> assign the atom ID
  //

  int atomid = m_atomPool.put(pAtom);
  if (atomid<0) {
    // This isn't fail in normal situation.
    MB_THROW(qlib::RuntimeException, "append to the atompool failed");
    return -1;
  }

  pAtom->setID(atomid);

  // MolResidue::appendAtom() must be called after setID(),
  // because MolResidue makes map from name to AID, which requires "AID".
  if (!pRes->appendAtom(pAtom)) {
    // This is often the case with malformed PDB files, so is not an exception.
    MB_DPRINTLN("MolCoord> ERROR: appending duplicated atom (%s %s%s %s)",
                cname.c_str(), rname.c_str(), nresid.toString().c_str(),
                aname.c_str());
    // Remove the mis-appended atom from the pool.
    m_atomPool.remove(atomid);
    return -1;
  }
  
  // Update the cached xform matrix if required
  pAtom->resetXformMatrix();
  if (!getXformMatrix().isIdent())
    pAtom->setXformMatrix(getXformMatrix());

  return atomid;
}

int MolCoord::appendAtomScrHelper(MolAtomPtr pAtom, const LString &ch,
				  ResidIndex resid, const LString &resn)
{
  qlib::uid_t nuid = pAtom->getParentUID();
  if (nuid!=qlib::invalid_uid) {
    // pAtom has been already belonged to other mol
    // --> ERROR!!
    MB_DPRINTLN("MolCoord.appendAtom> ERROR, pAtom already belongs to mol %d ().", nuid);
    return -1;
  }

  pAtom->setParentUID(getUID());
  pAtom->setChainName(ch);
  pAtom->setResIndex(resid);

  if (resn.isEmpty()) {
    // res name is determined by chain name and resindex
    MolResiduePtr pRes = getResidue(ch, resid);
    if (pRes.isnull()) {
      // ERROR!! cannot determine the residue to append to
      return -1;
    }
    pAtom->setResName(pRes->getName());
  }
  else {
    pAtom->setResName(resn);
  }

  return appendAtom(pAtom);
}

/// Append new atom (for scripting interface)
int MolCoord::appendAtomScr1(MolAtomPtr pAtom, const LString &ch, int nresid, const LString &resn)
{
  return appendAtomScrHelper(pAtom, ch, ResidIndex(nresid), resn);
}

bool MolCoord::removeAtom(int atomid)
{
  MolAtomPtr pAtom = getAtom(atomid);

  if (pAtom.isnull() || pAtom->getParentUID()!=getUID())
    return false;
  
  m_atomPool.remove(atomid);

  // invalidate ID
  pAtom->setID(-1);

  const LString &aname = pAtom->getName();
  char cConfID = pAtom->getConfID();
  ResidIndex nresid = pAtom->getResIndex();
  const LString &cname = pAtom->getChainName();

  MolChainPtr pCh = getChain(cname);
  if (pCh.isnull())
    return false;
  
  MolResiduePtr pRes = getResidue(cname, nresid);
  if (pRes.isnull())
    return false;

  // remove atom
  if (!pRes->removeAtom(aname, cConfID))
    return false;
  if (pRes->getAtomSize()>0)
    return true;

  // purge the empty residue
  if (!pCh->removeResidue(nresid))
    return false;
  // delete pRes;
  if (pCh->getSize()>0)
    return true;

  // purge the empty chain
  if (!removeChain(cname))
    return false;
  // delete pCh;

  return true;
}


MolBond *MolCoord::makeBond(int aaid1, int aaid2, bool bPersist /*=false*/)
{
  int aid1 = aaid1;
  int aid2 = aaid2;
  
  // always keep aid1<aid2
  if (aid1>aid2)
    std::swap(aid1, aid2);
  
  MolAtomPtr pA1 = getAtom(aid1);
  if (pA1.isnull())
    return NULL;

  // check bonded atom
  MolBond *pB = pA1->getBond(aid2);
  if (pB!=NULL) {
    // already bonded!!
    if (bPersist)
      pB->setPersist(bPersist);
    return pB;
  }

  MolAtomPtr pA2 = getAtom(aid2);
  if (pA2.isnull())
    return NULL;

  pB = MB_NEW MolBond();
  pB->setPersist(bPersist);

  int bondid = m_bondPool.put(pB);
  if (bondid<0)
    return NULL;
  
  pB->setAtom1(aid1);
  pB->setAtom2(aid2);

  pA1->addBond(pB);
  pA2->addBond(pB);

  return pB;
}

bool MolCoord::removeBond(int aaid1, int aaid2)
{
  BondPool::iterator iter = m_bondPool.begin();
  BondPool::iterator iend = m_bondPool.end();
  for (; iter!=iend; ++iter) {
    MolBond *pBond = iter->second;
    if (pBond->getAtom1()==aaid1 &&
        pBond->getAtom2()==aaid2)
      break;
    if (pBond->getAtom1()==aaid2 &&
        pBond->getAtom2()==aaid1)
      break;
  }
  if (iter==iend)
    return false;

  delete iter->second;
  m_bondPool.erase(iter);
  return true;
}

void MolCoord::removeNonpersBonds()
{
  std::deque<MolBond*> pers;

  BOOST_FOREACH (BondPool::value_type &elem, m_bondPool) {
    MolBond *pBond = elem.second;

    int aid1 = pBond->getAtom1();
    int aid2 = pBond->getAtom2();
    MolAtomPtr pA1 = getAtom(aid1);
    MolAtomPtr pA2 = getAtom(aid2);

    if (pBond->isPersist()){
      if (!pA1.isnull() && !pA2.isnull())
        pers.push_back(pBond); // reserve presistent & valid bond
      else
        delete pBond; // remove persistent but orphan bond
    }
    else {
      // remove non-persistent bond
      if (!pA1.isnull())
        pA1->removeBond(pBond);
      if (!pA2.isnull())
        pA2->removeBond(pBond);
      delete pBond;
    }
  }

  m_bondPool.clear();

  // re-append the valid persistent bonds
  BOOST_FOREACH (MolBond *pelem, pers) {
    m_bondPool.put(pelem);
  }
  
}

//////////

SelectionPtr MolCoord::getSelection() const
{
  return m_pSel;
}

void MolCoord::setSelection(SelectionPtr pNewSel)
{
  m_pSel = pNewSel;

}

////////////////////////////////////////
// data serialization

bool MolCoord::isDataSrcWritable() const
{
  return true;
}

LString MolCoord::getDataChunkReaderName(int nQdfVer) const
{
  if (nQdfVer==0)
    return LString("qdfpdb");
  else
    return LString("qdfmol");
}

void MolCoord::writeDataChunkTo(qlib::LDom2OutStream &oos) const
{
  int nver = oos.getQdfVer();
  MolCoord *pthis = const_cast<MolCoord *>(this);

  if (nver==0) {
    // version == 0: QDF-PDB compatibility mode
    PDBFileWriter writer;
    writer.attach(qsys::ObjectPtr(pthis));
    writer.write2(oos);
    writer.detach();
  }
  else {
    // version >=1: use QDF format
    QdfMolWriter writer;
    writer.setVersion(nver);
    writer.setEncType(oos.getQdfEncType());

    writer.attach(qsys::ObjectPtr(pthis));
    writer.write2(oos);
    writer.detach();
  }
}

////////////////////////////////////////

//static
MolCoordPtr MolCoord::getMolByID(qlib::uid_t uid, qlib::no_throw_tag xx)
{
  qsys::ObjectPtr robj = qsys::SceneManager::getObjectS(uid);
  if (robj.isnull()) return MolCoordPtr();
  return MolCoordPtr(robj, qlib::no_throw_tag());
}

//static
MolCoordPtr MolCoord::getMolByID(qlib::uid_t uid)
{
  qsys::ObjectPtr robj = qlib::ensureNotNull(qsys::SceneManager::getObjectS(uid));
  return MolCoordPtr(robj);
}

LString MolCoord::getChainsJSON() const
{
  LString rval = "[";

  ChainIter iter = begin();
  ChainIter eiter = end();
  bool bcomma = false;
  for (; iter!=eiter; ++iter) {
    if (bcomma) rval += ",";
    MolChainPtr pChain = iter->second;
    rval += "\""+pChain->getName().escapeQuots()+"\"";
    bcomma = true;
  }
  rval += "]";

  return rval;
}

/*
void MolCoord::propChanged(qlib::LPropEvent &ev)
{
  if (ev.getName().equals("defaultcolor")||
           ev.getName().equals("coloring")||
           ev.getParentName().equals("coloring")||
           ev.getParentName().startsWith("coloring.")) {
    //
    MB_DPRINTLN("MolCoord coloring propchanged %s", ev.getName().c_str());
    qsys::Object::RendIter iter = beginRend();
    qsys::Object::RendIter eiter = endRend();
    for (; iter!=eiter; ++iter) {
    }
  }

  super_t::propChanged(ev);
}
*/

//static
LString MolCoord::encodeModelInChain(const LString &chainname, int nModel)
{
  if (nModel<=0) {
    // Model no is 0-based
    MB_THROW(qlib::IllegalArgumentException, "invalid model no");
  }
  if (nModel==1)
    return chainname;
  
  return LString::format("%02d_%s", nModel, chainname.c_str());
}

//static
bool MolCoord::decodeModelFromChain(const LString &orig,
                                    LString &chain, int &nModel)
{
  int nlen = orig.length();
  int seppos = orig.indexOf('_');

  if (seppos<=0 || seppos>=nlen-1)
    return false;
  //cChain = (orig.c_str())[nlen-1];
  chain = orig.substr(seppos+1);
  LString num = orig.substr(0, seppos);
  return num.toInt(&nModel);
}

void MolCoord::setXformMatrix(const qlib::Matrix4D &m)
{
  super_t::setXformMatrix( m );

  //if (m.isIdent())
  //return;
  
  AtomIter iter = beginAtom();
  AtomIter eiter = endAtom();
  for (; iter!=eiter; ++iter) {
    MolAtomPtr pAtom = iter->second;
    MB_ASSERT(!pAtom.isnull());
    pAtom->setXformMatrix(m);
  }

  /*
    // XXX: cast this to MolCoordPtr possibly destruct this ptr and dangerous...
  AtomIterator iter(MolCoordPtr(const_cast<MolCoord *>(this)));
  for (iter.first(); iter.hasMore(); iter.next()) {
    MolAtomPtr pAtom = iter.get();
    MB_ASSERT(!pAtom.isnull());
    pAtom->setXformMatrix(m);
  }
   */
}

void MolCoord::changeChainName(const LString &oldname, const ResidIndex &resid, const LString &newname)
{
  MolChainPtr pNewCh = getChain(newname);
  if (pNewCh.isnull()) {
    pNewCh = MolChainPtr(MB_NEW MolChain());
    pNewCh->setParentUID(getUID());
    pNewCh->setName(newname);
    appendChain(pNewCh);
  }

  MolChainPtr pOldCh = qlib::ensureNotNull( getChain(oldname) );
  MolResiduePtr pRes = qlib::ensureNotNull( getResidue(oldname, resid) );
  
  pRes->setChainName(newname);
  MolResidue::AtomCursor iter = pRes->atomBegin();
  MolResidue::AtomCursor eiter = pRes->atomEnd();
  for (; iter!=eiter; ++iter) {
    MolAtomPtr pAtom = qlib::ensureNotNull( getAtom(iter->second) );
    pAtom->setChainName(newname);
  }

  pOldCh->removeResidue(pRes);
  pNewCh->appendResidue(pRes);

  // purge the empty chain
  if (pOldCh->getSize()==0)
    removeChain(oldname);
}

void MolCoord::changeResIndex(const LString &chname, const ResidIndex &oldind, const ResidIndex &newind)
{
  MolChainPtr pCh = qlib::ensureNotNull( getChain(chname) );
  MolResiduePtr pRes = qlib::ensureNotNull( getResidue(chname, oldind) );

  pCh->removeResidue(pRes);
  pRes->setIndex(newind);
  MolResidue::AtomCursor iter = pRes->atomBegin();
  MolResidue::AtomCursor eiter = pRes->atomEnd();
  for (; iter!=eiter; ++iter) {
    MolAtomPtr pAtom = qlib::ensureNotNull( getAtom(iter->second) );
    pAtom->setResIndex(newind);
  }
  pCh->appendResidue(pRes);
}

