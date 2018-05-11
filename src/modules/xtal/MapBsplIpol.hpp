// -*-Mode: C++;-*-
//
// Map 3rd order B-spline interpolator
//
// $Id$

#ifndef XTAL_MAP_BSPL_IPOL_HPP_INCLUDED
#define XTAL_MAP_BSPL_IPOL_HPP_INCLUDED

#include "xtal.hpp"

#include <qlib/Array.hpp>
#include <qlib/Matrix3T.hpp>

namespace xtal {

  using qlib::FloatArray;
  using qlib::Matrix3F;

  class MapBsplIpol
  {
  //private:
  public:
    FloatArray *m_pBsplCoeff;

  public:
    MapBsplIpol()
         : m_pBsplCoeff(NULL)
    {
    }
    
    ~MapBsplIpol()
    {
      if (m_pBsplCoeff!=NULL)
        delete m_pBsplCoeff;
    }
    

    float calcAt(const Vector3F &pos) const;

    Vector3F calcDiffAt(const Vector3F &pos, float *rval=NULL) const;

    /// for debugging
    Vector3F calcDscDiffAt(const Vector3F &pos) const;

    void calcCurvAt(const Vector3F &pos,
                    Matrix3F *pcurv,
                    Vector3F *pgrad,
                    float *rval) const;

    /// for debugging
    Matrix3F calcDscCurvAt(const Vector3F &pos) const;


    std::complex<float> calc_cm2(int i, int N);

    void calcCoeffs(DensityMap *pXtal);

    float m_curv_scl;
    float m_lmin;
    float m_lmax;

    float calcIdealL(const Vector3F &pos) const
    {
      float c = calcMaxCurv(pos);
      //float rval = 2.0 * sin(qlib::toRadian(160.0)*0.5)/c;
      //float rval = qlib::min(m_curv_scl/c, m_ideall_max);
      return qlib::clamp(m_curv_scl/c, m_lmin, m_lmax);
    }
    
    float calcMaxCurv(const Vector3F &pos) const
    {
      Matrix3F ct;
      Vector3F grad;
      calcCurvAt(pos, &ct, &grad, NULL);
      //Matrix3F ctd = calcDscCurvAt(vm);
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


  };

  class MapCrossValSolver
  {
  public:
    
    float m_isolev;
    
    float m_eps;

    MapBsplIpol *m_pipol;

  public:
    MapCrossValSolver()
         : m_pipol(NULL)
    {
    }
    
    inline bool isNear(float f0, float f1) const
    {
      float del = qlib::abs(f0-f1);
      if (del<m_eps)
        return true;
      else
        return false;
    }

    bool getXValFNrImpl1(const Vector3F &vec0, const Vector3F &dv, float rho, float &rval) const
    {
      float frho, dfrho;
      Vector3F vrho, dvrho;
      int i, j;

      bool bConv = false;
      for (i=0; i<10; ++i) {
        vrho = vec0 + dv.scale(rho);
        frho = m_pipol->calcAt(vrho)-m_isolev;
        if (isNear(frho, 0.0f)) {
          bConv = true;
          break;
        }

        // dvrho = m_pipol->calcDscDiff(vrho);
        dvrho = m_pipol->calcDiffAt(vrho);

        dfrho = dv.dot( dvrho );

        rho += -frho/dfrho;

        if (rho<0.0f || 1.0f <rho) {
          return false;
        }
      }

      rval = rho;
      return true;
    }

    bool solve(float val0, const Vector3F &vec0, float val1, const Vector3F &vec1, Vector3F &rval) const
    {
      // init estim. by lin. intpol
      Vector3F dv = (vec1 - vec0);

      float rho0 = (m_isolev-val0)/(val1-val0);
      float rho_sol;

      float rho = rho0;
      float rhoL = 0.0f;
      float rhoU = 1.0f;

      float fL = val0-m_isolev;
      float fU = val1-m_isolev;

      for (int i=0; i<10; ++i) {
        if (getXValFNrImpl1(vec0, dv, rho, rho_sol)) {
          rval = vec0 + dv.scale(rho_sol);
          return true;
        }

        // Newton method failed --> bracket the solution by Bisec/FP method
        float frho0 = m_pipol->calcAt(vec0 + dv.scale(rho)) - m_isolev;

        // select the upper/lower bounds
        if (frho0*fU<0.0) {
          // find between mid & rhoU
          rhoL = rho;
          fL = frho0;
        }
        else if (frho0*fL<0.0) {
          // find between rhoL & mid
          rhoU = rho;
          fU = frho0;
          //fU = m_pipol->calcAt(vec0 + dv.scale(rhoU)) - m_isolev;
        }
        else {
          MB_DPRINTLN("getXValFNr> inconsistent fL/fU");
          break;
        }

        // Update the solution estimate
        // Bisection
        rho = (rhoL + rhoU)*0.5;
        // FP
        //rho = (rhoL*fU - rhoU*fL)/(fU-fL);
      }
      
      {
        MB_DPRINTLN("getXValFNr failed, rho=%f", rho);
        for (int i=0; i<=100; i++) {
          rho = float(i)/100.0f;
          Vector3F vrho = vec0 + dv.scale(rho);
          float frho = m_pipol->calcAt(vrho) - m_isolev;
          MB_DPRINTLN("%d %f %f", i, rho, frho);
        }
        return false;
      }
    }

  };

}

#endif


