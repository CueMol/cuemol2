// -*-Mode: C++;-*-
//
// Mesh refine routines for MapIpolSurf
//

#define GSL_DLL 1
#include <gsl/gsl_multimin.h>
#include <gsl/gsl_blas.h>

#include <CGAL/Simple_cartesian.h>
#include <CGAL/Surface_mesh.h>
//#include <CGAL/Polygon_mesh_processing/refine.h>
#include <CGAL/Polygon_mesh_processing/remesh.h>
#include <unordered_map>

namespace xtal {

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

  void dumpTriStats(const LString &fname, const Mesh &cgm, const MapBsplIpol &ip)
  {
    FILE *fp = fopen(fname, "w");
    int i, j;

    //vid_t vid[3];
    Vector3F v[3], g[3], vn;
    float minang, maxang, rr, ns;

    i=0;
    for(fid_t fd : cgm.faces()){

      j=0;
      BOOST_FOREACH(vid_t vd,vertices_around_face(cgm.halfedge(fd), cgm)){
        MB_ASSERT(j<3);
        v[j] = convToV3F( cgm.point(vd) );
        g[j] = -(ip.calcDiffAt(v[j])).normalize();
        ++j;
      }
      MB_ASSERT(j==3);

      minang = minangl(v[0], v[1], v[2]);
      maxang = minangl(v[0], v[1], v[2], true);
      rr = radratio(v[0], v[1], v[2]);
      vn = calcNorm(v[0], v[1], v[2]).normalize();
      ns = (vn.dot(g[0]) + vn.dot(g[1]) + vn.dot(g[2]))/3.0f;

      fprintf(fp, "Tri %d min %f max %f rr %f ns %f\n",
              i, qlib::toDegree(minang), qlib::toDegree(maxang), rr, ns);
      ++i;
    }

    fclose(fp);
  }

  void drawMeshLines(DisplayContext *pdl, const Mesh &cgm, float r, float g, float b)
  {
    pdl->setLineWidth(1.0);
    pdl->setLighting(false);
    pdl->startLines();
    pdl->color(r,g,b);

    for(Mesh::Edge_index ei : cgm.edges()){
      Mesh::Halfedge_index h0 = cgm.halfedge(ei, 0);
      Vector3F v00 = convToV3F( cgm.point( cgm.target(h0) ) );

      Mesh::Halfedge_index h1 = cgm.halfedge(ei, 1);
      Vector3F v10 = convToV3F( cgm.point( cgm.target(h1) ) );

      pdl->vertex(v00);
      pdl->vertex(v10);
    }
    pdl->end();
    pdl->setLighting(true);
  }


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

    bool findPlusMinus(float &del, bool &bSol)
    {
      del = 0.0f;
      float F0 = getF(del);
      if (isNear(F0, 0.0f)) {
        bSol = true;
        return true;
      }

      bSol = false;
      int i;

      if (F0>0.0) {
        del = -0.1;
        for (i=0; i<10; ++i) {
          if (F0*getF(del)<0.0f)
            return true;
          del -= 0.1;
        }
      }
      else {
        del = 0.1;
        for (i=0; i<10; ++i) {
          if (F0*getF(del)<0.0f)
            return true;
          del += 0.1;
        }
      }

      return false;
    }

    bool solve(float &rval)
    {
      bool bSol;
      float del;

      if (!findPlusMinus(del, bSol)) {
        findPlusMinus(del, bSol);
        return false;
      }

      if (bSol) {
        rval = 0.0f;
        return true;
      }

      float rhoL = 0.0f;
      float rhoU = del;

      if (rhoL>rhoU)
        std::swap(rhoL, rhoU);

      if (findRoot(rhoL, rhoU, rval)) {
        return true;
      }

      findRoot(rhoL, rhoU, rval);
      return false;
    }

