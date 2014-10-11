// -*-Mode: C++;-*-
//
// Cut molecular surface by a plane
//

#ifndef SURF_CUT_BY_PLANE_HPP
#define SURF_CUT_BY_PLANE_HPP

#include "surface.hpp"
#include <qlib/Matrix3D.hpp>
//#include <qlib/ByteMap.hpp>

#include "MolSurfObj.hpp"
#include "Boundary.hpp"

namespace surface {

  using qlib::Vector4D;
  using qlib::Vector2D;
  using qlib::Matrix3D;

  class SURFACE_API CutByPlane2
  {
  private:
    // workarea

    typedef std::map<int,int> idmap_t;
    //typedef boost::unorderd_map<int,int> idmap_t;

    Vector4D m_norm, m_pos;
    double m_cdiv;

    Matrix3D m_xfm, m_ixfm;

    /// new vertex list
    std::vector<MSVert> m_verts;

    /// new face list
    std::vector<MSFace> m_faces;

    std::vector<char> m_vinflg;

    /// mapping from old to new vertex ID
    std::vector<int> m_vidmap;

    /// Vertex ID map on the section boundary
    idmap_t m_sidmap;

    BoundarySet m_outers;

    /// Target surface object
    MolSurfObj *m_pTgt;

    bool m_bBody;

    ////////////////////////////////////////////

  public:

    /// Default constructor
    CutByPlane2(MolSurfObj *pobj)
         : m_pTgt(pobj)
    {
    }

    /// Destructor
    ~CutByPlane2()
    {
      fini();
    }

    void init()
    {
    }

    void fini();

    void doit(double cdiv, const Vector4D &norm, const Vector4D &pos,
              bool bBody, bool bSect);

  public:
    int addNewVertex(const MSVert &vtx)
    {
      int id = m_verts.size();
      m_verts.push_back(vtx);
      return id;
    }

    int addNewVertex(const Vector4D &vtx, const Vector4D &norm)
    {
      int id = m_verts.size();
      m_verts.push_back(MSVert(vtx, norm));
      return id;
    }
    
    int addSectVert(const Vector4D &vtx)
    {
      int id = m_verts.size();
      m_verts.push_back(MSVert(vtx, -m_norm));
      return id;
    }

    int addNewFace(const MSFace &f)
    {
      int id = m_faces.size();
      m_faces.push_back(f);
      return id;
    }

    int addNewFace(int id1, int id2, int id3)
    {
      MSFace f;
      f.id1 = id1;
      f.id2 = id2;
      f.id3 = id3;
      return addNewFace(f);
    }

  private:

    enum {
      FLG_OUT=0,
      FLG_IN=1,
      FLG_ON=2
    };

    bool checkSingle(int id[], void *pedset);
    bool checkDouble(int id[], void *pedset);
    bool checkOn1(int id[], void *pedset);
    bool checkOn2(int id[], void *pedset);

    bool divideEdge(int id1, int id2, Vector4D &rvec, Vector4D &rnorm);
    int checkCutEdge(int id1, int id2, void *pedset);

    bool select_trig(const Vector4D &vj0, const Vector4D &vj1,
                     const Vector4D &vk0, const Vector4D &vk1);

    bool select_trig(const MSVert &vj0, const MSVert &vj1,
                     const MSVert &vk0, const MSVert &vk1)
    {
      return select_trig(vj0.v3d(), vj1.v3d(), vk0.v3d(), vk1.v3d());
    }

    Vector4D ext_tng(const Vector4D &v1,const Vector4D &v2,const Vector4D &v3);

    void setupConvMat();

    void makeSectionMesh(Boundary &outer);

    void update();

  public:
    Vector4D getVert(int id) const
    {
      return m_verts[id].v3d();
    }

    Vector4D getNorm(int id) const
    {
      return m_verts[id].n3d();
    }

    Vector4D fromPlane(const Vector4D &v) const
    {
      Vector4D rv(v);
      m_xfm.xform(rv);
      rv += m_pos;
      return rv;
    }

    Vector4D fromPlane(const Vector2D &v) const
    {
      Vector4D rv(v.x(), v.y(), 0.0);
      m_xfm.xform(rv);
      rv += m_pos;
      return rv;
    }

    Vector4D ontoPlane(const Vector4D &v) const
    {
      Vector4D rv(v - m_pos);
      m_ixfm.xform(rv);
      return rv;
    }

    Vector2D ontoPlane(int id) const
    {
      Vector4D pos = ontoPlane( getVert(id) );
      return Vector2D(pos.x(), pos.y());
    }

  };

  namespace cbp_detail {

    struct Edge
    {
      Edge() : id1(0), id2(0) {}
      Edge(int i1, int i2) : id1(i1), id2(i2) {}
      int id1, id2;
      int nvid;
    };

    inline bool operator < (const Edge &a1, const Edge &a2)
    {
      if (a1.id1<a2.id1)
        return true;
      else if (a1.id1>a2.id1)
        return false;

      // a1.id1==a2.id1
      if (a1.id2<a2.id2)
        return true;
      else
        return false;
    }

    typedef std::set<Edge> EdgeSet;
  }
}

#endif

