// -*-Mode: C++;-*-
//
// Graph Edges
//

#ifndef REND_GRAPH_EDGE_HPP_INCLUDE_
#define REND_GRAPH_EDGE_HPP_INCLUDE_

#include "render.hpp"
#include <qlib/Vector4D.hpp>

namespace render {

  class Edge
  {
  public:
    int iv1;
    int iv2;

    int if1;
    int if2;

    Edge() : iv1(-1), iv2(-1), if1(-1), if2(-1) {}

    Edge(int a1, int a2)
         : if1(-1), if2(-1)
    {
      if (a1<a2) {
        iv1 = a1;
        iv2 = a2;
      }
      else {
        iv1 = a2;
        iv2 = a1;
      }
    }

  };

  inline bool operator < (const Edge &a1, const Edge &a2)
  {
    if (a1.iv1<a2.iv1)
      return true;
    else if (a1.iv1>a2.iv1)
      return false;

    // a1.iv1==a2.iv1
    if (a1.iv2<a2.iv2)
      return true;
    else
      return false;
  }

  class EdgeSet : public std::set<Edge>
  {
    typedef std::set<Edge> super_t;

  public:

    //EdgeSet() : std::set<Edge> ()

    bool insertEdge(int iv1, int iv2, int fid)
    {
      MB_ASSERT(iv1!=iv2);

      Edge eg(iv1, iv2);

      super_t::iterator iter = super_t::find(eg);

      if (iter==end()) {
        eg.if1 = fid;
        eg.if2 = -1;
	super_t::insert(eg);
        return true;
      }

      if (iter->if2!=-1) {
        MB_DPRINTLN("insertEdge error iv=(%d,%d)", iv1, iv2);
        return false;
      }

      //iter->if2 = fid;
      eg.if1 = iter->if1;
      eg.if2 = fid;

      super_t::erase(iter);
      super_t::insert(eg);

      return false;
    }
  };
}

#endif