    bool findRoot(float rhoL, float rhoU, float &rval) const
    {
      float fL = getF(rhoL);
      float fU = getF(rhoU);

      float rho;
      float rho_sol;

      //// Initial estimation
      // Bisec
      rho = (rhoL+rhoU) * 0.5f;
      // FP
      //rho = (rhoL*fU - rhoU*fL)/(fU-fL);

      for (int i=0; i<10; ++i) {
        if (findRootNrImpl2(rho, rho_sol, true)) {
          if (rho_sol<rhoL || rhoU<rho_sol) {
            MB_DPRINTLN("ProjSurf.findRoot> root %f is not found in rhoL %f /rhoU %f", rho_sol, rhoL, rhoU);
          }
          rval = rho_sol;
          return true;
        }

        // Newton method failed --> bracket the solution by Bisec/FP method
        float frho = getF(rho);

        // select the upper/lower bounds
        if (frho*fU<0.0) {
          // find between mid & rhoU
          rhoL = rho;
          fL = frho;
        }
        else if (frho*fL<0.0) {
          // find between rhoL & mid
          rhoU = rho;
          fU = frho;
        }
        else {
          MB_DPRINTLN("ProjSurf.findRoot> inconsistent fL/fU");
          break;
        }

        // Update the solution estimate
        // Bisection
        rho = (rhoL + rhoU)*0.5;
        // FP
        //rho = (rhoL*fU - rhoU*fL)/(fU-fL);
      }

      MB_DPRINTLN("ProjSurf.findRoot> root not found");
      return false;
    }

    bool findRootNrImpl2(float rho0, float &rval, bool bdump = true) const
    {
      int i, j;
      float Frho, dFrho, mu;

      // initial estimate: rho0
      float rho = rho0;

      bool bConv = false;
      for (i=0; i<10; ++i) {
        Frho = getF(rho);
        if (isNear(Frho, 0.0f)) {
          rval = rho;
          bConv = true;
          break;
        }

        dFrho = getDF(rho);

        mu = 1.0f;

        if (bdump) {
          for (j=0; j<10; ++j) {
            float ftest1 = qlib::abs( getF(rho - (Frho/dFrho) * mu) );
            float ftest2 = (1.0f-mu/4.0f) * qlib::abs(Frho);
            if (ftest1<ftest2)
              break;
            mu = mu * 0.5f;
          }
          if (j == 10) {
            // cannot determine dumping factor mu
            //  --> does not use dumping
            mu = 1.0f;
          }
        }


        rho += -(Frho/dFrho) * mu;
      }

      rval = rho;
      return bConv;
    }

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
    float m_anglscl;

    bool m_bUseMap;
    bool m_bUseProj;

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

