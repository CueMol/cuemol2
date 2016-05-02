// -*-Mode: C++;-*-
//
// Graph Edges
//

#ifndef REND_GRAPH_EDGE_HPP_INCLUDE_
#define REND_GRAPH_EDGE_HPP_INCLUDE_

#include "render.hpp"
#include <qlib/Vector4D.hpp>

namespace render {

  /// Face class for the silhouette/edge extraction
  class SEFace
  {
  public:
    /// index for the vertex array
    int iv1, iv2, iv3;

    /// mode of this face (the same as the nmode in MeshFace (MeshData.hpp))
    int nmode;

    /// normal vector of this face
    Vector4D n;

  };

  //////////

  /// Vertex class for the silhouette/edge lines
  class SEVertex
  {
  public:
    /// Index for the vertex array;
    int iv;

    /// visibility flag
    bool bvis;

    /// silhouette vis flag
    bool bsil;

    /// show counter for corner-point display
    int nshow;
  };
  
  //////////

  typedef std::set<double> IsecList;

  /// Edge class for the silhouette/edge extraction
  class SEEdge
  {
  public:
    /// Index for the vertex array
    int iv1;
    int iv2;

    /// Index for the corner point array
    int icp1;
    int icp2;
    
    /// Index for the face array (vector<Face>)
    int if1;
    int if2;

    bool bForceShow;

  private:
    /// Intersection list
    /// (NULL if no intersection with meshes)
    IsecList *m_pIsecList;

  public:
    SEEdge() : iv1(-1), iv2(-1), icp1(-1), icp2(-1), if1(-1), if2(-1), bForceShow(false), m_pIsecList(NULL) {}

    SEEdge(int a1, int a2)
         : icp1(-1), icp2(-1), if1(-1), if2(-1), bForceShow(false), m_pIsecList(NULL)
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

    /// copy ctor
    SEEdge(const SEEdge &arg)
         : iv1(arg.iv1), iv2(arg.iv2), icp1(arg.icp1), icp2(arg.icp2), if1(arg.if1), if2(arg.if2), bForceShow(arg.bForceShow), m_pIsecList(NULL)
    {
    }
    
    /// assign op
    const SEEdge &operator=(const SEEdge &arg)
    {
      if(&arg!=this){
        iv1 = arg.iv1;
        iv2 = arg.iv2;
        icp1 = arg.icp1;
        icp2 = arg.icp2;
        if1 = arg.if1;
        if2 = arg.if2;
        bForceShow = arg.bForceShow;
        m_pIsecList = NULL;
      }
      return *this;
    }

    ~SEEdge() {
      clearIsecList();
    }

    //////////

    /// overwrite the corner point indeces
    /// (this does not change the order of this elem)
    void setCpIndex(int i1, int i2) const
    {
      SEEdge *pthis = const_cast<SEEdge *>(this);
      pthis->icp1 = i1;
      pthis->icp2 = i2;
    }

    //////////

    void clearIsecList() {
      if (m_pIsecList!=NULL)
        delete m_pIsecList;
      m_pIsecList = NULL;
    }

    void pushIsecList(double f) const {
      SEEdge *pthis = const_cast<SEEdge *>(this);
      if (m_pIsecList==NULL)
        pthis->m_pIsecList = new IsecList();
      pthis->m_pIsecList->insert(f);
    }

    int getIsecSize() const {
      if (m_pIsecList==NULL)
        return 0;
      return m_pIsecList->size();
    }

    const IsecList *getIsecList() const {
      return m_pIsecList;
    }

    int calcIsecPoints(const Vector4D &v1, const Vector4D &v2,
                        std::deque<Vector4D> &pts) const
    {
      if (m_pIsecList==NULL)
        return 0;
      
      Vector4D v12 = v2-v1;
      int nret = 0;
      BOOST_FOREACH (double fsec, *m_pIsecList) {
        pts.push_back( v1 + v12.scale(fsec) );
        ++nret;
      }

      return nret;
    }

  };

  inline bool operator < (const SEEdge &a1, const SEEdge &a2)
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

  class SEEdgeSet : public std::set<SEEdge>
  {
    typedef std::set<SEEdge> super_t;

  public:

    //SEEdgeSet() : std::set<SEEdge> ()

    bool insertEdge(int iv1, int iv2, int fid)
    {
      MB_ASSERT(iv1!=iv2);

      SEEdge eg(iv1, iv2);

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

