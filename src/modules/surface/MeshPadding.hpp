// -*-Mode: C++;-*-
//
// Triangular mesh padding routine
//

#ifndef MESH_PADDING_HPP_INCLUDED_
#define MESH_PADDING_HPP_INCLUDED_

namespace surface {

//typedef std::pair<int,int> VgEdge;
struct VgEdge : public std::pair<int,int>
{
  int flag;
  VgEdge(int i, int j) : std::pair<int,int>(i,j), flag(0) {}
};

class VgEdgeList : public std::list<VgEdge>
{
public:
  typedef std::list<VgEdge> super_t;
  typedef VgEdge value_type;
  
  super_t avoid_list;

public:
  void put_inner(int i, int j) {
    if (std::find(avoid_list.begin(), avoid_list.end(), value_type(i,j))!=avoid_list.end())
      return;
    super_t::push_back(value_type(i, j));
  }

  void put_avoid(int i, int j) {
    avoid_list.push_back(value_type(j, i));
  }

  void put_outer(int i, int j) {
    super_t::push_back(value_type(i, j));
  }

  void getVerts(std::list<int> &ls) {
    std::set<int> vset;
    super_t::const_iterator iter = super_t::begin();
    for (; iter!=super_t::end(); ++iter) {
      vset.insert(iter->first);
      vset.insert(iter->second);
    }
    ls.assign(vset.begin(), vset.end());
  }
};

/////////////////////////////////////

struct VgEdgeCompFtor
{
public:
  inline
  bool operator() (const VgEdge &p1, const VgEdge &p2) const {
    if (p1.first<p2.first)
      return true;
    else if (p1.first>p2.first)
      return false;
    
    if (p1.second<p2.second)
      return true;
    
    return false;
  }
};

/////////////////////////////////////

class VgEdgeSet : public std::set<VgEdge, VgEdgeCompFtor>
{
public:
  typedef std::set<VgEdge, VgEdgeCompFtor> super_t;
  super_t m_inner;

  bool put(int i, int j, int flag=0) {
    VgEdge vv(i, j);
    vv.flag = flag;

    super_t::iterator iter = super_t::find(vv);
    if (iter!=super_t::end()) {
      LOG_DPRINTLN("Fatal error: duplicated edge (%d,%d)<-->(%d,%d)", i, j, iter->first, iter->second);
      return false;
    }

    VgEdge vvinv(j, i);
    super_t::iterator iter_inv = super_t::find(vvinv);
    if (iter_inv!=super_t::end()) {
      // complementaly edge of (i,j) is found!!
      // --> edge vanishes
//MB_DPRINTLN("Edge (%d,%d) canceled out", i, j);
      super_t::erase(iter_inv);
      return true;
    }
    
    // check the inner edges
    iter_inv = m_inner.find(vvinv);
    if (iter_inv!=m_inner.end()) {
      // complementaly edge of (i,j) is found!!
      // --> edge vanishes
//MB_DPRINTLN("Edge (%d,%d) canceled out with innerE", i, j);
      m_inner.erase(iter_inv);
      return true;
    }
    iter = m_inner.find(vv);
    if (iter!=m_inner.end()) {
      LOG_DPRINTLN("Fatal error: inner dup edge (%d,%d)<-->(%d,%d)", i, j, iter->first, iter->second);
      return false;
    }
    
    // OK.
//MB_DPRINTLN("put OK %d->%d", i, j);
    super_t::insert(vv);
    return true;
  }

  bool find_vert(const VgEdge &vv) const {
    return super_t::find(vv)!=super_t::end();
  }

  bool put_inner(int i, int j) {
    // MB_DPRINTLN("put %d->%d", i, j);
    VgEdge vv(i, j);

    super_t::iterator iter = m_inner.find(vv);
    if (iter!=m_inner.end()) {
      LOG_DPRINTLN("Fatal error in put_inner: dup edge (%d,%d)<-->(%d,%d)", i, j, iter->first, iter->second);
      return false;
    }

    VgEdge vvinv(j, i);
    super_t::iterator iter_inv = m_inner.find(vvinv);
    if (iter_inv!=m_inner.end()) {
      // complementaly edge of (i,j) is found!!
      //MB_DPRINTLN("Cyclic edge (%d,%d)<-->(%d,%d)", i, j, iter_inv->first, iter_inv->second);
      m_inner.erase(iter_inv);
      return true;
    }
    
    // OK.
    m_inner.insert(vv);
    return true;
  }
  
};

/////////////////////////////////////

class SimpleEdgeSet : public std::set<VgEdge, VgEdgeCompFtor>
{
public:
  typedef std::set<VgEdge, VgEdgeCompFtor> super_t;

  void addFace(int id1, int id2, int id3) {
    put(id1, id2);
    put(id2, id3);
    put(id3, id1);
  }

  bool put(int i, int j) {
    // MB_DPRINTLN("put %d->%d", i, j);
    VgEdge vv(i, j);

    super_t::iterator iter = super_t::find(vv);
    if (iter!=super_t::end()) {
      //LOG_DPRINTLN("SimpleEdgeSet Fatal error: duplicated edge (%d,%d)<-->(%d,%d)", i, j, iter->first, iter->second);
      return false;
    }

    VgEdge vvinv(j, i);
    super_t::iterator iter_inv = super_t::find(vvinv);
    if (iter_inv!=super_t::end()) {
      // complementaly edge of (i,j) is found!!
      // --> edge vanishes
      //MB_DPRINTLN("Edge (%d,%d) canceled out", i, j);
      super_t::erase(iter_inv);
      return true;
    }
    
    // OK.
    super_t::insert(vv);
    return true;
  }

  bool find_vert(const VgEdge &vv) const {
    return super_t::find(vv)!=super_t::end();
  }

  bool find_vert_dir(int i, int j) const {
    VgEdge vv(i, j);
    return super_t::find(vv)!=super_t::end();
  }

  bool find_vert_nodir(int i, int j) const {
    VgEdge vv(i, j);
    if (super_t::find(vv)!=super_t::end())
      return true;
    VgEdge vvinv(j, i);
    if (super_t::find(vvinv)!=super_t::end())
      return true;
    return false;
  }

  void convToList(VgEdgeList &el) const {
    super_t::const_iterator iter = begin();
    for (; iter!=end(); ++iter) {
      const VgEdge &ve = *iter;
      //el.put_inner(ve.first, ve.second);
      el.put_inner(ve.second, ve.first);
    }
  }

};

}

#endif // MESH_PADDING_HPP_INCLUDED_