    float calcFdF(std::vector<float> &pres)
    {
      int i, id1, id2;
      float len, con, ss;

      const int nbon = m_bonds.size();
      const int nang = m_angls.size();
      const int ncrds = m_posary.size();
      const int npart = ncrds/3;

      float eng = 0.0f;
      for (i=0; i<ncrds; ++i) {
        pres[i] = 0.0f;
      }

      for (i=0; i<nbon; ++i) {
        id1 = m_bonds[i].id1 * 3;
        id2 = m_bonds[i].id2 * 3;

        const float dx = m_posary[id1+0] - m_posary[id2+0];
        const float dy = m_posary[id1+1] - m_posary[id2+1];
        const float dz = m_posary[id1+2] - m_posary[id2+2];

        len = sqrt(dx*dx + dy*dy + dz*dz);
        //ss = qlib::max(0.0f,  len - m_bonds[i].r0);
        ss = qlib::min(0.0f,  len - m_bonds[i].r0);
        //ss = len - m_bonds[i].r0;

        con = 2.0f * m_bondscl * ss/len;

        if (!m_fix[id1/3]) {
          pres[id1+0] += con * dx;
          pres[id1+1] += con * dy;
          pres[id1+2] += con * dz;
        }

        if (!m_fix[id2/3]) {
          pres[id2+0] -= con * dx;
          pres[id2+1] -= con * dy;
          pres[id2+2] -= con * dz;
        }

        eng += ss * ss * m_bondscl;
      }

      int ai, aj, ak;
      float rijx, rijy, rijz;
      float rkjx, rkjy, rkjz;
      float Rij, Rkj;
      float costh, theta, dtheta, eangl;

      float df, Dij, Dkj, sinth;
      float vec_dijx,vec_dijy,vec_dijz;
      float vec_dkjx,vec_dkjy,vec_dkjz;

      for (i=0; i<nang; ++i) {
        ai = m_angls[i].id1 * 3;
        aj = m_angls[i].id2 * 3;
        ak = m_angls[i].id3 * 3;

        rijx = m_posary[ai+0] - m_posary[aj+0];
        rijy = m_posary[ai+1] - m_posary[aj+1];
        rijz = m_posary[ai+2] - m_posary[aj+2];

        rkjx = m_posary[ak+0] - m_posary[aj+0];
        rkjy = m_posary[ak+1] - m_posary[aj+1];
        rkjz = m_posary[ak+2] - m_posary[aj+2];

        // distance
        Rij = sqrt(qlib::max<float>(F_EPS8, rijx*rijx + rijy*rijy + rijz*rijz));
        Rkj = sqrt(qlib::max<float>(F_EPS8, rkjx*rkjx + rkjy*rkjy + rkjz*rkjz));

        // normalization
        float eijx, eijy, eijz;
        float ekjx, ekjy, ekjz;
        eijx = rijx / Rij;
        eijy = rijy / Rij;
        eijz = rijz / Rij;

        ekjx = rkjx / Rkj;
        ekjy = rkjy / Rkj;
        ekjz = rkjz / Rkj;

        // angle
        costh = eijx*ekjx + eijy*ekjy + eijz*ekjz;
        costh = qlib::min<float>(1.0f, qlib::max<float>(-1.0f, costh));
        theta = (::acos(costh));
        //dtheta = (theta - m_angls[i].th0);
        dtheta = qlib::min(0.0f, theta - m_angls[i].th0);
        eangl = m_anglscl*dtheta*dtheta;

        eng += eangl;

        // calc gradient
        df = 2.0*m_anglscl*dtheta;

        sinth = sqrt(qlib::max<float>(0.0f, 1.0f-costh*costh));
        Dij =  df/(qlib::max<float>(F_EPS16, sinth)*Rij);
        Dkj =  df/(qlib::max<float>(F_EPS16, sinth)*Rkj);

        vec_dijx = Dij*(costh*eijx - ekjx);
        vec_dijy = Dij*(costh*eijy - ekjy);
        vec_dijz = Dij*(costh*eijz - ekjz);

        vec_dkjx = Dkj*(costh*ekjx - eijx);
        vec_dkjy = Dkj*(costh*ekjy - eijy);
        vec_dkjz = Dkj*(costh*ekjz - eijz);

        pres[ai+0] += vec_dijx;
        pres[ai+1] += vec_dijy;
        pres[ai+2] += vec_dijz;

        pres[aj+0] -= vec_dijx;
        pres[aj+1] -= vec_dijy;
        pres[aj+2] -= vec_dijz;

        pres[ak+0] += vec_dkjx;
        pres[ak+1] += vec_dkjy;
        pres[ak+2] += vec_dkjz;

        pres[aj+0] -= vec_dkjx;
        pres[aj+1] -= vec_dkjy;
        pres[aj+2] -= vec_dkjz;
      }

      Vector3F pos, dF;
      float f;

      if (m_bUseMap) {
        for (i=0; i<npart; ++i) {
          id1 = i*3;
          pos.x() = m_posary[id1+0];
          pos.y() = m_posary[id1+1];
          pos.z() = m_posary[id1+2];

          f = m_pipol->calcAt(pos) - m_isolev;

          dF = m_pipol->calcDiffAt(pos);
          dF = dF.scale(2.0*f*m_mapscl);

          //F = f^2 = (val-iso)^2;
          //dF = 2*f * d(f);

          pres[id1+0] += dF.x();
          pres[id1+1] += dF.y();
          pres[id1+2] += dF.z();

          eng += f*f*m_mapscl;
        }
      }

      return eng;
    }


    void refine()
    {
      m_bUseProj = true;

      if (m_bUseProj) {
        m_sol.m_pipol = m_pipol;
        m_sol.m_isolev = m_isolev;
        m_sol.m_eps = FLT_EPSILON*100.0f;
      }

      int ncrd = m_posary.size();
      int nbon = m_bonds.size();

      float tolerance = 0.06;
      float deltat = 0.01;// * gsl_blas_dnrm2(x);

      MB_DPRINTLN("set step=%f, tol=%f", deltat, tolerance);

      MB_DPRINTLN("set OK");

      int npart = m_posary.size()/3;
      int id1;
      int iter, i;
      float eng, len, lenmax = -1.0e10;

      for (iter=0; iter<m_nMaxIter; ++iter) {

        eng = calcFdF(m_grad);

        
        for (i=0; i<npart; ++i) {
          id1 = i*3;
          len = sqrt(m_grad[id1+0]*m_grad[id1+0] +
                     m_grad[id1+1]*m_grad[id1+1] +
                     m_grad[id1+2]*m_grad[id1+2]);
          lenmax = qlib::max(lenmax, len);
        }

        if (lenmax>0.1)
          deltat = 0.1/lenmax;
        else
          deltat = 0.1;
        MB_DPRINTLN("grad lenmax = %f scale %f", lenmax, deltat);
        

        for (i=0; i<npart; ++i) {
          id1 = i*3;
          m_posary[id1+0] -= deltat * m_grad[id1+0];
          m_posary[id1+1] -= deltat * m_grad[id1+1];
          m_posary[id1+2] -= deltat * m_grad[id1+2];
        }

        if (m_bUseProj)
          project(NULL);

        MB_DPRINTLN("iter = %d energy=%f", iter, eng);
      }

    }

