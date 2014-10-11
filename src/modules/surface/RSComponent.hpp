// -*-Mode: C++;-*-
//
//  molecular surface builder
//
// $Id: RSComponent.hpp,v 1.1 2011/02/10 14:17:43 rishitani Exp $

#ifndef RS_COMPONENT_HPP_INCLUDED_
#define RS_COMPONENT_HPP_INCLUDED_

#include "SurfParams.hpp"
#include "SESArc.hpp"

namespace surface {

using qlib::Vector4D;

class MolCoord;

class MSAtom;
class RSEdge;
class RSFace;

typedef std::deque<RSVert *> RSVertList;
typedef std::deque<RSEdge *> RSEdgeList;

class RSVert
{
public:
  /** edge list connected to this vertex */
  RSEdgeList m_edges;

  /** MSAtom index of this vertex */
  int idx;

public:
  RSVert() : idx(-1) {}
  RSVert(int i) : idx(i) {}
};

class RSEdge
{
public:
  int idx[2];
  RSFace *pF[2];
  int ford[2];

  TorusParam param;

  SESArc *pArc[2];

  bool bRadSngl;

public:
  RSEdge()
  {
    idx[0] = idx[1] = -1;
    pF[0] = pF[1] = NULL;
    ford[0] = ford[1] = -1;
    bRadSngl = false;
  }

};

class RSFace
{
public:
  int idx[3];

  bool edge[3];
  RSEdge *pE[3];

  ConcSphParam param;

  // int arc[3];
  SESArc *pArc[3];

  bool bNonrSngl;

public:
  RSFace()
  {
    idx[0] = idx[1] = idx[2] = -1;
    edge[0] = edge[1] = edge[2] = false;
    pE[0] = pE[1] = pE[2] = NULL;
    pArc[0] = pArc[1] = pArc[2] = NULL;
    bNonrSngl = false;
  }

  RSFace(int i, int j, int k)
  {
    idx[0] = i; idx[1] = j; idx[2] = k;
    edge[0] = edge[1] = edge[2] = false;
    pE[0] = pE[1] = pE[2] = NULL;
    pArc[0] = pArc[1] = pArc[2] = NULL;
    bNonrSngl = false;
  }

  ~RSFace() {
  }
};

class RSFaceComp
{
public:
  struct tuple {

    int i, j, k;

    tuple(const RSFace *pf)
         : i(pf->idx[0]), j(pf->idx[1]), k(pf->idx[2])
      {
      }

    void canonicalize() {
      if (i<j && i<k) return;
      if (j<i && j<k) {
        rotateb();
        return;
      }
      if (k<i && k<j) {
        rotatef();
        return;
      }
    }

    void rotatef() {
      int tmp = k;
      k = j;
      j = i;
      i = tmp;
    }

    void rotateb() {
      int tmp = i;
      i = j;
      j = k;
      k = tmp;
    }

  };

  /*static bool comp_less(tuple &tp1, tuple &tp2) {
      tp1.canonicalize();
      tp2.canonicalize();
      
      if (tp1.i<tp2.i)
        return true;
      else if (tp1.i>tp2.i)
        return false;
      
      if (tp1.j<tp2.j)
        return true;
      else if (tp1.j>tp2.j)
        return false;
      
      if (tp1.k<tp2.k)
        return true;
      
      return false;
    }*/

  typedef RSFace *value_type;

public:
  inline
  bool operator() (const value_type &p1, const value_type &p2) const {
    // MB_DPRINT("compare (%d,%d,%d)", p1->idx[0], p1->idx[1], p1->idx[2]);
    // MB_DPRINTLN(" (%d,%d,%d)", p2->idx[0], p2->idx[1], p2->idx[2]);

    tuple tp1(p1), tp2(p2);

    tp1.canonicalize();
    tp2.canonicalize();
    
    if (tp1.i<tp2.i)
      return true;
    else if (tp1.i>tp2.i)
      return false;
    
    if (tp1.j<tp2.j)
      return true;
    else if (tp1.j>tp2.j)
      return false;
    
    if (tp1.k<tp2.k)
      return true;
    
    return false;

    /*
    bool res = comp_less(tp1, tp2);
    if (res) {
      MB_DPRINT("compare (%d,%d,%d)", tp1.i, tp1.j, tp1.k);
      MB_DPRINTLN(" < (%d,%d,%d)", tp2.i, tp2.j, tp2.k);
    }
    else {
      MB_DPRINT("compare (%d,%d,%d)", tp1.i, tp1.j, tp1.k);
      MB_DPRINTLN(" >= (%d,%d,%d)", tp2.i, tp2.j, tp2.k);
    }
    return res;
     */
  }
};

typedef std::set<RSFace *, RSFaceComp> RSFaceSet;

///////////////////////////////////////////////

class RSComponent
{
public:
  RSVertList m_verts;
  RSEdgeList m_edges;

  RSFaceSet m_faceset;

  SESArcList m_arcs;

public:
  RSComponent() {}
  ~RSComponent();

  //////////

  RSVert *addVert(int idx);

  //////////

  RSFace *addFace(int idx_i, int idx_j, int idx_k);

  RSFace *findFace(int idx_i, int idx_j, int idx_k);

  //////////

  int addSESArc(SESArc *parc) {
    int id = m_arcs.size();
    m_arcs.push_back(parc);
    return id;
  }

  SESArc *getSESArc(int i) const {
    return m_arcs[i];
  }

  //////////

  RSEdge *addEdge(int idx_i, int idx_j);

};

}

#endif

