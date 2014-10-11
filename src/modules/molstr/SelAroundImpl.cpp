// -*-Mode: C++;-*-
//
// SelAround.cpp : Selection AROUND and BYRES implementation
//
// $Id: SelAroundImpl.cpp,v 1.7 2011/02/13 10:35:50 rishitani Exp $

#include <common.h>

#include "SelNodes.hpp"

#include "SelCacheMgr.hpp"
#include "MolCoord.hpp"
#include "MolAtom.hpp"
#include "MolResidue.hpp"
#include "SelCommand.hpp"
#include "ResidIterator.hpp"
#include "ResiToppar.hpp"

#include <qlib/Box3D.hpp>
#include <qsys/Scene.hpp>

using qlib::Box3D;
using namespace molstr;

namespace {
bool evalAroundHelper_bbox(MolCoordPtr pMol, const Vector4D &pos, double dist,
                           const Box3D &bbox, const std::set<int> *pcache);
}

/// Evaluate around/expand operator
bool SelOpNode::chkAroundNode(MolAtomPtr patom, bool bExpn)
{
  SelSuperNode *pChild = getNode();
  MolCoordPtr pMol = patom->getParent();
  LString ar_molname = getAroundTarget();

  if (!ar_molname.isEmpty()) {
    qsys::ScenePtr pSce = pMol->getScene();
    MolCoordPtr ptmp(pSce->getObjectByName(ar_molname), qlib::no_throw_tag());
    if (ptmp.isnull()) {
      // ERROR: around target mol is not found (ignore)
      return false;
    }
    pMol = ptmp;
  }

  const double dist = getValue();
  Vector4D pos = patom->getPos();

  SelCacheMgr *pSCMgr = SelCacheMgr::getInstance();

  SelectionPtr pChSel(MB_NEW SelCommand(pChild));
  const SelCacheData *pSCDat = pSCMgr->findOrMakeCacheData(pMol, pChSel);
  if (pSCDat==NULL) {
    LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
    MB_THROW(qlib::RuntimeException, "cannot create/get sel cache data");
    return false;
  }

  const std::set<int> *pSet = & pSCDat->getAtomIdSet();
  const Box3D *pBox = & pSCDat->getBoundBox();
  
  if (pBox==NULL || pSet==NULL) {
    LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
    MB_THROW(qlib::RuntimeException, "Fatal error, cannot create cache data.");
    return false;
  }
  
  if (pSet->find(patom->getID()) != pSet->end()) {
    if (bExpn)
      return true; // OP_EXPAND includes childe node selected atoms
    else
      return false; // OP_AROUND does not includes childe node selected atoms
  }
  
  return evalAroundHelper_bbox(pMol, pos, dist, *pBox, pSet);
}