    //////////

    static inline void copyToGsl(gsl_vector *dst, const std::vector<float> &src)
    {
      int i;
      const int ncrd = src.size();
      for (i=0; i<ncrd; ++i)
        gsl_vector_set(dst, i, src[i]);
    }

    static inline void copyToVec(std::vector<float> &dst, const gsl_vector *src)
    {
      int i;
      const int ncrd = dst.size();
      for (i=0; i<ncrd; ++i)
        dst[i] = float( gsl_vector_get(src, i) );
    }

    static void calc_fdf(const gsl_vector *x, void *params, double *f, gsl_vector *g)
    {
      ParticleRefine *pMin = static_cast<ParticleRefine *>(params);

      copyToVec(pMin->m_posary, x);

      float energy = pMin->calcFdF(pMin->m_grad);

      //printf("copy to gsl %p from vec %p\n", g, &grad);
      if (g!=NULL)
        copyToGsl(g, pMin->m_grad);
      *f = energy;

      // printf("target fdf OK\n");
    }

    static double calc_f(const gsl_vector *x, void *params)
    {
      double energy;
      calc_fdf(x, params, &energy, NULL);
      return energy;
    }

    static void calc_df(const gsl_vector *x, void *params, gsl_vector *g)
    {
      double dummy;
      calc_fdf(x, params, &dummy, g);
    }

    FindProjSurf m_sol;

    void project(gsl_vector *x)
    {
      int i, id1;
      Vector3F pos;
      float del;
      int ncrds = m_posary.size();
      int npart = ncrds/3;

      if (x)
        copyToVec(m_posary, x);

      for (i=0; i<npart; ++i) {
        id1 = i*3;
        pos.x() = m_posary[id1+0];
        pos.y() = m_posary[id1+1];
        pos.z() = m_posary[id1+2];
        m_sol.setup(pos);
        if (m_sol.solve(del)) {
          pos = m_sol.getV(del);
          m_posary[id1+0] = pos.x();
          m_posary[id1+1] = pos.y();
          m_posary[id1+2] = pos.z();
        }
        else {
          MB_DPRINTLN("proj failed.");
        }
      }

      if (x)
        copyToGsl(x, m_posary);
    }


    void refineGsl()
    {
      //m_bUseMap = false;

      if (m_bUseProj) {
        m_sol.m_pipol = m_pipol;
        m_sol.m_isolev = m_isolev;
        m_sol.m_eps = FLT_EPSILON*100.0f;
      }

      int ncrd = m_posary.size();
      int nbon = m_bonds.size();

      gsl_multimin_function_fdf targ_func;

      MB_DPRINTLN("ncrd=%d, nbond=%d\n", ncrd, nbon);
      targ_func.n = ncrd;
      targ_func.f = calc_f;
      targ_func.df = calc_df;
      targ_func.fdf = calc_fdf;
      targ_func.params = this;

      const gsl_multimin_fdfminimizer_type *pMinType;
      gsl_multimin_fdfminimizer *pMin;

      pMinType = gsl_multimin_fdfminimizer_steepest_descent;
      //pMinType = gsl_multimin_fdfminimizer_conjugate_pr;
      //pMinType = gsl_multimin_fdfminimizer_conjugate_fr;
      //pMinType = gsl_multimin_fdfminimizer_vector_bfgs2;

      pMin = gsl_multimin_fdfminimizer_alloc(pMinType, ncrd);

      gsl_vector *x = gsl_vector_alloc(ncrd);
      copyToGsl(x, m_posary);
      float tolerance = 0.06;
      double step_size = 0.1 * gsl_blas_dnrm2(x);

      MB_DPRINTLN("set step=%f, tol=%f", step_size, tolerance);

      gsl_multimin_fdfminimizer_set(pMin, &targ_func, x, step_size, tolerance);
      MB_DPRINTLN("set OK");

      int iter=0, status;

      do {
        iter++;
        status = gsl_multimin_fdfminimizer_iterate(pMin);

        if (m_bUseProj)
          project(pMin->x);

        if (status)
          break;

        status = gsl_multimin_test_gradient(pMin->gradient, 1e-3);

        if (status == GSL_SUCCESS)
          MB_DPRINTLN("Minimum found");

        MB_DPRINTLN("iter = %d energy=%f", iter, pMin->f);
      }
      while (status == GSL_CONTINUE && iter < m_nMaxIter);

      MB_DPRINTLN("status = %d", status);
      copyToVec(m_posary, pMin->x);

      //printf("Atom0 %f,%f,%f\n", pMol->m_crds[0], pMol->m_crds[1], pMol->m_crds[2]);

      gsl_multimin_fdfminimizer_free(pMin);
      gsl_vector_free(x);
    }

