// -*-Mode: C++;-*-
//
// Mesh refine routines for MapIpolSurf
//

#define GSL_DLL 1
#include <gsl/gsl_multimin.h>
#include <gsl/gsl_blas.h>

namespace xtal {

  class FindProjSurf
    {
    public:
      MapBsplIpol *m_pipol;
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
      MapBsplIpol *m_pipol;

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

      void setup(int npos, int nbond, int nangl=0) {
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

          int nbon = m_bonds.size();
          int nang = m_angls.size();
          int ncrds = m_posary.size();
          int npart = ncrds/3;

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
            ss = qlib::max(0.0f,  len - m_bonds[i].r0);
            //ss = qlib::min(0.0f,  len - m_bonds[i].r0);
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
      

      void refine()
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

    };

}

