// -*-Mode: C++;-*-
//
// Mesh refine routines for MapIpolSurf
//

#ifndef XTAL_MESH_REFINE_PART_MIN_HPP_INCLUDED
#define XTAL_MESH_REFINE_PART_MIN_HPP_INCLUDED

#define GSL_DLL 1
#include <gsl/gsl_multimin.h>
#include <gsl/gsl_blas.h>

#include <CGAL/Simple_cartesian.h>
#include <CGAL/Surface_mesh.h>
//#include <CGAL/Polygon_mesh_processing/refine.h>
#include <CGAL/Polygon_mesh_processing/remesh.h>
#include <unordered_map>

#include "MapBsplIpol.hpp"
#include <gfx/DisplayContext.hpp>
#include <gfx/SolidColor.hpp>
#include <qlib/Utils.hpp>

namespace xtal {

  using qlib::Vector3F;
  using gfx::DisplayContext;

  typedef CGAL::Simple_cartesian<double> K;
  typedef CGAL::Surface_mesh<K::Point_3> Mesh;
  typedef Mesh::Vertex_index vid_t;
  typedef Mesh::Face_index fid_t;
  namespace PMP = CGAL::Polygon_mesh_processing;

  inline Vector3F convToV3F(const K::Point_3 &src) {
    return Vector3F(src.x(), src.y(), src.z());
  }

  inline K::Point_3 convToCGP3(const Vector3F &src) {
    return K::Point_3(src.x(), src.y(), src.z());
  }

  inline float radratio(const Vector3F &v0, const Vector3F &v1, const Vector3F &v2) {
    float a = (v0-v1).length();
    float b = (v1-v2).length();
    float c = (v2-v0).length();
    return (b + c - a)*(c + a - b)*(a + b - c) / (a*b*c);
  }

  inline float angle(const Vector3F &v1, const Vector3F &v2)
  {
    const float u = float( v1.dot(v2) );
    const float l = float( v1.length() ) * float( v2.length()  );
    const float res = ::acos( u/l );
    return res;
  }

  inline float minangl(const Vector3F &v0, const Vector3F &v1, const Vector3F &v2, bool bmax = false) {
    float a = angle( (v1-v0), (v2-v0) );
    float b = angle( (v0-v1), (v2-v1) );
    float c = angle( (v1-v2), (v0-v2) );
    if (bmax)
      return qlib::max( qlib::max(a, b), c);
    else
      return qlib::min( qlib::min(a, b), c);
  }

  inline float calcNormScore(const Vector3F &v0, const Vector3F &v1, const Vector3F &v2,
                             const Vector3F &n0, const Vector3F &n1, const Vector3F &n2)
  {
    Vector3F nav = (n0+n1+n2).normalize();
    Vector3F fav = ((v1-v0).cross(v2-v0)).normalize();
    return qlib::abs(nav.dot(fav));
  }

  inline Vector3F calcNorm(const Vector3F &v1, const Vector3F &v2, const Vector3F &v3)
  {
    Vector3F tmp = (v2-v1).cross(v3-v1);
    return tmp;
    //return tmp.normalize();
  }

  inline bool checkSide(const Vector3F &v1, const Vector3F &v2, const Vector3F &v3, const Vector3F &vcom)
  {
    Vector3F vn = calcNorm(v1, v2, v3);
    float det = vn.dot(vcom-v1);
    if (det>0.0f)
      return true;
    else
      return false;
  }

  void dumpTriStats(const LString &fname, const Mesh &cgm, const MapBsplIpol &ip);

  void dumpEdgeStats(const LString &fname, const Mesh &cgm, const MapBsplIpol &ip);

  void drawMeshLines(DisplayContext *pdl, const Mesh &cgm, float r, float g, float b);

  void checkMeshNorm1(DisplayContext *pdl, const Mesh &cgm, const MapBsplIpol &ip);

  class FindProjSurf
  {
  public:
    const MapBsplIpol *m_pipol;
    Vector3F m_v0, m_dir;
    float m_isolev;
    float m_eps;

    inline bool isNear(float f0, float f1) const {
      float del = qlib::abs(f0-f1);
      if (del<m_eps)
        return true;
      else
        return false;
    }

    inline Vector3F getV(float rho) const
    {
      return m_v0 + m_dir.scale(rho);
    }

    inline float getF(float rho) const
    {
      return m_pipol->calcAt(getV(rho)) - m_isolev;
    }

    inline float getDF(float rho) const
    {
      Vector3F dfdv = m_pipol->calcDiffAt(getV(rho));
      return m_dir.dot( dfdv );
    }

    inline Vector3F calcNorm(const Vector3F &v) const
    {
      Vector3F rval = m_pipol->calcDiffAt(v);
      rval.normalizeSelf();
      return rval;
    }

    inline void setup(const Vector3F &vini)
    {
      m_v0 = vini;
      m_dir = calcNorm(vini);
    }

    bool findPlusMinus(float &del, bool &bSol);

    bool solve(float &rval);

