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
  if (pMol.isnull()) {
    MB_THROW(qlib::NullPointerException, "Around op: Parent mol is null");
    return false;
  }
  
  LString ar_molname = getAroundTarget();
  bool bAcrossMol = false;

  if (!ar_molname.isEmpty()) {
    qsys::ScenePtr pSce = pMol->getScene();
    MolCoordPtr ptmp(pSce->getObjectByName(ar_molname), qlib::no_throw_tag());
    if (ptmp.isnull()) {
      // ERROR: around target mol is not found (ignore)
      MB_DPRINTLN("Around target mol %s not found", ar_molname.c_str());
      return false;
    }
    pMol = ptmp;
    bAcrossMol = true;
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
  
  if (!bAcrossMol &&
      pSet->find(patom->getID()) != pSet->end()) {
    if (bExpn)
      return true; // OP_EXPAND includes childe node selected atoms
    else
      return false; // OP_AROUND does not includes childe node selected atoms
  }
  
  // MB_DPRINTLN("Atom %s Around target mol %s(%d)", patom->formatMsg().c_str(), ar_molname.c_str(), pMol->getUID());
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
  if (pMol.isnull()) {
    MB_THROW(qlib::NullPointerException, "Byres op: Parent mol is null");
    return false;
  }

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
  if (pMol.isnull()) {
    MB_THROW(qlib::NullPointerException, "Bymain/sidech op: Parent mol is null");
    return false;
  }

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

