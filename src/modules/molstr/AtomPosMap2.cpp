// -*-Mode: C++;-*-
//
//  Atom position <--> ID mapping (using CGAL Kd-tree)
//
// $Id$

#include <common.h>

#include "AtomPosMap2.hpp"
#include "MolCoord.hpp"
#include "MolAtom.hpp"
#include "AtomIterator.hpp"

//#include <CGAL/Exact_predicates_inexact_constructions_kernel.h>
#include <CGAL/Simple_cartesian.h>

#include <CGAL/Search_traits_3.h>
#include <CGAL/Search_traits_adapter.h>
//#include <CGAL/point_generators_3.h>
#include <CGAL/Orthogonal_k_neighbor_search.h>
#include <CGAL/property_map.h>
#include <boost/iterator/zip_iterator.hpp>
#include <utility>

//typedef CGAL::Exact_predicates_inexact_constructions_kernel Kernel;
typedef CGAL::Simple_cartesian<double> Kernel;

typedef Kernel::Point_3                                     Point_3;
typedef boost::tuple<Point_3,int>                           Point_and_int;
// typedef CGAL::Random_points_in_cube_3<Point_3>              Random_points_iterator;
typedef CGAL::Search_traits_3<Kernel>                       Traits_base;
typedef CGAL::Search_traits_adapter<Point_and_int,
  CGAL::Nth_of_tuple_property_map<0, Point_and_int>,
  Traits_base>                                              Traits;
typedef CGAL::Orthogonal_k_neighbor_search<Traits>          K_neighbor_search;
typedef K_neighbor_search::Tree                             Tree;
typedef K_neighbor_search::Distance                         Distance;

using namespace molstr;

AtomPosMap2::~AtomPosMap2()
{
  if (m_pKdTree!=NULL) {
    Tree *pTree = static_cast<Tree *>(m_pKdTree);
    delete pTree;
  }
}

void AtomPosMap2::generate(SelectionPtr pSel)
{
  MB_ASSERT(!m_pMol.isnull());

  if (m_pKdTree!=NULL) {
    Tree *pTree = static_cast<Tree *>(m_pKdTree);
    delete pTree;
    m_pKdTree = NULL;
  }


  AtomIterator iter(m_pMol);

  if (!pSel.isnull())
    iter.setSelection(pSel);

  std::deque<Point_3> points;
  std::deque<int>     indices;
  int na=0;

  for (iter.first(); iter.hasMore(); iter.next()) {
    MolAtomPtr pa = iter.get();
    Vector4D pos = pa->getPos();
    int aid = pa->getID();
    
    points.push_back(Point_3(pos.x(), pos.y(), pos.z()));
    indices.push_back(aid);
    ++na;
  }

  // Insert number_of_data_points in the tree
  Tree *ptree = MB_NEW Tree(
    boost::make_zip_iterator(boost::make_tuple( points.begin(),indices.begin() )),
    boost::make_zip_iterator(boost::make_tuple( points.end(),indices.end() ) )  
  );

  MB_DPRINTLN("AtomPosMap2> KdTree %p (%d points) created", ptree, na);
  m_pKdTree = ptree;
}

int AtomPosMap2::searchNearestAtom(const Vector4D &pos)
{
  MB_ASSERT(m_pKdTree!=NULL);
  
  Tree *pTree = static_cast<Tree *>(m_pKdTree);

  Point_3 query(pos.x(), pos.y(), pos.z());
  Distance tr_dist;

  // search K nearest neighbours
  //K_neighbor_search search(*pTree, query, 1, 10.0);
  K_neighbor_search search(*pTree, query, 1);

  for (K_neighbor_search::iterator it = search.begin(); it != search.end(); it++){
    //std::cout << " d(q, nearest neighbor)=  "
    //<< tr_dist.inverse_of_transformed_distance(it->second) << " " 
    //<< boost::get<0>(it->first)<< " " << boost::get<1>(it->first) << std::endl;
    return boost::get<1>(it->first);
  }

  return -1;
}