    bool findRoot(float rhoL, float rhoU, float &rval) const;

    bool findRootNrImpl2(float rho0, float &rval, bool bdump = true) const;
  };


  class ParticleRefine
  {
  public:
    const MapBsplIpol *m_pipol;

    std::vector<float> m_posary;
    std::vector<float> m_grad;
    std::vector<bool> m_fix;

    struct Bond {
      int id1;
      int id2;
      float r0;
      float kf;
    };

    struct Angle {
      int id1;
      int id2;
      int id3;
      float th0;
    };

    std::vector<Bond> m_bonds;

    std::vector<Angle> m_angls;

    int m_nMaxIter;
    float m_isolev;
    float m_mapscl;
    float m_bondscl;
    float m_bondscl2;
    float m_anglscl;

    bool m_bUseMap;
    bool m_bUseProj;

    float m_averEdgeLen;

    /// vid-> particle index map
    std::unordered_map<int,int> m_vidmap;

    void allocData(int npos, int nbond, int nangl=0) {
      m_posary.resize(npos*3);
      m_grad.resize(npos*3);
      m_fix.resize(npos);
      for (int i=0; i<npos; ++i) m_fix[i] = false;
      m_bonds.resize(nbond);
      m_angls.resize(nangl);
    }

    Vector3F getPos(int vid)
    {
      int ind = m_vidmap[vid];
      return Vector3F(&m_posary[ind*3]);
    }

    void setPos(int ind, int vid, const Vector3F &pos)
    {
      m_posary[ind*3 + 0] = pos.x();
      m_posary[ind*3 + 1] = pos.y();
      m_posary[ind*3 + 2] = pos.z();
      m_vidmap.insert(std::pair<int,int>(vid, ind));
    }

    void setBond(int bind, int vid1, int vid2, float r0)
    {
      m_bonds[bind].id1 = m_vidmap[vid1];
      m_bonds[bind].id2 = m_vidmap[vid2];
      m_bonds[bind].r0 = r0;
      m_bonds[bind].kf = 1.0f;
    }

    void setFixed(int vid1)
    {
      m_fix[ m_vidmap[vid1] ] = true;
    }

    void setAngle(int ind, int vid1, int vid2, int vid3, float th0)
    {
      m_angls[ind].id1 = m_vidmap[vid1];
      m_angls[ind].id2 = m_vidmap[vid2];
      m_angls[ind].id3 = m_vidmap[vid3];
      m_angls[ind].th0 = th0;
    }

    inline Vector3F calcNorm(const Vector3F &v) const
    {
      Vector3F rval = m_pipol->calcDiffAt(v);
      rval.normalizeSelf();
      return rval;
    }

    float calcAngle(int vid1, int vid2, int vid3)
    {
      int ai = m_vidmap[vid1]*3;
      int aj = m_vidmap[vid2]*3;
      int ak = m_vidmap[vid3]*3;

      Vector3F vi(&m_posary[ai]), vj(&m_posary[aj]), vk(&m_posary[ak]);

      Vector3F vij = vi-vj;
      Vector3F vkj = vk-vj;

      const float u = vij.dot(vkj);
      const float l = vij.length() * vkj.length();
      return ::acos( u/l );
    }

    enum {
      BOND_SHRINK,
      BOND_STRETCH,
      BOND_FULL,
      BOND_FULL2,
    };

    int m_nBondType;

    float calcFdF(std::vector<float> &pres);

    struct RefineLog
    {
      int niter;
      float eng;
      float mov_max;
      RefineLog(int aniter,float aeng,float amov_max)
           : niter(aniter), eng(aeng), mov_max(amov_max)
      {
      }
    };
    std::vector<RefineLog> m_refilog;

    void dumpRefineLog(const LString &fname);

    void refine();

    //////////

    FindProjSurf m_sol;

    void project(gsl_vector *x);

    enum {
      MIN_CG,
      MIN_SD,
      MIN_BFGS,
    };

    void refineGsl(int ntype=MIN_BFGS);

    bool m_bUseAdp;

  public:
    inline float calcIdealL(const Vector3F &v0, const Vector3F &v1) const
    {
      Vector3F vm = (v0 + v1).scale(0.5);
      return m_pipol->calcIdealL(vm);
    }

    void refineSetup(MapBsplIpol *pipol, Mesh &cgm);

    float calcAverEdgeLen() const;

    void setAdpBond();

    void setConstBond(float val)
    {
      const int nbon = m_bonds.size();
      int id1, id2, i;
      for(i=0; i<nbon; ++i){
        m_bonds[i].r0 = val;
        m_bonds[i].kf = 1.0f;
      }
    }

    void showMeshCurvCol(DisplayContext *pdl, const Mesh &cgm);

    void writeResult(Mesh &cgm)
    {
      Vector3F vnew;
      for(vid_t vd : cgm.vertices()){
        vnew = getPos(int(vd));
        cgm.point(vd) = convToCGP3(vnew);
      }
    }

  };

}

#endif