namespace {

inline bool inside(double start, double end, double value)
{
  return start<=value && value<end;
}

bool evalAroundHelper_bbox(MolCoordPtr pMol, const Vector4D &pos, double dist,
                           const Box3D &bbox, const std::set<int> *pcache)
{
  //
  // Preclude far atoms by bounding box calculation
  //

  int i;
  double dist2 = dist*dist;

  const Vector4D &vstart = bbox.vstart;
  const Vector4D &vend = bbox.vend;

  // check the bounding box
  double db = -1.0;
  
  // nearest point
  if (!inside(vstart.x(), vend.x(), pos.x()) &&
      !inside(vstart.y(), vend.y(), pos.y()) &&
      !inside(vstart.z(), vend.z(), pos.z())) {
    Vector4D vtmp;
    bool xs = pos.x() < vstart.x();
    bool ys = pos.y() < vstart.y();
    bool zs = pos.z() < vstart.z();
    if (xs && ys && zs) {
      vtmp = pos-vstart;
    }
    else if (!xs && ys && zs) {
      vtmp.x() = pos.x()-vend.x();
      vtmp.y() = pos.y()-vstart.y();
      vtmp.z() = pos.z()-vstart.z();
    }
    else if (xs && !ys && zs) {
      vtmp.x() = pos.x()-vstart.x();
      vtmp.y() = pos.y()-vend.y();
      vtmp.z() = pos.z()-vstart.z();
    }
    else if (xs && ys && !zs) {
      vtmp.x() = pos.x()-vstart.x();
      vtmp.y() = pos.y()-vstart.y();
      vtmp.z() = pos.z()-vend.z();
    }
    else if (!xs && !ys && zs) {
      vtmp.x() = pos.x()-vend.x();
      vtmp.y() = pos.y()-vend.y();
      vtmp.z() = pos.z()-vstart.z();
    }
    else if (!xs && ys && !zs) {
      vtmp.x() = pos.x()-vend.x();
      vtmp.y() = pos.y()-vstart.y();
      vtmp.z() = pos.z()-vend.z();
    }
    else if (xs && !ys && !zs) {
      vtmp.x() = pos.x()-vstart.x();
      vtmp.y() = pos.y()-vend.y();
      vtmp.z() = pos.z()-vend.z();
    }
    else //(!xs && !ys && !zs)
      vtmp = pos-vend;

    db = vtmp.length();
  }
  // nearest edge
  else if (!inside(vstart.x(), vend.x(), pos.x()) &&
           !inside(vstart.y(), vend.y(), pos.y()) &&
           inside(vstart.z(), vend.z(), pos.z())) {
    Vector4D vtmp;
    bool xs = pos.x() < vstart.x();
    bool ys = pos.y() < vstart.y();
    if (xs && ys) {
      vtmp.x() = pos.x()-vstart.x();
      vtmp.y() = pos.y()-vstart.y();
    }
    else if (!xs && ys) {
      vtmp.x() = pos.x()-vend.x();
      vtmp.y() = pos.y()-vstart.y();
    }
    else if (xs && !ys) {
      vtmp.x() = pos.x()-vstart.x();
      vtmp.y() = pos.y()-vend.y();
    }
    else {
      vtmp.x() = pos.x()-vend.x();
      vtmp.y() = pos.y()-vend.y();
    }
    db = vtmp.length();
  }
  else if (!inside(vstart.x(), vend.x(), pos.x()) &&
           inside(vstart.y(), vend.y(), pos.y()) &&
           !inside(vstart.z(), vend.z(), pos.z())) {
    Vector4D vtmp;
    bool xs = pos.x() < vstart.x();
    bool zs = pos.z() < vstart.z();
    if (xs && zs) {
      vtmp.x() = pos.x()-vstart.x();
      vtmp.z() = pos.z()-vstart.z();
    }
    else if (!xs && zs) {
      vtmp.x() = pos.x()-vend.x();
      vtmp.z() = pos.z()-vstart.z();
    }
    else if (xs && !zs) {
      vtmp.x() = pos.x()-vstart.x();
      vtmp.z() = pos.z()-vend.z();
    }
    else {
      vtmp.x() = pos.x()-vend.x();
      vtmp.z() = pos.z()-vend.z();
    }
    db = vtmp.length();
  }
  else if (inside(vstart.x(), vend.x(), pos.x()) &&
           !inside(vstart.y(), vend.y(), pos.y()) &&
           !inside(vstart.z(), vend.z(), pos.z())) {
    Vector4D vtmp;
    bool ys = pos.y() < vstart.y();
    bool zs = pos.z() < vstart.z();
    if (ys && zs) {
      vtmp.y() = pos.y()-vstart.y();
      vtmp.z() = pos.z()-vstart.z();
    }
    else if (!ys && zs) {
      vtmp.y() = pos.y()-vend.y();
      vtmp.z() = pos.z()-vstart.z();
    }
    else if (ys && !zs) {
      vtmp.y() = pos.y()-vstart.y();
      vtmp.z() = pos.z()-vend.z();
    }
    else {
      vtmp.y() = pos.y()-vend.y();
      vtmp.z() = pos.z()-vend.z();
    }
    db = vtmp.length();
  }
  // nearest plane
  else if (!inside(vstart.x(), vend.x(), pos.x()) &&
           inside(vstart.y(), vend.y(), pos.y()) &&
           inside(vstart.z(), vend.z(), pos.z())) {
    if (pos.x()<vstart.x())
      db = vstart.x()-pos.x();
    else
      db = pos.x()-vend.x();
  }
  else if (inside(vstart.x(), vend.x(), pos.x()) &&
           !inside(vstart.y(), vend.y(), pos.y()) &&
           inside(vstart.z(), vend.z(), pos.z())) {
    if (pos.y()<vstart.y())
      db = vstart.y()-pos.y();
    else
      db = pos.y()-vend.y();
  }
  else if (inside(vstart.x(), vend.x(), pos.x()) &&
           inside(vstart.y(), vend.y(), pos.y()) &&
           !inside(vstart.z(), vend.z(), pos.z())) {
    if (pos.z()<vstart.z())
      db = vstart.z()-pos.z();
    else
      db = pos.z()-vend.z();
  }
  // else inside the bounding-box

  if (db>dist)
    return false;

  // check the all points
  std::set<int>::const_iterator iter = pcache->begin();
  for (; iter!=pcache->end(); ++iter) {
    MolAtomPtr pa = pMol->getAtom(*iter);
    MB_ASSERT(!pa.isnull());
    Vector4D dv = pos - pa->getPos();
    if (dv.sqlen()<dist2)
      return true;
  }

  return false;
}

} // namespace

