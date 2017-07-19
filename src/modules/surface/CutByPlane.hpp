// -*-Mode: C++;-*-
//
// Cut molecular surface by a plane
//

#ifndef SURF_CUT_BY_PLANE_HPP
#define SURF_CUT_BY_PLANE_HPP

#include "surface.hpp"
#include <qlib/Vector4D.hpp>
#include <qlib/Matrix3D.hpp>
#include <qlib/ByteMap.hpp>

#include "MolSurfObj.hpp"

namespace surface {

  using qlib::Vector4D;
  using qlib::Matrix3D;

  class SURFACE_API CutByPlane
  {
  private:
    // workarea

    Vector4D m_norm, m_pos;
    double m_cdiv;

    /// transformation to plane coordinate system
    Matrix3D m_xfm;

    /// transformation from plane to original coord system
    Matrix3D m_ixfm;

    /// new vertex list
    std::vector<MSVert> m_verts;

    /// new face list
    std::vector<MSFace> m_faces;

    std::vector<char> m_vinflg;

    /// mapping from old to new vertex ID
    std::vector<int> m_vidmap;

    /// vertex ID map on the section
    std::map<int,int> m_sidmap;

    struct Bndry
    {
      //typedef std::deque<int> ids_t;
      typedef std::vector<int> ids_t;
      ids_t ids;
      typedef std::list<Bndry *> ins_t;
      ins_t ins;
      ~Bndry();
    };

    Bndry m_outers;

    /// Section grid
    qlib::Array3D<int> m_segrid;
    double m_dx, m_dy;
    Vector4D m_vmin;

    /// Boundary ID map
    std::map<int, int> m_bdmap;

    /// Target surface object
    MolSurfObj *m_pTgt;

    ////////////////////////////////////////////

  public:

    /** default constructor */
    CutByPlane(MolSurfObj *pobj)
         : m_pTgt(pobj)
    {
    }

    /** destructor */
    ~CutByPlane()
    {
      fini();
    }

    void init()
    {
    }

    void fini();

    void doit(double cdiv, const Vector4D &norm, const Vector4D &pos,
              bool bNoSect = false);

  private:

    enum {
      FLG_OUT=0,
      FLG_IN=1,
      FLG_ON=2
    };

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

    Vector4D getVert(int id) const
    {
      return m_verts[id].v3d();
    }

    Vector4D getNorm(int id) const
    {
      return m_verts[id].n3d();
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

    Vector4D fromPlane(const Vector4D &v) const
    {
      Vector4D rv(v);
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

    void checkOuterBndry();
    bool isBndryEnclosed(Bndry *pout, Bndry *pin) const;

    void getCrossRgn(double xx, const Bndry &outer, std::set<double> &yset) const;

    void appendBndryMap(int id1, int id2)
    {
      m_bdmap.insert(std::map<int, int>::value_type(id1, id2));
    }


    void makeSection(Bndry &outer);

    bool isGridInvalid(int i, int j) const;

    bool chkSgBndry(int i, int j, int ntyp, const MSFace &f, const Bndry &outer);
    bool chkSgBndry2(bool be[], int idd[]);

    void makeSeam(const Bndry &outer, const Bndry &inners);

    Vector4D grid2vec(int i, int j) const {
      const double xx = (double(i)+0.5)*m_dx + m_vmin.x();
      const double yy = (double(j)+0.5)*m_dy + m_vmin.y();
      return Vector4D(xx, yy, 0.0);
    }


    bool checkCross1(int i, int j, int ntyp, const Bndry &outer) const;
    bool checkCrossHelper(const Vector4D &b1, const Vector4D &b2,
                          const Vector4D &c1, const Vector4D &c2) const;

    void update();
  };

}

#endif