    bool m_bUseAdp;


    template <typename T>
    inline static T sqr(T val) { return val*val; }
  
    inline static void mkevec(const Matrix3F &mat, const Vector3F &ev, Matrix3F &evecs, int i, int j, int k)
    {
      Vector4D v1;
      v1.x() = (mat.aij(1,1)-ev.ai(j))*(mat.aij(1,1)-ev.ai(k)) + mat.aij(1,2)*mat.aij(2,1) + mat.aij(1,3)*mat.aij(3,1);
      v1.y() = (mat.aij(1,1)-ev.ai(j))*mat.aij(1,2) + mat.aij(1,2)*(mat.aij(2,2)-ev.ai(k)) + mat.aij(1,3)*mat.aij(3,2);
      v1.z() = (mat.aij(1,1)-ev.ai(j))*mat.aij(1,3) + mat.aij(1,2)*mat.aij(2,3) + mat.aij(1,3)*(mat.aij(3,3)-ev.ai(k));
      
      double len1 = sqrt( sqr(v1.x()) + sqr(v1.y()) + sqr(v1.z()));
      evecs.aij(1,i) = v1.x() / len1;
      evecs.aij(2,i) = v1.y() / len1;
      evecs.aij(3,i) = v1.z() / len1;
    }

    inline static void mat33_diag(const Matrix3F &mat, Matrix3F &evecs, Vector3F &evals)
    {
      double p1 = sqr( mat.aij(1,2) ) + sqr( mat.aij(1,3) ) + sqr( mat.aij(2,3) );

      if (p1==0.0) {
        evals.x() = mat.aij(1,1);
        evals.y() = mat.aij(2,2);
        evals.z() = mat.aij(3,3);
      }
      else {
        Matrix3F I;

        double q = (mat.aij(1,1) + mat.aij(2,2) + mat.aij(3,3))/3.0;
        double p2 = sqr(mat.aij(1,1) - q) + sqr(mat.aij(2,2) - q) + sqr(mat.aij(3,3) - q) + 2.0 * p1;
        double p = sqrt(p2 / 6.0);

        //B = (1 / p) * (A - q * I); // I is the identity matrix
        Matrix3F B = (mat - I.scale(q)).scale(1.0/p);

        double r = B.deter() / 2.0;

        // In exact arithmetic for a symmetric matrix  -1 <= r <= 1
        // but computation error can leave it slightly outside this range.
        double phi;
        if (r <= -1.0)
          phi = M_PI / 3.0;
        else if (r >= 1.0)
          phi = 0.0;
        else
          phi = acos(r) / 3.0;

        // the eigenvalues satisfy eig3 <= eig2 <= eig1
        evals.x() = q + 2.0 * p * cos(phi);
        evals.y() = q + 2.0 * p * cos(phi + (2.0*M_PI/3));
        evals.z() = 3.0 * q - evals.x() - evals.y();     // since trace(A) = eig1 + eig2 + eig3


        if (evals.x()<=evals.y() &&
            evals.x()<=evals.z())
          mkevec(mat, evals, evecs, 1, 2, 3);
        else if (evals.y()<=evals.x() &&
                 evals.y()<=evals.z())
          mkevec(mat, evals, evecs, 1, 3, 1);
        else
          mkevec(mat, evals, evecs, 1, 1, 2);
      }
    }