/*
bool CnstrSel::evalAroundHelper_bbox2(const Vector4D &pos, double dist,
				      const Box3D &bbox,
				      const std::set<int> *pcache)
{
  // Box3D arbox = bbox;
  // arbox.inflate(dist);
  if (!bbox.contains(pos))
    return false;

  // check the all points
  double dsq = dist*dist;
  std::set<int>::const_iterator iter = pcache->begin();
  for (; iter!=pcache->end(); ++iter) {
    MolAtom *pa = m_pCurClient->getAtom(*iter);
    MB_ASSERT(pa!=NULL);
    Vector4D dv = pos - pa->getPos();
    if (dv.sqlen()<dsq)
      return true;
  }

  return false;
}
*/

//////////////////////////////////////////////////////////////
// Byresidue implementation

namespace {
  bool residContains(MolResiduePtr pRes, const std::set<int> &tset)
  {

    MolResidue::AtomCursor iter = pRes->atomBegin();
    for ( ; iter!=pRes->atomEnd(); iter++) {
      int aid = iter->second;
      
      if (tset.find(aid) != tset.end())
        return true;
    }
    
    return false;
  }

  void residAppend(MolResiduePtr pRes, std::set<int> &tset)
  {
    MolResidue::AtomCursor iter = pRes->atomBegin();
    for ( ; iter!=pRes->atomEnd(); iter++)
      tset.insert(iter->second);
  }
}

/// BYRES: Using the cached selection
bool SelOpNode::chkByresNode(MolAtomPtr patom)
{
  MolCoordPtr pMol = patom->getParent();

  SelCacheMgr *pSCMgr = SelCacheMgr::getInstance();

  // Get or create the cache data of this node
  SelectionPtr pThisSel(MB_NEW SelCommand(this));
  const SelCacheData *pSTDat = pSCMgr->findCacheData(pMol, pThisSel);
  if (pSTDat!=NULL) {
    // use cached data
    const std::set<int> *pThisSet = & pSTDat->getAtomIdSet();
    if (pThisSet==NULL) {
      LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
      MB_THROW(qlib::RuntimeException, "Fatal error, cannot create cache data.");
      return false;
    }
    if (pThisSet->find(patom->getID()) != pThisSet->end())
      return true; // found
    else
      return false; // not found
  }

  // Get or create child node cache data
  SelSuperNode *pChild = getNode();
  SelectionPtr pChSel(MB_NEW SelCommand(pChild));
  const SelCacheData *pSCDat = pSCMgr->findOrMakeCacheData(pMol, pChSel);
  if (pSCDat==NULL) {
    LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
    MB_THROW(qlib::RuntimeException, "cannot create/get sel cache data");
    return false;
  }

  const std::set<int> *pSet = & pSCDat->getAtomIdSet();
  if (pSet==NULL) {
    LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
    MB_THROW(qlib::RuntimeException, "Fatal error, cannot create cache data.");
    return false;
  }

  std::set<int> tset;
  ResidIterator riter(pMol);
  for (riter.first(); riter.hasMore(); riter.next()) {
    MolResiduePtr pRes = riter.get();
    if (residContains(pRes, *pSet))
      residAppend(pRes, tset);
  }

  pSCMgr->makeCacheBySet(pMol, pThisSel, tset);

  if (tset.find(patom->getID()) != tset.end())
    return true;
  else
    return false;
  
}

