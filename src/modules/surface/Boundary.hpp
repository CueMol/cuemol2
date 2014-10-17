// -*-Mode: C++;-*-
//
// Boundary class for CutByPlane implementation
//

#ifndef SURF_BOUNDARY_HPP
#define SURF_BOUNDARY_HPP

#include "surface.hpp"
#include <qlib/Vector2D.hpp>
#include <qlib/Vector4D.hpp>

namespace surface {

  using qlib::Vector4D;
  using qlib::Vector2D;

  class Boundary;
  class CutByPlane2;

  class BoundarySet
       : public std::list<Boundary*>
  {
    typedef std::list<Boundary*> super_t;
    
  public:
    BoundarySet() {}

    ~BoundarySet();

    /// Build bondary set from SID Map
    void build(std::map<int, int> &sidmap, CutByPlane2 *pCBP);

  private:
    /// Build inner boundary structures
    void buildInnerBoundary();

  };

  class Boundary
  {
  public:
    struct Elem
    {
      Elem() : id(-1) {}
      Elem(int aid, const Vector2D &apos) : id(aid), pos(apos) {}
      int id;
      Vector2D pos;
    };

    typedef std::vector<Elem> data_t;

    typedef data_t::const_iterator const_iterator;
    typedef data_t::iterator iterator;

  private:

    /// boundary vertex list (in 2D plane)
    data_t m_verts;

  public:
    Boundary() {}
    ~Boundary() {}

    void insert(int id, const Vector2D &pos)
    {
      m_verts.push_back(Elem(id, pos));
    }

    int getSize() const
    {
      return m_verts.size();
    }

    bool isEmpty() const
    {
      return m_verts.empty();
    }

    const_iterator begin() const { return m_verts.begin(); }
    const_iterator end() const { return m_verts.end(); }
    iterator begin() { return m_verts.begin(); }
    iterator end() { return m_verts.end(); }

    Vector2D getVert(int i) const
    {
      return m_verts[i].pos;
    }

    int getID(int i) const
    {
      return m_verts[i].id;
    }

    Vector2D getVertCirc(int i) const
    {
      return getVert(i%getSize());
    }

    bool isEnclosing(const Vector2D &pos, bool bChkInset=false) const;

    int isEnclImpl(const Vector2D &pos, bool bChkInset) const;

  private:

    /// inner boundary set
    BoundarySet m_ins;

  public:

    BoundarySet::const_iterator ins_begin() const
    {
      return m_ins.begin();
    }

    BoundarySet::const_iterator ins_end() const
    {
      return m_ins.end();
    }
    
    int getInsetSize() const { return m_ins.size(); }

    void insertToInset(Boundary *pbn2)
    {
      m_ins.push_back(pbn2);
    }

  };

}

#endif

