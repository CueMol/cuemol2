// -*-Mode: C++;-*-
//
// Boundary data structure for CutByPlane2 implementation
//

#include <common.h>
#include "Boundary.hpp"
#include "CutByPlane2.hpp"

using namespace surface;
using namespace surface::cbp_detail;

bool Boundary::isEnclosing(const Vector2D &pos, bool bChkInset /*=false*/ ) const
{
  if (isEmpty())
    return false;

  int nhit = isEnclImpl(pos, bChkInset);

  if (nhit%2==0) return false;
  return true;
}

int Boundary::isEnclImpl(const Vector2D &pos, bool bChkInset) const
{
  int i;
  int nsize = getSize();

  Vector2D prev, v;

  int nhit=0;

  for (i=0; i<=nsize; ++i, prev=v) {
    v = getVertCirc(i);
    if (i==0)
      continue;
    
    if ((prev.x()-pos.x())*(v.x()-pos.x())<0) {
      double yy = (v.y()-prev.y())*(pos.x()-prev.x())/(v.x()-prev.x()) + prev.y();
      if (yy<pos.y())
        ++nhit;
    }

  }

  if (bChkInset && getInsetSize()>0) {
    BoundarySet::const_iterator iter = ins_begin();
    BoundarySet::const_iterator iend = ins_end();
    for (; iter!=iend; ++iter) {
      nhit += (*iter)->isEnclImpl(pos, bChkInset);
    }
  }

  return nhit;
}

////////////////////////////

BoundarySet::~BoundarySet()
{
  std::for_each(super_t::begin(), super_t::end(),
                qlib::delete_ptr<Boundary *>());
}

#include <modules/molstr/BSPTree.hpp>

/// Build bondary set from Section edge-vertex graph
void BoundarySet::build2(std::map<int, int> &sidmap, CutByPlane2 *pCBP)
{
  int j;

  typedef std::map<int, int> SIDMap;

  molstr::BSPTree<int> bsp;
  bsp.alloc(sidmap.size()*2);
  int i=0;
  BOOST_FOREACH (const SIDMap::value_type &elem, sidmap) {
    //MB_DPRINTLN("%d --> %d", elem.first, elem.second);
    bsp.setAt(i, pCBP->getVert(elem.first), elem.first);
    ++i;
    bsp.setAt(i, pCBP->getVert(elem.second), elem.second);
    ++i;
  }
  bsp.build();
  
  std::vector<int> res;
  SIDMap sidmap2;
  int nres;
  BOOST_FOREACH (const SIDMap::value_type &elem, sidmap) {
    std::pair<int,int> elem2 = elem;
    nres = bsp.findAround(pCBP->getVert(elem.first), 1.0e-8, res);
    if (nres>1) {
      // MB_DPRINTLN("degen vert %d", elem.first);
      int idmin = res[0];
      for (int ii=0; ii<nres; ++ii) {
        Vector4D v = pCBP->getVert(res[ii]);
        // MB_DPRINTLN("  %d (%f,%f,%f)", res[ii], v.x(), v.y(), v.z());
        idmin = qlib::min(idmin, res[ii]);
      }
      elem2.first = idmin;
    }

    nres = bsp.findAround(pCBP->getVert(elem.second), 1.0e-8, res);
    if (nres>1) {
      // MB_DPRINTLN("degen vert %d", elem.second);
      int idmin = res[0];
      for (int ii=0; ii<nres; ++ii) {
        Vector4D v = pCBP->getVert(res[ii]);
        // MB_DPRINTLN("  %d (%f,%f,%f)", res[ii], v.x(), v.y(), v.z());
        idmin = qlib::min(idmin, res[ii]);
      }
      elem2.second = idmin;
    }

    auto res = sidmap2.insert(elem2);
    if (!res.second) {
      LOG_DPRINTLN("ERROR!! XXX");
    }
  }

#ifdef MB_DEBUG
  BOOST_FOREACH (const SIDMap::value_type &elem, sidmap2) {
    MB_DPRINTLN("%d --> %d", elem.first, elem.second);
  }
#endif

  while (sidmap2.size()>0) {
    Boundary *pbn = MB_NEW Boundary;

    std::map<int,int>::iterator iter = sidmap2.begin();
    std::pair<int,int> ed = *iter;
    sidmap2.erase(iter);
    pbn->insert(ed.first, pCBP->ontoPlane(ed.first));

    for (j=0;;++j) {
      int nextid = ed.second;
      iter = sidmap2.find(nextid);
      if (iter==sidmap2.end()) {
        break;
      }
      
      ed = *iter;
      sidmap2.erase(iter);

      pbn->insert(ed.first, pCBP->ontoPlane(ed.first));
    }

    MB_DPRINTLN("boundary no %d size=%d", super_t::size(), pbn->getSize());
    super_t::push_back(pbn);
  }

  buildInnerBoundary();
}

/// Build bondary set from SID Map
void BoundarySet::build(std::map<int, int> &sidmap, CutByPlane2 *pCBP)
{
  int j;

  typedef std::map<int, int> SIDMap;

  while (sidmap.size()>0) {
    Boundary *pbn = MB_NEW Boundary;

    std::map<int,int>::iterator iter = sidmap.begin();
    std::pair<int,int> ed = *iter;
    sidmap.erase(iter);
    pbn->insert(ed.first, pCBP->ontoPlane(ed.first));

    for (j=0;;++j) {
      int nextid = ed.second;
      iter = sidmap.find(nextid);
      if (iter==sidmap.end()) {
        break;
      }
      
      ed = *iter;
      sidmap.erase(iter);

      pbn->insert(ed.first, pCBP->ontoPlane(ed.first));
    }

    super_t::push_back(pbn);
  }

  buildInnerBoundary();
}

/// build inner boundary structures
void BoundarySet::buildInnerBoundary()
{
  super_t::iterator iter = super_t::begin();
  for (; iter!=super_t::end(); ++iter) {

    Boundary *pbn = *iter;
    super_t::iterator iter2 = iter;
    ++iter2;

    for (; iter2!=super_t::end();) {

      Boundary *pbn2 = *iter2;
      if (pbn2->isEmpty()) continue;

      if (pbn->isEnclosing( pbn2->getVert(0)) ) {
        // pbn is enclosing pbn2
        pbn->insertToInset(pbn2);
        iter2 = super_t::erase(iter2);
        continue;
      }
      ++iter2;

    } // inner loop

  } // outer loop

  return;
}