bool SelOpNode::chkMainSideChainNode(MolAtomPtr patom, bool bSide)
{
  MolCoordPtr pMol = patom->getParent();

  SelCacheMgr *pSCMgr = SelCacheMgr::getInstance();

  // Get or create the cache data of this node
  SelectionPtr pThisSel(MB_NEW SelCommand(this));
  const SelCacheData *pSTDat = pSCMgr->findCacheData(pMol, pThisSel);
  if (pSTDat!=NULL) {
    // use cached data
    const std::set<int> *pThisSet = & pSTDat->getAtomIdSet();
    if (pThisSet==NULL) {
      LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
      MB_THROW(qlib::RuntimeException, "Fatal error, cannot create cache data.");
      return false;
    }
    if (pThisSet->find(patom->getID()) != pThisSet->end())
      return true; // found
    else
      return false; // not found
  }

  // Get or create child node cache data
  SelSuperNode *pChild = getNode();
  SelectionPtr pChSel(MB_NEW SelCommand(pChild));
  const SelCacheData *pSCDat = pSCMgr->findOrMakeCacheData(pMol, pChSel);
  if (pSCDat==NULL) {
    LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
    MB_THROW(qlib::RuntimeException, "cannot create/get sel cache data");
    return false;
  }

  const std::set<int> *pSet = & pSCDat->getAtomIdSet();
  if (pSet==NULL) {
    LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
    MB_THROW(qlib::RuntimeException, "Fatal error, cannot create cache data.");
    return false;
  }

  std::set<int> tset;

  std::set<int>::const_iterator iter = pSet->begin();
  std::set<int>::const_iterator end = pSet->end();
  for (; iter!=end; ++iter) {
    MolAtomPtr pAtom = pMol->getAtom(*iter);
    if (pAtom.isnull()) continue;
    MolResiduePtr pRes = pAtom->getParentResidue();
    if (pRes.isnull()) continue;
    ResiToppar *pTop = pRes->getTopologyObj();
    if (pTop==NULL) continue;

    LString aname = pAtom->getName();
    if (bSide) {
      if (pTop->isSideCh(aname))
        tset.insert(*iter);
    }
    else {
      if (pTop->isMainCh(aname))
        tset.insert(*iter);
    }
  }

  pSCMgr->makeCacheBySet(pMol, pThisSel, tset);

  if (tset.find(patom->getID()) != tset.end())
    return true;
  else
    return false;
  
}

/*
/// BYRES: Using the cached child node selection
bool SelOpNode::chkByresNode(MolAtomPtr patom)
{
  SelSuperNode *pChild = getNode();
  MolCoordPtr pMol = patom->getParent();

  SelCacheMgr *pSCMgr = SelCacheMgr::getInstance();

  SelectionPtr pChSel(MB_NEW SelCommand(pChild));
  const SelCacheData *pSCDat = pSCMgr->findOrMakeCacheData(pMol, pChSel);
  if (pSCDat==NULL) {
    LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
    MB_THROW(qlib::RuntimeException, "cannot create/get sel cache data");
    return false;
  }

  const std::set<int> *pSet = & pSCDat->getAtomIdSet();
  if (pSet==NULL) {
    LOG_DPRINTLN("SelAround> Fatal error, cannot create cache data.");
    MB_THROW(qlib::RuntimeException, "Fatal error, cannot create cache data.");
    return false;
  }

  if (pSet->find(patom->getID()) != pSet->end())
    return true;

  MolResiduePtr pRes = patom->getParentResidue();
  MolResidue::AtomCursor iter = pRes->atomBegin();
  int aid_self = patom->getID();
  for ( ; iter!=pRes->atomEnd(); iter++) {
    int aid = iter->second;
    if (aid==aid_self)
      continue;

    if (pSet->find(aid) != pSet->end())
      return true;
  }

  return false;
}
*/

/*
///BYRES: most primitive version  
bool SelOpNode::chkByresNode(MolAtomPtr patom)
{
  SelSuperNode *pChild = getNode();

  if (isSelImpl(pc, patom))
    return true;

  MolResidue *pRes = patom->getParentResidue();
  MolResidue::AtomCursor iter = pRes->atomBegin();
  for ( ; iter!=pRes->atomEnd(); iter++) {
    MolAtom *pA = m_pCurClient->getAtom((*iter).second);
    if (patom==pA)
      continue;
    if (isSelImpl(pc, pA))
      return true;
  }

  return false;
}
*/


#if 0
namespace {
  struct ByresCacheData : public qlib::LObject
  {
    MolCoord *pmol;
    int cid;
  };

