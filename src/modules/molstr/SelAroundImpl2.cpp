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

#include <qsys/Scene.hpp>

//////////

#include <CGAL/Simple_cartesian.h>
#include <CGAL/Search_traits_3.h>
#include <CGAL/Search_traits_adapter.h>
#include <CGAL/Orthogonal_k_neighbor_search.h>
#include <CGAL/property_map.h>
#include <boost/iterator/zip_iterator.hpp>
#include <utility>

//////////

using namespace molstr;

namespace {

typedef CGAL::Simple_cartesian<double> Kernel;
typedef Kernel::Point_3                                     Point_3;
typedef boost::tuple<Point_3,int>                           Point_and_int;
typedef CGAL::Search_traits_3<Kernel>                       Traits_base;
typedef CGAL::Search_traits_adapter<Point_and_int,
  CGAL::Nth_of_tuple_property_map<0, Point_and_int>,
  Traits_base>                                              Traits;
typedef CGAL::Orthogonal_k_neighbor_search<Traits>          K_neighbor_search;
typedef K_neighbor_search::Tree                             Tree;
typedef K_neighbor_search::Distance                         Distance;

  Tree *createKdTree(const SelCacheData *pSCDat, const MolCoordPtr &pMol)
  {
    const std::set<int> &idset = pSCDat->getAtomIdSet();

    Vector4D pos;
    std::deque<Point_3> points;
    std::deque<int>     indices;
    int na=0;
    
    BOOST_FOREACH (int aid, idset) {
      MolAtomPtr pa = pMol->getAtom(aid);
      if (pa.isnull()) continue;
      pos = pa->getPos();

      points.push_back(Point_3(pos.x(), pos.y(), pos.z()));
      indices.push_back(aid);
      ++na;
    }

    // Insert number_of_data_points in the tree
    Tree *ptree = MB_NEW Tree(
      boost::make_zip_iterator(boost::make_tuple( points.begin(),indices.begin() )),
      boost::make_zip_iterator(boost::make_tuple( points.end(),indices.end() ) )  
      );
    
    LOG_DPRINTLN("chkAround2> KdTree for %d atoms created.", na);

    SelCacheData *pDat = const_cast<SelCacheData *>(pSCDat);
    pDat->setExtData(ptree);
    return ptree;
  }

}

/// Evaluate around/expand operator
bool SelOpNode::chkAroundNode2(MolAtomPtr patom, bool bExpn)
{
  SelSuperNode *pChild = getNode();
  MolCoordPtr pMol = patom->getParent();

  // around target mol (not empty, when sel targe!=around target)
  LString ar_molname = getAroundTarget();

  // Check around target mol (and set bAcrossMol=true, when around target mol is used)
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

  // around distance
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

  // Check around target sel
  const std::set<int> *pSet = & pSCDat->getAtomIdSet();
  if (!bAcrossMol &&
      pSet->find(patom->getID()) != pSet->end()) {
    if (bExpn)
      return true; // OP_EXPAND includes childe node selected atoms
    else
      return false; // OP_AROUND does not includes childe node selected atoms
  }
  
  Tree *pTree = static_cast<Tree *>(pSCDat->getExtData());
  if (pTree==NULL) {
    pTree = createKdTree(pSCDat, pMol);
  }
  
  Point_3 query(pos.x(), pos.y(), pos.z());
  Distance tr_dist;

  // search K nearest neighbours (K=1; most nearest atom)
  K_neighbor_search search(*pTree, query, 1);

  for (K_neighbor_search::iterator it = search.begin(); it != search.end(); it++){
    double it_dist = tr_dist.inverse_of_transformed_distance(it->second);
    //int it_aid = boost::get<1>(it->first);
    if (it_dist<dist)
      return true;
  }

  return false;
}

void SelCacheData::clearExtData()
{
  Tree *pTree = static_cast<Tree *>(getExtData());
  if (pTree!=NULL)
    delete pTree;
  setExtData(NULL);
}