    float calcMaxCurv(const Vector3F &pos) const
    {
      Matrix3F ct;
      Vector3F grad;
      m_pipol->calcCurvAt(pos, &ct, &grad, NULL);
      //Matrix3F ctd = m_pipol->calcDscCurvAt(vm);
      //ctd -= ct;

      float len = grad.length();
      Vector3F n = grad.divide(len);

      Matrix3F P(1.0f -n.x()*n.x(), -n.x()*n.y(), -n.x()*n.z(),
                 -n.y()*n.x(), 1.0f -n.y()*n.y(), -n.y()*n.z(),
                 -n.z()*n.x(), - n.z()*n.y(), 1.0f -n.z()*n.z());

      Matrix3F G = P*ct*P;
      G /= len;

      Matrix3F ctu;
      Vector3F evals;
      mat33_diag(G, ctu, evals);

      evals.x() = qlib::abs(evals.x());
      evals.y() = qlib::abs(evals.y());
      evals.z() = qlib::abs(evals.z());

      if (evals.x()>=evals.y() &&
          evals.x()>=evals.z())
        return evals.x();
      else if (evals.y()>=evals.x() &&
               evals.y()>=evals.z())
        return evals.y();
      else
        return evals.z();
    }

    float calcHImpl2(const Vector3F &v0, const Vector3F &v1) const
    {
      Vector3F vm = (v0 + v1).scale(0.5);
      float c = calcMaxCurv(vm);

      //float rval = 2.0 * sin(qlib::toRadian(160.0)*0.5)/c;
      float rval = 0.25 / c;

      return rval;
    }
    
    float calcHImpl1(const Vector3F &v0, const Vector3F &v1, float lo, float hi) const
    {
      Vector3F g0 = calcNorm(v0);
      Vector3F g1 = calcNorm(v1);
      float angl = acos(g0.dot(g1));
      
      const float h00 = hi;
      const float h90 = lo;
      const float d90 = qlib::toRadian(30.0f);

      float rval;
      if (angl<d90) {
        rval = angl/d90 * (h90-h00) + h00;
      }
      else {
        rval = h90;
      }
      //MB_DPRINTLN("%f %f", angl, rval);

      return rval;
    }
      

    void refineSetup(MapBsplIpol *pipol, Mesh &cgm)
    {
      int i;
      Vector3F pt;

      m_pipol = pipol;
      // m_isolev = m_dLevel;
      m_bUseMap = true;
      m_bUseProj = false;

      int nv = cgm.number_of_vertices();
      int nf = cgm.number_of_faces();
      int ne = cgm.number_of_edges();
      int nangl = 0;
      /*for(vid_t vd : cgm.vertices()){
      nangl += cgm.degree(vd);
    }*/
      
      allocData(nv, ne, nangl);

      i=0;
      for(vid_t vd : cgm.vertices()){
        pt = convToV3F( cgm.point(vd) );
        setPos(i, int(vd), pt);
        ++i;
      }

      Vector3F v0, v1;
      i=0;
      float edge_len = 0.0f;
      for(Mesh::Edge_index ei : cgm.edges()){
        v0 = convToV3F(cgm.point( cgm.target(cgm.halfedge(ei, 0))));
        v1 = convToV3F(cgm.point( cgm.target(cgm.halfedge(ei, 1))));
        edge_len += (v0-v1).length();
        i++;
      }
      edge_len /= float(i);
      MB_DPRINTLN("average edge length: %f", edge_len);

      i=0;
      for(Mesh::Edge_index ei : cgm.edges()){
        Mesh::Halfedge_index h0 = cgm.halfedge(ei, 0);
        vid_t vid0 = cgm.target(h0);
        Mesh::Halfedge_index h1 = cgm.halfedge(ei, 1);
        vid_t vid1 = cgm.target(h1);

        setBond(i, int(vid0), int(vid1), edge_len * 1.2);
        ++i;
        if (cgm.is_border(ei)) {
          setFixed(int(vid0));
          setFixed(int(vid1));
        }
      }

      /*
    i=0;
    int j;
    for(vid_t vd : cgm.vertices()){
      int ndgr = cgm.degree(vd);
      std::vector<vid_t> svs(ndgr);
      j=0;
      BOOST_FOREACH(vid_t avd, vertices_around_target(cgm.halfedge(vd), cgm)){
        svs[j] = avd;
        ++j;
      }
      float anglsum = 0.0f;
      for (j=0; j<ndgr; ++j) {
        anglsum += calcAngle(int(svs[j]), int(vd), int(svs[(j+1)%ndgr]));
      }
      for (j=0; j<ndgr; ++j) {
        setAngle(i, int(svs[j]), int(vd), int(svs[(j+1)%ndgr]), anglsum/ndgr);
        ++i;
        ++j;
      }
    }
       */

    }