  const std::set<int> *buildByresCacheData(SelOpNode *pByNode, MolCoord *pTgt)
  {
    std::set<u_long> resset;
    
    ByresCacheData *pCache = MB_NEW ByresCacheData;
    pByNode->m_pCacheData = pCache;
    SelSuperNode *pChild = pByNode->getNode();
    qlib::sp<MolCachedSel> pcsel(MB_NEW CnstrSel(pChild->clone()));
    pcsel->makeAtomCache(pTgt);
    
    {
      // enumerate selected residues
      AtomIterator iter(pTgt, pcsel);
      for (iter.first(); iter.hasMore(); iter.next()) {
        MolAtom *pa = iter.get();
        u_long resID = (u_long)(pa->getParentResidue());
        resset.insert(resID);
      }
    }
    
    std::set<int> *pset2 = MB_NEW std::set<int>;
    {
      // build set2
      std::set<u_long>::const_iterator iter = resset.begin();
      for (; iter!=resset.end(); ++iter) {
        MolResidue *pres = (MolResidue *)(*iter);
        MolResidue::AtomCursor iter = pres->atomBegin();
        for ( ; iter!=pres->atomEnd(); iter++) {
          MolAtom *pa = pres->getAtom(iter->first);
          MB_ASSERT(pa!=NULL);
          pset2->insert(pa->getID());
        }
      }
    }
    
    SelCacheMgr *pMgr = pTgt->getSelCacheMgr();
    pCache->pmol = pTgt;
    pCache->cid = pMgr->makeAtomCache(pset2);

    return pset2;
  }
}
#endif

// XXX: Why this code is disabled ??? (2007/9/21)
#if 0
bool CnstrSel::chkByresNode(SelOpNode *pByNode, MolAtom *patom)
{
  // pByNode is BYRES node
  
  SelSuperNode *pChild = pByNode->getNode();

  ByresCacheData *pCache = dynamic_cast<ByresCacheData*>(pByNode->m_pCacheData);

  if (pCache!=NULL && pCache->pmol!=m_pCurClient) {
    // pCache is ByresCache but for another molecule
    delete pByNode->m_pCacheData;
    pCache = NULL;
    pByNode->m_pCacheData = NULL;
  }

  const std::set<int> *pset;
  if (pCache==NULL) {
    // cache is not found
    //  --> evaluate child node & create AID set
    pset = buildByresCacheData(pByNode, m_pCurClient);
  }
  else {
    // use cache data
    SelCacheMgr *pMgr = m_pCurClient->getSelCacheMgr();
    pset = pMgr->searchAtomCache(pCache->cid);
  }
  
  if (pset==NULL)
    return false; // pChild selection is empty 
  
  if (pset->find(patom->getID()) == pset->end())
    return false;

  return true;
}
#endif



#if 0
bool CnstrSel::chkAroundNode_Position(qs::SelOpNode *pArNode, qs::SelPosNode *pChild, MolAtom *patom)
{
  const double dist = pArNode->getValue();
  const double dsq = dist*dist;
  const Vector4D &pos1 = pChild->getValue();
  Vector4D del = patom->getPos() - pos1;

  if (del.sqlen()<dsq)
    return true;
  return false;

#if 0
  int i;
  BSPTreeCacheData *pCache = dynamic_cast<BSPTreeCacheData*>(pArNode->m_pCacheData);

  if (pCache!=NULL && pCache->pmol!=m_pCurClient) {
    // pCache is BBoxCache but for another molecule
    delete pArNode->m_pCacheData;
    pArNode->m_pCacheData = pCache = NULL;
  }

  if (pCache==NULL) {
    pCache = MB_NEW BSPTreeCacheData;
    pCache->pmol = m_pCurClient;

    int natoms = m_pCurClient->getAtomSize();
    pCache->bsptree.alloc(natoms);
    
    AtomPool::const_iterator ait = m_pCurClient->beginAtom();
    for (i=0; ait!=m_pCurClient->endAtom()&&i<natoms; ++ait,++i) {
      MolAtom *pAtom = ait->second;
      // m_data[i].pos = pAtom->getPos();
      // m_data[i].patm = pAtom;
      
      pCache->bsptree.setAt(i, pAtom->getPos(), ait->first);
    }

    // build BSP tree
    pCache->bsptree.build();
    pArNode->m_pCacheData = pCache;
  }  

  double dist = pArNode->getValue();
  std::vector<int> vres;
  int nvres = pCache->bsptree.findAround(pChild->getValue(), dist, vres);
#endif  


  return true;
}
#endif