    void setAdpBondWeights(Mesh &cgm, float lo, float hi)
    {
      m_bUseAdp = true;
      const int nbon = m_bonds.size();

      Vector3F v0, v1;
      int id1, id2, i;
      i=0;
      float edge_len = 0.0f;
      for(i=0; i<nbon; ++i){
        id1 = m_bonds[i].id1 * 3;
        id2 = m_bonds[i].id2 * 3;
        v0 = Vector3F(&m_posary[id1+0]);
        v1 = Vector3F(&m_posary[id2+0]);
        edge_len += (v0-v1).length();
      }
      edge_len /= float(nbon);
      MB_DPRINTLN("average edge length: %f", edge_len);

      float fh = 1.0f;

      i=0;
      for(i=0; i<nbon; ++i){
        id1 = m_bonds[i].id1 * 3;
        id2 = m_bonds[i].id2 * 3;
        v0 = Vector3F(&m_posary[id1+0]);
        v1 = Vector3F(&m_posary[id2+0]);
        fh = calcHImpl2(v0, v1);
        m_bonds[i].r0 = fh; //aedge_len * fh * 0.8;
      }
    }

    void showMeshCurvCol(DisplayContext *pdl, const Mesh &cgm)
    {
      int i;
      int id1, id2;
      Vector3F v0, v1;
      
      pdl->setLineWidth(3.0);
      pdl->setLighting(false);
      pdl->startLines();
      //pdl->color(r,g,b);
      float cmin=1.0e10, cmax=-1.0e10;

      const int nbon = m_bonds.size();
      for(i=0; i<nbon; ++i){
        id1 = m_bonds[i].id1 * 3;
        id2 = m_bonds[i].id2 * 3;
        v0 = Vector3F(&m_posary[id1+0]);
        v1 = Vector3F(&m_posary[id2+0]);
        float c = calcMaxCurv((v0+v1).scale(0.5));
        cmin = qlib::min(c,cmin);
        cmax = qlib::max(c,cmax);
        pdl->color(gfx::SolidColor::createHSB(c/3.0, 1, 1));
        pdl->vertex(v0);
        pdl->vertex(v1);
      }
      pdl->end();
      pdl->setLighting(true);
    }

    void writeResult(Mesh &cgm)
    {
      Vector3F vnew;
      for(vid_t vd : cgm.vertices()){
        vnew = getPos(int(vd));
        cgm.point(vd) = convToCGP3(vnew);
      }
    }

  };

  void dumpEdgeStats(const LString &fname, const Mesh &cgm, const MapBsplIpol &ip)
  {
    FILE *fp = fopen(fname, "w");
    int i, j;

    Vector3F v0, v1;
    float angl;

    ParticleRefine pr;
    pr.m_pipol = &ip;

    i=0;
    for(Mesh::Edge_index ei : cgm.edges()){
      Mesh::Halfedge_index h0 = cgm.halfedge(ei, 0);
      vid_t vid0 = cgm.target(h0);
      Mesh::Halfedge_index h1 = cgm.halfedge(ei, 1);
      vid_t vid1 = cgm.target(h1);

      v0 = convToV3F(cgm.point( vid0 ));
      v1 = convToV3F(cgm.point( vid1 ));

      float c = pr.calcMaxCurv((v0+v1).scale(0.5));

      Vector3F g0 = ( ip.calcDiffAt(v0) ).normalize();
      Vector3F g1 = ( ip.calcDiffAt(v1) ).normalize();
      angl = acos(g0.dot(g1));

      fprintf(fp, "Edge %d len %f diffcuv %f cuv %f il %f\n",
              i, (v0-v1).length(), qlib::toDegree(angl), c, 2.0 * sin(qlib::toRadian(160.0)*0.5)/c);
      ++i;
    }

    fclose(fp);
  }
  

}

